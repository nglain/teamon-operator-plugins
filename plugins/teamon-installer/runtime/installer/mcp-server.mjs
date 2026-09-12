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
  const server=new McpServer({name:'teamon-installer',version:'0.1.0'},
    {instructions:'Open installer_open to show the installation card first. It does not install. The user starts installation inside the card. Do not run parallel CLI installation or repeat a failed start. After the Begin message, continue onboarding in this chat: discover TeamON Operator tools, check installation_status, and offer account_login_open if needed. If tools are unavailable after discovery, ask once to select @TeamON Operator; do not reinstall a healthy package. The user enters credentials only on the secure browser page. After their confirmation, refresh installation_status with refresh_account:true, ask which company to use, check only that company, and explain the ordinary chat workflow with a short guide. Do not list all companies without a request, demonstrate writes, or promise a separate Operator dashboard. Package installation, chat activation, login and company access are separate verified states; do not stop at an installation test report.'});
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
