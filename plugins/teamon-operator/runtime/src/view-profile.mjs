import { z } from 'zod';
import { open, mkdir, rename, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const tab = z.enum(['activity','messages','deferred','dialogues','context','settings']);
const tabs = z.array(tab).max(6).refine(v => new Set(v).size === v.length, 'Duplicate tabs');
export const viewOptions = z.strictObject({
  theme:z.enum(['auto','light','dark']).optional(), density:z.enum(['comfortable','compact']).optional(),
  sidebarWidth:z.number().int().min(180).max(360).optional(), tabOrder:tabs.optional(), hiddenTabs:tabs.optional(),
  showDate:z.boolean().optional(), showDuration:z.boolean().optional(), showAnswer:z.boolean().optional()
});
const revisionOf = bytes => createHash('sha256').update(bytes).digest('hex');
const empty = () => ({schemaVersion:1, overrides:{}, previous:null});
const known = value => viewOptions.parse(Object.fromEntries(Object.entries(value).filter(([key]) => Object.hasOwn(viewOptions.shape,key))));

export class ViewProfile {
  constructor(file) { this.file = file; }
  async raw() {
    let handle;
    try {
      handle = await open(this.file, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 16384) throw new Error('invalid_view_profile');
      const bytes = await handle.readFile('utf8');
      const data = JSON.parse(bytes);
      if (data.schemaVersion !== 1 || !data.overrides || typeof data.overrides !== 'object' || Array.isArray(data.overrides)
        || (data.previous !== null && (!data.previous || typeof data.previous !== 'object' || Array.isArray(data.previous)))) throw new Error('invalid_view_profile');
      known(data.overrides); if (data.previous) known(data.previous);
      return { data, revision:revisionOf(bytes) };
    } catch (e) { if (e.code === 'ENOENT') return {data:empty(),revision:revisionOf('')}; throw e; }
    finally { await handle?.close(); }
  }
  async read() {
    try {
      const {data,revision} = await this.raw();
      return {revision,overrides:known(data.overrides),canUndo:data.previous !== null,warning:null};
    } catch {
      return {revision:null,overrides:{},canUndo:false,warning:'Личный вид не удалось прочитать. Показан стандартный; файл сохранён без изменений.'};
    }
  }
  async update({expected_revision, action = 'patch', patch = {}}) {
    viewOptions.parse(patch);
    if(!['patch','undo','reset'].includes(action)) throw new Error('invalid_view_action');
    if(action !== 'patch' && Object.keys(patch).length) throw new Error('view_profile_ambiguous_action: undo/reset cannot include a patch');
    await mkdir(path.dirname(this.file), {recursive:true,mode:0o700});
    let lock, handle; const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      try { lock = await open(`${this.file}.lock`, 'wx', 0o600); }
      catch(e) { if(e.code === 'EEXIST') throw new Error('view_profile_busy: read again before retrying'); throw e; }
      const {data,revision} = await this.raw();
      if(revision !== expected_revision) throw new Error('view_profile_changed: read again before editing');
      if(action === 'undo' && data.previous === null) throw new Error('view_profile_no_previous');
      const overrides = action === 'undo' ? data.previous : action === 'reset' ? {} : {...data.overrides,...patch};
      // Repeating an already-applied preference must not consume the undo slot.
      if(isDeepStrictEqual(overrides,data.overrides)) return {revision,overrides:known(data.overrides),canUndo:data.previous !== null,warning:null};
      const bytes = JSON.stringify({...data,overrides,previous:data.overrides});
      if(Buffer.byteLength(bytes)>16384) throw new Error('view_profile_too_large');
      handle = await open(temporary,'wx',0o600);
      await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
      await rename(temporary,this.file);
      return {revision:revisionOf(bytes),overrides:known(overrides),canUndo:true,warning:null};
    } finally {
      await handle?.close();
      await unlink(temporary).catch(e => { if(e.code !== 'ENOENT') throw e; });
      if(lock) { await lock.close(); await unlink(`${this.file}.lock`); }
    }
  }
}

export function registerViewProfile(server, config) {
  const store = new ViewProfile(config.file ? `${config.file}.view.json` : path.join(config.stateRoot,'view.json'));
  const outputSchema = {revision:z.string().nullable(),overrides:viewOptions,canUndo:z.boolean(),warning:z.string().nullable()};
  const result = value => ({structuredContent:value,content:[{type:'text',text:JSON.stringify(value)}]});
  server.registerTool('workspace_view_read', {
    description:'Read this local installation’s personal presentation profile. No company data. Use before workspace_view_update; survives package updates, not synced between computers.',
    inputSchema:{},outputSchema,annotations:{readOnlyHint:true,openWorldHint:false}
  }, async () => result(await store.read()));
  server.registerTool('workspace_view_update', {
    description:'Only on the human’s request, change local presentation, never agents, data, permissions or pinned context. Read workspace_view_read first; patch only requested options, or undo/reset. No arbitrary code. Active Apps refresh within 5 seconds; manually selected Standard remains Standard. Damaged profiles are never overwritten.',
    inputSchema:{expected_revision:z.string().regex(/^[a-f0-9]{64}$/),action:z.enum(['patch','undo','reset']).default('patch'),patch:viewOptions.optional()},
    outputSchema,annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false},
    _meta:{ui:{visibility:['model']}}
  }, async args => result(await store.update(args)));
}
