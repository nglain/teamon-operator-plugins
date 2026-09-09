import {z} from 'zod';
import {startResourceLogin} from './resource-oauth.mjs';

export function registerResourceLogin(server,getService,{start=startResourceLogin}={}) {
  const attempts=new Map();let closed=false;
  server.registerTool('instance_login_open',{
    description:'Connect one assigned company through browser SSO on Master for direct MCP. Use only when the person asks to connect that company. Returns an authorization URL, never tokens. After browser success repeat instance_inspect. Does not send messages or alter agents.',
    inputSchema:{instance_id:z.string().min(1)},outputSchema:{url:z.string(),message:z.string()},
    annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:true}
  },async({instance_id})=>{
    if(closed)throw Error('Operator is closing');
    const instance=getService().instance(instance_id),binding=instance.core?.mcp;
    if(!binding)throw Error('This company uses the existing connection; direct MCP login is not configured');
    const fingerprint=JSON.stringify(binding);
    const isCurrent=()=>!closed && getService().config.instances.some(i=>i.id===instance_id && JSON.stringify(i.core?.mcp)===fingerprint);
    let attempt=attempts.get(instance_id);
    if(attempt && attempt.fingerprint!==fingerprint){await (await attempt.promise).close();attempts.delete(instance_id);attempt=null;}
    if(attempt && (await attempt.promise).closed){attempts.delete(instance_id);attempt=null;}
    if(!attempt){
      const promise=start(binding,{isCurrent});attempt={promise,fingerprint};attempts.set(instance_id,attempt);
      promise.catch(()=>{if(attempts.get(instance_id)===attempt)attempts.delete(instance_id);});
    }
    const login=await attempt.promise;
    if(!isCurrent()){await login.close();throw Error('Selected company changed; refresh account status and reselect the company');}
    const value={url:login.url,message:'Подтвердите подключение выбранной компании в браузере Master. Затем вернитесь в этот чат и повторите её проверку. Пароль и коды не отправляйте в чат.'};
    return {content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};
  });
  const close=server.close.bind(server);
  server.close=async()=>{
    closed=true;
    await Promise.allSettled([...attempts.values()].map(async({promise})=>(await promise).close()));
    await close();
  };
}
