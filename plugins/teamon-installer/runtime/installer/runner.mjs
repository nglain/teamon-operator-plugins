#!/usr/bin/env node
// Standalone, built-in Node modules only. No Operator runtime import or private registry reads.
import http from 'node:http';
import {spawn} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,open,unlink,realpath} from 'node:fs/promises';
import {homedir,tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const SOURCE='https://github.com/nglain/teamon-operator-plugins.git';
export const MARKET='teamon-operator',PLUGIN='teamon-operator@teamon-operator';
export const steps=[['Среда',4],['Каталог',25],['Пакет',45],['Включение',4],['Проверка',6]];
export class InstallError extends Error {constructor(code,message){super(message);this.code=code;}}
const fail=(code,message)=>{throw new InstallError(code,message);};
const nodeOK=v=>{const [a,b,c]=String(v).split('.').map(Number);return a===24&&(b>14||b===14&&c>=1);};
const versionOK=v=>typeof v==='string'&&/^\d+\.\d+\.\d+$/.test(v);
const compare=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);return x[0]-y[0]||x[1]-y[1]||x[2]-y[2];};
const parse=text=>{try{return JSON.parse(text);}catch{fail('cli_schema','CLI вернул неожиданный формат. Установка остановлена.');}};

export function command(binary,args,{signal,timeoutMs=120000,env=process.env}={}) {
  return new Promise((resolve,reject)=>{
    const grouped=process.platform!=='win32';
    const child=spawn(binary,args,{shell:false,detached:grouped,stdio:['ignore','pipe','pipe'],env:{...env,GIT_TERMINAL_PROMPT:'0',NO_COLOR:'1'}});
    let stdout='',size=0,reason,killTimer;
    const kill=signal=>{try{if(grouped&&child.pid)process.kill(-child.pid,signal);else child.kill(signal);}catch{}};
    const stop=error=>{if(reason)return;reason=error;kill('SIGTERM');killTimer=setTimeout(()=>kill('SIGKILL'),1000);};
    const abort=()=>stop(new InstallError('cancelled','Установка прервана. Перед повтором проверьте установленный пакет.'));
    const timer=setTimeout(()=>stop(new InstallError('command_timeout','Команда не завершилась вовремя. Автоматического повтора нет.')),timeoutMs);
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    const collect=(chunk,keep)=>{size+=chunk.length;if(size>2*1024*1024)stop(new InstallError('output_limit','Команда вернула слишком большой ответ.'));else if(keep)stdout+=chunk.toString();};
    child.stdout.on('data',data=>collect(data,true));child.stderr.on('data',data=>collect(data,false));
    const cleanup=()=>{clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',abort);};
    child.on('error',()=>{cleanup();reject(new InstallError('command_start','Не удалось запустить CLI/Git/Node. Проверьте установленный executable и PATH.'));});
    child.on('close',code=>{if(reason)kill('SIGKILL');cleanup();if(reason)reject(reason);else if(code!==0)reject(new InstallError('command_failed',`Команда завершилась с кодом ${Number.isInteger(code)?code:'прерывания'}. Автоматического повтора нет.`));else resolve(stdout.trim());});
  });
}

function marketFrom(data) {
  if(!Array.isArray(data?.marketplaces))fail('cli_schema','Не удалось прочитать список каталогов CLI.');
  const matches=data.marketplaces.filter(x=>x.name===MARKET);
  if(matches.length>1)fail('ambiguous_catalog','Обнаружены дубли каталога TeamON. Нужна проверка настроек.');
  const item=matches[0];if(!item)return null;
  if(item.marketplaceSource?.sourceType!=='git'||item.marketplaceSource.source!==SOURCE)
    fail('catalog_source','Имя TeamON занято другим источником. Он не будет заменён автоматически.');
  if(item.marketplaceSource.ref&&item.marketplaceSource.ref!=='main')
    fail('catalog_ref','Каталог закреплён на другой версии. Сначала явно переключите его на main.');
  if(typeof item.root!=='string'||!path.isAbsolute(item.root))fail('cli_schema','CLI не вернул абсолютный путь каталога.');
  return item;
}
function installedFrom(data) {
  if(!Array.isArray(data?.installed))fail('cli_schema','Не удалось прочитать установленный плагин.');
  const list=data.installed.filter(x=>x.pluginId===PLUGIN);
  if(list.length>1)fail('ambiguous_plugin','Обнаружено несколько регистраций Operator.');
  const item=list[0];if(!item)return null;
  if(item.installed!==true||typeof item.enabled!=='boolean'||!versionOK(item.version)||
    item.marketplaceSource?.sourceType!=='git'||item.marketplaceSource.source!==SOURCE)
    fail('plugin_source','Регистрация Operator отличается от ожидаемой. Не заменяю её автоматически.');
  return item;
}

export async function runInstallation({stage,signal,run=command,env=process.env,nodeVersion=process.versions.node,platform=process.platform}) {
  const cli=(args,timeoutMs)=>run('codex',args,{signal,env,timeoutMs});
  const listing=async()=>installedFrom(parse(await cli(['plugin','list','--marketplace',MARKET,'--json'])));
  let catalog,target,installed;
  await stage(0,async()=>{
    if(platform==='win32')fail('platform','Этот установщик проверен для macOS/Linux; Windows пока не поддерживается.');
    if(!nodeOK(nodeVersion))fail('node_version','Нужен Node >=24.14.1 <25. Установщик не заменяет системную Node.');
    await cli(['--version']);await run('git',['--version'],{signal,env});
    const help=await cli(['plugin','list','--help']);
    if(!help.includes('--marketplace')||!help.includes('--json'))fail('cli_version','CLI не поддерживает нужный интерфейс плагинов. Обновите Codex.');
    catalog=marketFrom(parse(await cli(['plugin','marketplace','list','--json'])));
  });
  await stage(1,async()=>{
    await cli(catalog?['plugin','marketplace','upgrade',MARKET]:['plugin','marketplace','add',SOURCE],480000);
    catalog=marketFrom(parse(await cli(['plugin','marketplace','list','--json'])));
    if(!catalog)fail('catalog_missing','Каталог не появился после команды.');
    const manifest=parse(await readFile(path.join(catalog.root,'plugins',MARKET,'.codex-plugin','plugin.json'),'utf8'));
    target=manifest.version;
    if(manifest.name!==MARKET||!versionOK(target)||compare(target,'0.2.11')<0)fail('release_contract','В каталоге нет поддерживаемой chat-only поставки.');
  });
  await stage(2,async()=>{
    installed=await listing();
    if(installed&&compare(installed.version,target)>0)fail('downgrade','Установлена более новая версия. Автоматического отката не будет.');
    if(!installed||installed.version!==target) {
      // CLI owns installation/config writes. Never patch cache/config or remove old state here.
      await cli(['plugin','add',PLUGIN,'--json'],480000);
    }
    installed=await listing();
    if(!installed||installed.version!==target)fail('version_readback','Установка не подтверждена повторным чтением версии.');
  });
  await stage(3,async()=>{
    installed=await listing();
    if(!installed?.enabled)fail('plugin_disabled','Пакет установлен, но выключен. Включите TeamON Operator в настройках плагинов Codex; приватные подключения не менялись.');
  });
  await stage(4,async()=>{
    const base=await realpath(path.join(env.CODEX_HOME||path.join(homedir(),'.codex'),'plugins','cache'));
    const root=await realpath(path.join(base,MARKET,MARKET,target));
    const launcher=await realpath(path.join(root,'scripts','launch.mjs'));
    if(!root.startsWith(base+path.sep)||!launcher.startsWith(root+path.sep))fail('cache_path','Путь установленного пакета требует проверки.');
    const result=parse(await run(process.execPath,[launcher,'version'],{signal,env,timeoutMs:30000}));
    if(result.version!==target||!nodeOK(result.node))fail('launcher_readback','Launcher не подтвердил нужную версию и Node.');
  });
  return {version:target};
}

export async function acquireLock(profile) {
  const digest=createHash('sha256').update(profile).digest('hex').slice(0,20);
  const file=path.join(tmpdir(),`teamon-install-${process.getuid?.()??'user'}-${digest}.lock`);
  let handle;
  try {handle=await open(file,'wx',0o600);} catch(error) {
    if(error.code!=='EEXIST')throw error;
    fail('installer_busy','Другой запуск или оставшийся lock установщика уже существует. Не запускайте повторно; проверьте прежний процесс.');
  }
  const nonce=randomBytes(16).toString('hex');
  try{await handle.writeFile(JSON.stringify({pid:process.pid,nonce}));}finally{await handle.close();}
  return async()=>{try{const data=parse(await readFile(file,'utf8'));if(data.nonce===nonce)await unlink(file);}catch{}};
}

export async function createInstaller({html,perform=runInstallation,profile=process.env.CODEX_HOME||path.join(homedir(),'.codex'),
  acquire=acquireLock,onTerminal=()=>{},viewTimeoutMs=120000,retentionMs=300000,heartbeatMs=1000}={}) {
  const release=await acquire(path.resolve(profile));
  const token=randomBytes(24).toString('hex'),nonce=randomBytes(18).toString('base64');
  const clients=new Set(),controller=new AbortController();
  const state={revision:0,status:'awaiting_view',active:-1,completed:0,elapsedMs:0,stageElapsedMs:0,
    stages:steps.map(([name,estimateSeconds])=>({name,estimateSeconds})),version:null,error:null};
  let origin,started=0,stageStarted=0,terminalAt=0,startedOnce=false,closed=false,retention,viewDeadline,heartbeat,execution,closing;
  const snapshot=()=>({...state,elapsedMs:started?(terminalAt||Date.now())-started:0,stageElapsedMs:stageStarted?(terminalAt||Date.now())-stageStarted:0});
  const push=response=>response.write(`event: state\ndata: ${JSON.stringify(snapshot())}\n\n`);
  const broadcast=()=>{for(const response of clients){if(!push(response)){clients.delete(response);response.end();}}};
  async function execute() {
    started=Date.now();state.status='running';state.revision++;broadcast();
    try {
      const result=await perform({signal:controller.signal,stage:async(index,work)=>{
        if(controller.signal.aborted)throw new InstallError('cancelled','Установка прервана.');
        if(index!==state.completed||index>=steps.length)throw new Error('invalid stage sequence');
        state.active=index;stageStarted=Date.now();state.revision++;broadcast();
        await work();if(controller.signal.aborted)throw new InstallError('cancelled','Установка прервана.');
        state.completed=index+1;state.revision++;broadcast();
      }});
      if(state.completed!==5||!versionOK(result?.version))throw new Error('missing install evidence');
      state.version=result.version;state.status='completed';
    } catch(error) {
      state.status='failed';state.error=error instanceof InstallError?{code:error.code,message:error.message}:{code:'installation_failed',message:'Проверка установки не завершилась. Команды автоматически не повторяются.'};
    }
    terminalAt=Date.now();state.revision++;broadcast();
    try{onTerminal(snapshot());}catch{}
    if(!closed)retention=setTimeout(()=>void close(),retentionMs);
  }
  const server=http.createServer((req,res)=>{
    const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`};
    const deny=(status)=>{res.writeHead(status,headers);res.end();};
    if(closed)return deny(503);
    if(req.headers.host!==new URL(origin).host||req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site')return deny(403);
    const base=`/${token}`;
    if(req.method==='GET'&&req.url===`${base}/`){res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8'});res.end(html.replaceAll('__SCRIPT_NONCE__',nonce));return;}
    if(req.method==='GET'&&req.url===`${base}/events`){
      res.writeHead(200,{...headers,'Content-Type':'text/event-stream','Connection':'keep-alive'});res.flushHeaders();clients.add(res);push(res);
      req.on('close',()=>clients.delete(res));return;
    }
    if(req.method==='GET'&&req.url===`${base}/state`){res.writeHead(200,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify(snapshot()));return;}
    if(req.method==='POST'&&req.url===`${base}/view-ready`){
      if(req.headers.origin!==origin||req.headers['x-teamon-view']!=='ready'||req.headers['transfer-encoding']||Number(req.headers['content-length']||0)!==0)return deny(403);
      res.writeHead(204,headers);res.end();
      if(!startedOnce){startedOnce=true;clearTimeout(viewDeadline);execution=execute();}return;
    }
    deny(404);
  });
  function close() {
    if(closing)return closing;
    closed=true;controller.abort();clearInterval(heartbeat);clearTimeout(viewDeadline);clearTimeout(retention);
    closing=(async()=>{
      await execution;
      for(const response of clients)response.end();clients.clear();server.closeAllConnections();
      await new Promise(resolve=>server.close(resolve));await release();
    })();return closing;
  }
  try {await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});}
  catch(error){await release();throw error;}
  origin=`http://127.0.0.1:${server.address().port}`;
  heartbeat=setInterval(broadcast,heartbeatMs);
  viewDeadline=setTimeout(()=>{
    state.status='failed';state.error={code:'view_not_ready',message:'Экран не подключился за две минуты. Команды установки не запускались.'};state.revision++;
    try{onTerminal(snapshot());}catch{}
    void close();
  },viewTimeoutMs);
  return {url:`${origin}/${token}/`,snapshot,close};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv.length!==3||process.argv[2]!=='--install') {
    console.error('Usage: node runner.mjs --install (only after an explicit installation request)');process.exitCode=2;
  } else {
    try {
      const html=await readFile(new URL('./view.html',import.meta.url),'utf8');
      const app=await createInstaller({html,onTerminal:state=>{console.log(JSON.stringify({event:'installation-finished',...state}));if(state.status==='failed')process.exitCode=1;}});
      console.log(JSON.stringify({event:'open-progress',url:app.url,commandsStarted:false}));
      for(const event of ['SIGINT','SIGTERM'])process.once(event,()=>void app.close());
    } catch(error) {console.error(JSON.stringify({event:'installer-error',code:error.code||'startup_failed',message:error instanceof InstallError?error.message:'Не удалось запустить локальный экран установки.'}));process.exitCode=1;}
  }
}
