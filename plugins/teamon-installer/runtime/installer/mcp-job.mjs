import {randomUUID} from 'node:crypto';
import {homedir} from 'node:os';
import path from 'node:path';
import {realpath} from 'node:fs/promises';
import {runInstallation, acquireLock, InstallError, steps} from './runner.mjs';

// One job per helper process. Neither construction nor inspection runs commands.
export function createJob({perform=runInstallation, now=()=>performance.now(),
  profile=process.env.CODEX_HOME||path.join(homedir(),'.codex'), lock=acquireLock, demo=false}={}) {
  const runId=randomUUID(), controller=new AbortController();
  let execution, closed=false, startedAt, stageAt, terminalAt;
  const state={runId,revision:0,status:'ready',active:-1,completed:0,
    stages:steps.map(([name,estimateSeconds])=>({name,estimateSeconds})),version:null,error:null,demo};
  function snapshot() {
    const end=terminalAt??now();
    return structuredClone({...state,elapsedMs:startedAt===undefined?0:Math.max(0,end-startedAt),
      stageElapsedMs:stageAt===undefined?0:Math.max(0,end-stageAt)});
  }
  function inspect(id) {if(id!==runId)throw new Error('Unknown installer run; reopen the installer.');return snapshot();}
  async function execute() {
    let release;
    try {
      // Resolve aliases so two helpers cannot lock the same existing profile differently.
      const canonical=await realpath(path.resolve(profile)).catch(e=>{if(e.code==='ENOENT')return path.resolve(profile);throw e;});
      release=await lock(canonical);
      if(controller.signal.aborted)throw new InstallError('cancelled','Установка остановлена.');
      const result=await perform({signal:controller.signal,stage:async(index,work)=>{
        if(controller.signal.aborted)throw new InstallError('cancelled','Установка остановлена.');
        if(index!==state.completed||index>=steps.length||state.active>=state.completed)throw new Error('Invalid stage order');
        state.active=index;stageAt=now();state.revision++;
        await work();
        if(controller.signal.aborted)throw new InstallError('cancelled','Установка остановлена. Проверьте установленный пакет.');
        state.completed=index+1;state.revision++;
      }});
      if(state.completed!==steps.length||!/^\d+\.\d+\.\d+$/.test(result?.version||''))throw new Error('Missing installation evidence');
      state.version=result.version;state.status='completed';
    } catch(error) {
      state.status='failed';state.error=error instanceof InstallError?{code:error.code,message:error.message}:
        {code:'installation_failed',message:'Установка не подтверждена. Проверьте состояние; автоматического повтора нет.'};
    } finally {terminalAt=now();state.revision++;await release?.();}
  }
  function start(id) {
    inspect(id);
    if(closed)throw new Error('Installer closed.');
    if(!execution){state.status='running';startedAt=now();state.revision++;execution=execute();}
    return snapshot();
  }
  return {snapshot,inspect,start,settled:()=>execution,
    close:async()=>{closed=true;controller.abort();await execution;}};
}
