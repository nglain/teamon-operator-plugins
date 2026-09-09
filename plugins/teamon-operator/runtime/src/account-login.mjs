import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { MASTER_ORIGIN, accountPath, accountJson, saveAccountSession } from './account-session.mjs';

const opaque=()=>randomBytes(32).toString('base64url');
const same=(a,b)=>typeof a==='string' && /^[A-Za-z0-9_-]{43}$/.test(a) && a.length===b.length && timingSafeEqual(Buffer.from(a),Buffer.from(b));

export async function startAccountLogin(configPath,{fetchImpl=fetch,save=saveAccountSession,ttlMs=300_000}={}) {
  const state=opaque(), verifier=opaque();
  const challenge=createHash('sha256').update(verifier).digest('base64url');
  let callback, busy=false, timer, stopped=false, closing;
  const close=()=>{
    stopped=true;clearTimeout(timer);
    return closing ||= new Promise(resolve=>server.close(()=>resolve()));
  };
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
    // One-shot callback: do not leave keep-alive sockets delaying replacement/close.
    res.setHeader('Connection','close');
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    const respond=(status,text)=>{res.statusCode=status;res.end(`<meta charset="utf-8"><title>TeamON Operator</title><h1>TeamON Operator</h1><p>${text}</p>`);};
    let url;
    try{url=new URL(req.url,callback);}catch{respond(400,'Некорректный ответ входа.');return;}
    if(req.method!=='GET' || req.headers.host!==new URL(callback).host || url.pathname!=='/operator/callback'
      || url.searchParams.getAll('state').length!==1 || !same(url.searchParams.get('state'),state)
      || url.searchParams.getAll('code').length!==1 || !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('code')||'')) {
      respond(400,'Этот ответ не относится к начатому входу.');return;
    }
    if(stopped){respond(410,'Этот вход уже завершён. Начните новый вход из пульта.');return;}
    if(busy){respond(409,'Вход уже обрабатывается.');return;}
    busy=true;
    try{
      const token=await accountJson(`${MASTER_ORIGIN}/api/operator/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({grant_type:'authorization_code',client_id:'teamon-operator',code:url.searchParams.get('code'),code_verifier:verifier,redirect_uri:callback})},fetchImpl);
      if(token.token_type!=='Bearer' || !Number.isInteger(token.expires_in) || token.expires_in<=0 || token.expires_in>7*86400)throw new Error('invalid_token_response');
      if(stopped)throw new Error('login_cancelled');
      await save(accountPath(configPath),{schemaVersion:1,origin:MASTER_ORIGIN,accessToken:token.access_token,expiresAt:new Date(Date.now()+token.expires_in*1000).toISOString()});
      respond(200,'Вход выполнен. Вернитесь в пульт TeamON Operator и нажмите «Показать мои компании». Если вы сменили оператора в уже работающем пульте, переподключите MCP и откройте новый пульт.');
    }catch{respond(502,'Вход не завершён. Начните вход заново из пульта. Пароль и коды в чат отправлять не нужно.');}
    finally{void close();}
  });
  server.requestTimeout=5000;server.headersTimeout=5000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  callback=`http://127.0.0.1:${server.address().port}/operator/callback`;
  timer=setTimeout(()=>{void close();},ttlMs);timer.unref();server.unref();
  const url=new URL('/operator/authorize',MASTER_ORIGIN);
  url.search=new URLSearchParams({client_id:'teamon-operator',response_type:'code',redirect_uri:callback,
    code_challenge_method:'S256',code_challenge:challenge,state}).toString();
  return {url:url.href,close};
}

export function registerAccountLogin(server,configPath,dependencies) {
  let pending, starting, closed=false;
  server.registerTool('account_login_open',{
    description:'Start personal TeamON Operator login in the browser when the person asks to connect or sign in. Returns a Master authorization URL, never a password or credential. After first login call fleet_list in this same MCP. Switching an established identity or manual mode requires reconnect; manual connections are not deleted.',
    inputSchema:{},outputSchema:z.object({url:z.string(),message:z.string()}),
    annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:true}
  },async()=>{
    if(closed)throw new Error('Operator is closing');
    // Coalesce overlapping clicks; wait for an old callback/save to settle before
    // offering another login. An older save cannot overwrite the newer login.
    starting ||= (async()=>{
      await pending?.close();
      if(closed)throw new Error('Operator is closing');
      const next=await startAccountLogin(configPath,dependencies);
      if(closed){await next.close();throw new Error('Operator is closing');}
      pending=next;return next;
    })().finally(()=>{starting=undefined;});
    const login=await starting;
    const value={url:login.url,message:'Откройте ссылку в браузере, войдите личным логином и паролем. Затем нажмите «Показать мои компании» в пульте. Пароль не отправляйте в чат. При смене оператора или переходе с ручной настройки переподключите MCP.'};
    return{content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};
  });
  const close=server.close.bind(server);
  server.close=async()=>{closed=true;await starting?.catch(()=>{});await pending?.close();await close();};
}
