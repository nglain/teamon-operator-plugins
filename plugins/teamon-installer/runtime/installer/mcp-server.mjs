import {McpServer,ResourceTemplate} from '@modelcontextprotocol/sdk/server/mcp.js';
import {McpError,ErrorCode} from '@modelcontextprotocol/sdk/types.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createJob} from './mcp-job.mjs';

// Current discovery gets a fresh cache key. Older progress keys remain compatible
// aliases within this v1 tool/state protocol: the host can retain old tool metadata
// while routing resources/read to an upgraded process. They are NOT integrity URLs.
export const uiResourceUri=html=>`ui://teamon-installer/progress-${createHash('sha256').update(html).digest('hex')}.html`;
const html=await readFile(new URL('./mcp-view.html',import.meta.url),'utf8');
export const UI=uiResourceUri(html);
const result=s=>({content:[{type:'text',text:JSON.stringify(s)}],structuredContent:s});
export async function createInstallerServer({job=createJob()}={}) {
  const server=new McpServer({name:'teamon-installer',version:'0.1.2'},
    {instructions:'Open installer_open to show the installation card first. It does not install. The user starts installation inside the card. Do not run parallel CLI installation or repeat a failed start. After Begin, continue in this chat: discover TeamON Operator, check installation_status, use account_login_open if login is needed, and wait for the person to sign in on the secure browser page. Never ask for passwords or tokens in chat. After confirmation use installation_status with refresh_account:true. Then call workspace_open and open the returned local URL in the host browser: the HTML Operator workspace, NOT Master administration or a private snapshot. Help the user select a company; if instance_login_required, use instance_login_open for that exact company and wait for consent, then retry its read. Finish with a short guide for selecting an agent, user and appeal and discussing that context in this chat. Missing chat tools require selecting @TeamON Operator, not reinstalling a healthy package. Missing workspace_open means the running Operator is older than 0.2.12: explain the version gap and reconnect the updated plugin. Installation, chat activation, login, workspace visibility and company access are separate verified states. Do not demonstrate writes or stop at an installation test report.'});
  const readProgress=async uri=>({contents:[{
    uri:String(uri),mimeType:'text/html;profile=mcp-app',text:html,
    _meta:{ui:{prefersBorder:true,csp:{connectDomains:[],resourceDomains:[]}}}
  }]});
  server.registerResource('installation-progress',UI,{mimeType:'text/html;profile=mcp-app'},readProgress);
  server.registerResource('compatible-installation-progress',
    new ResourceTemplate('ui://teamon-installer/progress-{revision}.html',{list:undefined}),
    {mimeType:'text/html;profile=mcp-app'},async uri=>{
      // No filesystem lookup, redirects, arbitrary hosts/paths or old executable
      // bundles. Only the known screen namespace can receive the compatible view.
      if(!/^ui:\/\/teamon-installer\/progress-(?:[a-f0-9]{64}|v1)\.html$/.test(String(uri)))
        throw new McpError(ErrorCode.InvalidParams,'Unknown installer screen');
      return readProgress(uri);
    });
  server.registerTool('installer_open',{description:'Show the TeamON installation screen in this chat. Read-only; no installation commands.',
    inputSchema:{},annotations:{readOnlyHint:true},_meta:{ui:{resourceUri:UI}}},async()=>result(job.snapshot()));
  server.registerTool('installer_start',{description:'Start the fixed official TeamON Operator installation once for this exact run, only from the displayed card.',
    inputSchema:{runId:z.string().uuid()},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:true},
    _meta:{ui:{visibility:['app']}}},async({runId})=>result(job.start(runId)));
  server.registerTool('installer_status',{description:'Read the exact installer run. Never starts or repeats installation.',
    inputSchema:{runId:z.string().uuid()},annotations:{readOnlyHint:true},_meta:{ui:{visibility:['app','model']}}},
    async({runId})=>result(job.inspect(runId)));
  return {server,job,close:async()=>{await job.close();await server.close();}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const app=await createInstallerServer();
  await app.server.connect(new StdioServerTransport());
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void app.close());
  process.stdin.once('end',()=>void app.close());
}
