import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { MASTER_ORIGIN, accountPath, accountJson, saveAccountSession } from './account-session.mjs';

const opaque=()=>randomBytes(32).toString('base64url');
const same=(a,b)=>typeof a==='string' && /^[A-Za-z0-9_-]{43}$/.test(a) && a.length===b.length && timingSafeEqual(Buffer.from(a),Buffer.from(b));

export async function startAccountLogin(configPath,{fetchImpl=fetch,save=saveAccountSession,ttlMs=300_000}={}) {
  const state=opaque(), verifier=opaque();
  const challenge=createHash('sha256').update(verifier).digest('base64url');
  let callback, busy=false, timer, stopped=false;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
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
    if(busy){respond(409,'Вход уже обрабатывается.');return;}
    busy=true;
    try{
      const token=await accountJson(`${MASTER_ORIGIN}/api/operator/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({grant_type:'authorization_code',client_id:'teamon-operator',code:url.searchParams.get('code'),code_verifier:verifier,redirect_uri:callback})},fetchImpl);
      if(token.token_type!=='Bearer' || !Number.isInteger(token.expires_in) || token.expires_in<=0 || token.expires_in>7*86400)throw new Error('invalid_token_response');
      if(stopped)throw new Error('login_cancelled');
      await save(accountPath(configPath),{schemaVersion:1,origin:MASTER_ORIGIN,accessToken:token.access_token,expiresAt:new Date(Date.now()+token.expires_in*1000).toISOString()});
      respond(200,'Вход выполнен. Вернитесь в Codex, переподключите TeamON Operator и откройте пульт. Назначенные компании загрузятся автоматически.');
    }catch{respond(502,'Вход не завершён. Начните вход заново из пульта. Пароль и коды в чат отправлять не нужно.');}
    finally{clearTimeout(timer);server.close();}
  });
  server.requestTimeout=5000;server.headersTimeout=5000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  callback=`http://127.0.0.1:${server.address().port}/operator/callback`;
  timer=setTimeout(()=>{stopped=true;server.close();},ttlMs);timer.unref();server.unref();
  const url=new URL('/operator/authorize',MASTER_ORIGIN);
  url.search=new URLSearchParams({client_id:'teamon-operator',response_type:'code',redirect_uri:callback,
    code_challenge_method:'S256',code_challenge:challenge,state}).toString();
  return {url:url.href,close:()=>{stopped=true;clearTimeout(timer);server.close();}};
}

export function registerAccountLogin(server,configPath,dependencies) {
  let pending;
  server.registerTool('account_login_open',{
    description:'Start personal TeamON Operator login in the browser when the person asks to connect or sign in. Returns a Master authorization URL, never a password or credential. This account mode supersedes manual connections without deleting them. Reconnect MCP after login.',
    inputSchema:{},outputSchema:z.object({url:z.string(),message:z.string()}),
    annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:true}
  },async()=>{
    pending?.close();pending=await startAccountLogin(configPath,dependencies);
    const value={url:pending.url,message:'Откройте ссылку в браузере, войдите личным логином и паролем. Затем переподключите MCP. Пароль не отправляйте в чат.'};
    return{content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};
  });
  const close=server.close.bind(server);
  server.close=async()=>{pending?.close();await close();};
}
