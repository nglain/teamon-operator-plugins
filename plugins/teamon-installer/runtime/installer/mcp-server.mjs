import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createJob} from './mcp-job.mjs';
import {renderState} from './text-state.mjs';

const result=state=>({content:[{type:'text',text:renderState(state)}],structuredContent:state});
export async function createInstallerServer({job=createJob()}={}) {
  const server=new McpServer({name:'teamon-installer',version:'0.1.3'}, {
    instructions:'Text-only TeamON installer. No MCP Apps, HTML, Visualize, buttons or progress bars. On an explicit install/continue-installation request call installer_open, show its ASCII state, then call installer_start once for the returned ready runId under normal host approval. Open/status alone do not install. Poll installer_status for that exact run about every 3-5 seconds while running; show only changed stages, no artificial percentages or timers. Never run parallel CLI installation. After a lost response inspect the same run; never create a fresh installation automatically. completed means package installed, NOT Operator connected or signed in. Follow teamon-operator-install.md from this conversation: after package verification, if Operator tools are missing, prepare its native plugin-mention draft in this same thread using the guide and let the human send it. Never auto-submit or replace a known user draft. If the guide or supported handoff is unavailable, ask for native @TeamON Operator selection and a login/workspace request. Plain text @ alone is not activation; rediscover tools after submission. Once Operator tools are available, use installation_status, account_login_open if needed, refresh_account:true after browser consent, then workspace_open and open its returned URL. Never substitute Master admin. Preserve saved credentials and disabled connections; do not demonstrate company writes. If tools do not attach after selection, diagnose host plugin inventory; do not loop on reinstalls or new tasks.'
  });
  server.registerTool('installer_open', {
    description:'Read the current installation run and its ASCII status. No installation, browser, UI resource or company access.',
    inputSchema:{},annotations:{readOnlyHint:true}
  },async()=>result(job.snapshot()));
  server.registerTool('installer_start', {
    description:'Install the official TeamON Operator package once for this exact run. Use only on an explicit request to install/continue installation, under normal host approval. No login or company access.',
    inputSchema:{runId:z.string().uuid()},
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:true}
  },async({runId})=>result(job.start(runId)));
  server.registerTool('installer_status', {
    description:'Read confirmed stages of the exact run. Never starts or retries installation.',
    inputSchema:{runId:z.string().uuid()},annotations:{readOnlyHint:true}
  },async({runId})=>result(job.inspect(runId)));
  return {server,job,close:async()=>{await job.close();await server.close();}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const app=await createInstallerServer();
  await app.server.connect(new StdioServerTransport());
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void app.close());
  process.stdin.once('end',()=>void app.close());
}
