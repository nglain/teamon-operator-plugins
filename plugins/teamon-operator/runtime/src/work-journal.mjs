import { nativeJournalEvidence } from './journal-native-evidence.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

const id=z.string().min(1).max(200);
const text=z.string().trim().min(1).max(4000);
export const caseInput=z.strictObject({request_id:id,title:text,objective:text});
export const caseUpdate=z.strictObject({case_id:z.string().uuid(),expected_revision:z.number().int().positive(),status:z.enum(['open','waiting','closed']),next_step:z.string().max(4000),conclusion:z.string().max(4000)});
export const noteInput=z.strictObject({case_id:z.string().uuid(),request_id:id,summary:text,source_ref:text});
export const observationInput=z.strictObject({
  case_id:z.string().uuid(),request_id:id,observation_id:z.string().uuid().optional(),expected_revision:z.number().int().positive().optional(),
  subject:z.enum(['agent','operator','operator_assistant','integration','process']),
  category:z.enum(['completion','wrong_action','context','unverified_success','access','other']).default('other'),
  behavior:text,expected:text,cause:z.string().max(4000),cause_status:z.enum(['hypothesis','supported','refuted','unknown']),
  status:z.enum(['proposed','supported','rejected','insufficient']),
  assistance:z.enum(['unassisted','assisted','operator_direct','operator_delegated','unknown']),
  evidence_ids:z.array(z.string().uuid()).min(1).max(50),
  review_note:z.string().max(4000)
}).refine(x=>!!x.observation_id===!!x.expected_revision,'An update requires both observation ID and revision');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function protectedPath(path){const st=lstatSync(path);if(st.isSymbolicLink()||(!st.isDirectory()&&(!st.isFile()||st.nlink!==1)))throw Error('Unsafe journal path');}

// Local operator journal, scoped by authenticated/configured principal and company.
// It is NOT a native company receipt or a synchronized company database.
export class WorkJournal {
  constructor(root,owner){
    this.owner=id.parse(owner);
    mkdirSync(root,{recursive:true,mode:0o700});protectedPath(root);
    const dir=join(root,'work-journal');mkdirSync(dir,{recursive:true,mode:0o700});protectedPath(dir);chmodSync(dir,0o700);
    const file=join(dir,hash(owner)+'.sqlite');
    try{protectedPath(file)}catch(e){if(e.code!=='ENOENT')throw e}
    this.db=new DatabaseSync(file);chmodSync(file,0o600);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY, company TEXT NOT NULL, request TEXT NOT NULL, digest TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL, UNIQUE(company,request));
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,company TEXT NOT NULL,case_id TEXT REFERENCES cases(id),request TEXT NOT NULL,digest TEXT NOT NULL,body TEXT NOT NULL,UNIQUE(company,request));
      CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY,company TEXT NOT NULL,case_id TEXT NOT NULL REFERENCES cases(id),revision INTEGER NOT NULL,body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS event_scope ON events(company,case_id,seq);`);
  }
  close(){this.db.close()}
  transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const value=fn();this.db.exec('COMMIT');return value}catch(e){this.db.exec('ROLLBACK');throw e}}
  case(company,caseId){const row=this.db.prepare('SELECT body FROM cases WHERE company=? AND id=?').get(company,caseId);if(!row)throw Error('Case unavailable');return JSON.parse(row.body)}
  event(company,eventId){const row=this.db.prepare('SELECT body FROM events WHERE company=? AND id=?').get(company,eventId);if(!row)throw Error('Evidence unavailable');return JSON.parse(row.body)}
  linkedCase(company,input){
    // Only exact returned operation/consultation IDs establish continuity, never time or labels.
    const matches=new Set();
    for(const [field,resultField] of [['operation_id','operationId'],['consultation_id','consultation_id']]){
      if(!input[field])continue;
      const rows=this.db.prepare("SELECT DISTINCT case_id FROM events WHERE company=? AND case_id IS NOT NULL AND json_extract(body,'$.type')='tool_returned' AND json_extract(body,?)=?").all(company,'$.refs.'+resultField,input[field]);
      for(const row of rows)matches.add(row.case_id);
    }
    return matches.size===1?[...matches][0]:null;
  }
  append(company,caseId,request,type,data){
    id.parse(company);if(caseId)this.case(company,caseId);
    const digest=hash({caseId,type,data});
    const previous=this.db.prepare('SELECT digest,body FROM events WHERE company=? AND request=?').get(company,request);
    if(previous){if(previous.digest!==digest)throw Error('Journal request conflict');return JSON.parse(previous.body)}
    const event={...data,id:randomUUID(),company_id:company,case_id:caseId||null,type,time:new Date().toISOString(),recorded_by:'operator_journal',operator_id:this.owner,initiated_by:{id:this.owner,kind:'operator',assurance:'configured_principal'},published_as:null};
    this.db.prepare('INSERT INTO events(id,company,case_id,request,digest,body) VALUES(?,?,?,?,?,?)').run(event.id,company,caseId||null,request,digest,JSON.stringify(event));
    return event;
  }
  open(company,input){input=caseInput.parse(input);return this.transaction(()=>{
    const previous=this.db.prepare('SELECT body,digest FROM cases WHERE company=? AND request=?').get(company,input.request_id);
    if(previous){if(previous.digest!==hash(input))throw Error('Case request conflict');return JSON.parse(previous.body)}
    const item={id:randomUUID(),company_id:company,title:input.title,objective:input.objective,status:'open',revision:1,next_step:'',conclusion:'',created_at:new Date().toISOString(),operator_id:this.owner};
    this.db.prepare('INSERT INTO cases VALUES(?,?,?,?,?,?)').run(item.id,company,input.request_id,hash(input),1,JSON.stringify(item));
    this.append(company,item.id,'case:'+item.id,'case_opened',{authored_via:'operator_assistant',origin:'operator_direct',case:item});return item;
  })}
  update(company,input){input=caseUpdate.parse(input);return this.transaction(()=>{
    const current=this.case(company,input.case_id);if(current.revision!==input.expected_revision)throw Error('Case revision changed');
    if(input.status==='closed'&&!input.conclusion.trim())throw Error('Closing requires a conclusion, not an inferred success');
    if(input.status!=='closed'&&!input.next_step.trim())throw Error('Open work requires an explicit next step');
    const next={...current,status:input.status,next_step:input.next_step,conclusion:input.conclusion,revision:current.revision+1};
    this.db.prepare('UPDATE cases SET body=?,revision=? WHERE id=? AND company=?').run(JSON.stringify(next),next.revision,next.id,company);
    this.append(company,next.id,'case:'+next.id+':'+next.revision,'case_updated',{authored_via:'operator_assistant',origin:'operator_direct',case:next});return next;
  })}
  observe(company,input){input=observationInput.parse(input);return this.transaction(()=>{
    this.case(company,input.case_id);
    const retry=this.db.prepare('SELECT digest,body FROM events WHERE company=? AND request=?').get(company,'observation:'+input.request_id);
    if(retry){const event=JSON.parse(retry.body);if(event.input_digest!==hash(input))throw Error('Observation request conflict');return event.observation}
    for(const key of input.evidence_ids){const evidence=this.event(company,key);if(evidence.case_id!==input.case_id)throw Error('Evidence belongs to another case')}
    if(['supported','rejected'].includes(input.status)&&!input.review_note.trim())throw Error('Review requires an explanation');
    if(input.cause_status!=='unknown'&&!input.cause.trim())throw Error('Cause statement required');
    let previous;
    if(input.observation_id){const row=this.db.prepare('SELECT body FROM observations WHERE id=? AND company=? AND case_id=?').get(input.observation_id,company,input.case_id);if(!row)throw Error('Observation unavailable');previous=JSON.parse(row.body);if(previous.revision!==input.expected_revision)throw Error('Observation revision changed')}
    const item={...input,id:previous?.id||randomUUID(),revision:(previous?.revision||0)+1,company_id:company,operator_id:this.owner,authored_via:'operator_assistant',review_independence:'not_established',updated_at:new Date().toISOString()};
    this.db.prepare('INSERT INTO observations VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,body=excluded.body').run(item.id,company,input.case_id,item.revision,JSON.stringify(item));
    this.append(company,input.case_id,'observation:'+input.request_id,'observation_recorded',{input_digest:hash(input),origin:'operator_direct',observation:item});return item;
  })}
  note(company, input) {
    input = noteInput.parse(input);
    return this.transaction(() => this.append(company, input.case_id,
      'report:' + input.request_id, 'external_report', {
        origin: 'external_report', authored_via: 'operator_assistant',
        verification: 'reported_not_verified', summary: input.summary, source_ref: input.source_ref
      }));
  }
  read(company,{case_id,after=0,limit=50}={}){
    id.parse(company);z.number().int().nonnegative().parse(after);z.number().int().min(1).max(100).parse(limit);
    const item=case_id?this.case(company,case_id):null;
    const rows=case_id?this.db.prepare('SELECT seq,body FROM events WHERE company=? AND case_id=? AND seq>? ORDER BY seq LIMIT ?').all(company,case_id,after,limit+1):this.db.prepare('SELECT seq,body FROM events WHERE company=? AND seq>? ORDER BY seq LIMIT ?').all(company,after,limit+1);
    const events=rows.slice(0,limit).map(r=>({...JSON.parse(r.body),sequence:r.seq}));
    return {storage:'local_operator',sync:'not_connected',coverage:'local_mcp_events_and_attributed_reports',case:item,events,next_cursor:rows.length>limit?events.at(-1).sequence:null};
  }
  list(company,{after=0,limit=50}={}){
    id.parse(company);z.number().int().nonnegative().parse(after);z.number().int().min(1).max(100).parse(limit);
    const rows=this.db.prepare('SELECT rowid,body FROM cases WHERE company=? AND rowid>? ORDER BY rowid LIMIT ?').all(company,after,limit+1);
    return {storage:'local_operator',sync:'not_connected',cases:rows.slice(0,limit).map(r=>JSON.parse(r.body)),next_cursor:rows.length>limit?rows[limit-1].rowid:null};
  }
  patterns(company) {
    id.parse(company);
    const sample = this.db.prepare(
      'SELECT COUNT(DISTINCT case_id) AS cases, COUNT(*) AS observations FROM observations WHERE company=?'
    ).get(company);
    const groups = this.db.prepare(`
      SELECT json_extract(body,'$.subject') AS subject,
             json_extract(body,'$.assistance') AS assistance,
             COALESCE(json_extract(body,'$.category'),'other') AS category,
             COUNT(DISTINCT case_id) AS cases
      FROM observations
      WHERE company=? AND json_extract(body,'$.status')='supported'
      GROUP BY subject, assistance, category
      ORDER BY subject, assistance, category
    `).all(company);
    return {
      storage: 'local_operator', sync: 'not_connected', basis: 'reviewed_operator_sample', independence: 'not_established',
      denominator: sample.cases, denominator_unit: 'cases_with_observations',
      observations: sample.observations, groups,
      note: 'Groups may overlap. This is not the autonomous success/error rate of all agent work.'
    };
  }
}

// Never serialize arbitrary arguments, model text, secret values, errors or URLs.
export function safeCallRefs(input,output){
  const fields=['agent_id','user_id','session_key','operation_id','consultation_id','request_id','expected_revision','expected_context_revision','source_input_id'];
  const refs={};for(const field of fields)if(typeof input[field]==='string'&&input[field].length<=2048)refs[field]=input[field];
  const native=output?.structuredContent||{};
  for(const field of ['operationId','proposalDigest','revision','contextRevision','sourceInputId'])if(typeof native[field]==='string'&&native[field].length<=2048)refs[field]=native[field];
  if(typeof native.state?.revision==='string')refs.configuration_revision=native.state.revision.slice(0,200);
  if(typeof native.consultation?.id==='string')refs.consultation_id=native.consultation.id.slice(0,200);
  return refs;
}

export async function journalCall({store,company,caseId,tool,input,run,runtime}){
  if(caseId)store.case(company,caseId);
  const callId=randomUUID();let start,writeError=false;
  const record=(request,type,data)=>{try{return store.append(company,caseId,request,type,data)}catch{writeError=true;return null}};
  const origin=tool==='agent_consult'?'operator_delegated':'operator_direct';
  start=record(callId+':start','tool_started',{call_id:callId,tool,origin,requested_via:'mcp',evidence_level:'mcp_boundary',executed_by:'operator_mcp',refs:safeCallRefs(input)});
  try{
    const output=await run();
    const finish=record(callId+':finish','tool_returned',{call_id:callId,tool,origin,executed_by:'operator_mcp',status:output?.isError?'tool_error':'returned',effect_status:'not_inferred',refs:safeCallRefs(input,output)});
    let nativeEvent;
    try {
      const evidence = nativeJournalEvidence(runtime, tool, input, output);
      if (evidence) nativeEvent = record(callId + ':native', 'native_receipt_observed', {
        call_id: callId, tool, origin, source_event_id: finish?.id || null,
        evidence_level: 'native_receipt', evidence
      });
    } catch { writeError = true; }
    return {...output,_meta:{...output?._meta,operator_journal:{case_id:caseId||null,event_id:finish?.id||start?.id||null,native_event_id:nativeEvent?.id||null,storage:'local_operator',status:writeError?'incomplete':'recorded'}}};
  }catch(error){record(callId+':finish','tool_failed',{call_id:callId,tool,origin,executed_by:'operator_mcp',status:'failed',effect_status:'unknown',refs:safeCallRefs(input)});throw error}
}
