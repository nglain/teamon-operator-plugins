import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Explicit business-read surface, never credentials, login, inference or writers.
export const WORKSPACE_READS = new Set(['fleet_list','instance_inspect','agent_inspect',
  'activity_read','conversations_list','conversation_read','context_read',
  'agent_configuration_read','agent_documents_list','agent_document_read',
  'automations_list','operator_reminders_read','journal_read']);

export async function openWorkspaceServer(read) {
  const prefix = '/'+randomBytes(32).toString('hex')+'/';
  const html = await readFile(new URL('./workspace.html',import.meta.url),'utf8');
  let origin;
  const server = http.createServer(async(req,res)=>{
    const send=(code,body,type='application/json')=>{
      res.writeHead(code,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store',
        'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
        'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});
      res.end(typeof body==='string'?body:JSON.stringify(body));
    };
    if(req.headers.host!==new URL(origin).host ||
       (req.headers.origin && req.headers.origin!==origin) ||
       req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'Origin denied'});
    if(req.url===prefix && req.method==='GET')return send(200,html,'text/html');
    if(req.url!==prefix+'read')return send(404,{error:'Not found'});
    if(req.method!=='POST')return send(405,{error:'POST required'});
    if(req.headers.origin!==origin || req.headers['content-type']!=='application/json')return send(403,{error:'Origin required'});
    let size=0,body='';
    try {
      for await(const part of req){size+=part.length;if(size>16384){send(413,{error:'Request too large'});return;}body+=part;}
      const input=JSON.parse(body);
      if(!WORKSPACE_READS.has(input.name))return send(403,{error:'Read not allowed'});
      const value=await read(input.name,input.arguments||{});
      return send(200,value);
    } catch(error) {
      const known=['instance_login_required','account_login_required','account_changed','account_reconnect_required','not_configured','account_service_unavailable'];
      const code=known.find(code=>String(error.message).includes(code));
      return send(400,{error:code||'Read unavailable. Check the selected company in Operator chat.'});
    }
  });
  server.requestTimeout=30000;server.headersTimeout=10000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  origin='http://127.0.0.1:'+server.address().port;
  return {url:origin+prefix,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()})};
}
