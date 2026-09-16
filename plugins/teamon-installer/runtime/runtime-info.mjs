import {createHash, randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {z} from 'zod';

const processInstanceId = randomUUID();
const processStartedAt = new Date(Date.now() - process.uptime() * 1000).toISOString();
let build = null;
try {
  const value = JSON.parse(readFileSync(new URL('./build-info.json', import.meta.url), 'utf8'));
  if (/^[a-f0-9]{40}$/.test(value.sourceCommit) && typeof value.dirty === 'boolean') {
    build = {sourceCommit:value.sourceCommit, dirty:value.dirty};
  }
} catch { /* Source checkout or missing/invalid stamp: provenance is unknown. */ }

// REQ-OP-RUNTIME-INFO: captures the running server, not the host's tool inventory.
export function registerRuntimeInfo(server, {toolName, serverName, version}) {
  const names = new Set();
  const register = server.registerTool.bind(server);
  server.registerTool = (name, definition, handler) => {
    const registered = register(name, definition, handler);
    names.add(name);
    return registered;
  };
  server.registerTool(toolName, {
    description:'Read this running MCP process version, build provenance and registered tool names. No installation, login, company access or repair. This does not prove tools are visible in the host.',
    inputSchema:{},
    outputSchema:{schemaVersion:z.literal(1),serverName:z.string(),version:z.string(),
      sourceCommit:z.string().nullable(),buildDirty:z.boolean().nullable(),provenance:z.enum(['build_stamp','unknown']),
      processInstanceId:z.string().uuid(),processStartedAt:z.string(),toolCount:z.number().int(),
      toolNames:z.array(z.string()),toolNamesHash:z.string(),inventoryScope:z.literal('server_registered_names_not_host_visibility')},
    annotations:{readOnlyHint:true, destructiveHint:false, idempotentHint:true, openWorldHint:false}
  }, async () => {
    const toolNames = [...names].sort();
    const info = {schemaVersion:1, serverName, version, sourceCommit:build?.sourceCommit ?? null,
      buildDirty:build?.dirty ?? null, provenance:build ? 'build_stamp' : 'unknown',
      processInstanceId, processStartedAt, toolCount:toolNames.length, toolNames,
      toolNamesHash:'sha256:' + createHash('sha256').update(JSON.stringify(toolNames)).digest('hex'),
      inventoryScope:'server_registered_names_not_host_visibility'};
    return {content:[{type:'text',text:JSON.stringify(info,null,2)}], structuredContent:info};
  });
}
