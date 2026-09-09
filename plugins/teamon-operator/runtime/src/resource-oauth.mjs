import http from 'node:http';
import {mkdir,open,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {discoverOAuthServerInfo,startAuthorization,exchangeAuthorization,refreshAuthorization} from '@modelcontextprotocol/client';
import {readResourceSession,saveResourceSession,invalidateResourceSession} from './resource-session.mjs';
import {adapterError} from './compatibility.mjs';

const loginRequired = () => adapterError('authentication_failed','instance_login_required');
const clientInformation = {client_id:'teamon-operator'};
async function lock(binding) {
  await mkdir(path.dirname(binding.tokenFile),{recursive:true,mode:0o700});
  const file=`${binding.tokenFile}.lock`;
  let handle;
  try {handle=await open(file,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY,0o600);}
  catch {throw adapterError('authentication_failed','instance_login_busy');}
  // Never steal a lock after process death: losing refresh ownership can replay
  // a rotating token. Explicit recovery is required; normal calls never delete it.
  return async()=>{await handle.close();await unlink(file);};
}
function oauthFetch(binding,fetchImpl) {
  return async(url,init={})=>{
    const target=new URL(url instanceof Request ? url.url : url);
    const method=init.method || 'GET';
    const safe = !target.username && !target.password && !target.hash && !target.search
      && (method === 'GET' && [binding.issuer,new URL(binding.url).origin].includes(target.origin) && target.pathname.startsWith('/.well-known/')
        || method === 'POST' && target.href === `${binding.issuer}/oauth/token`);
    if (!safe) throw loginRequired();
    const response=await fetchImpl(url,{...init,redirect:'error',signal:AbortSignal.timeout(15_000)});
    let bytes=0;const chunks=[];
    for await(const chunk of response.body || []){bytes+=chunk.length;if(bytes>64*1024)throw loginRequired();chunks.push(chunk);}
    return new Response(Buffer.concat(chunks),{status:response.status,headers:response.headers});
  };
}
async function discover(binding,fetchImpl) {
  const fetchFn=oauthFetch(binding,fetchImpl);
  const info=await discoverOAuthServerInfo(binding.url,{fetchFn});
  if(String(info.authorizationServerUrl).replace(/\/$/,'')!==binding.issuer
    || info.resourceMetadata?.resource !== binding.url
    || !info.resourceMetadata.authorization_servers?.includes(binding.issuer)
    || info.authorizationServerMetadata?.issuer!==binding.issuer
    || info.authorizationServerMetadata.authorization_endpoint!==`${binding.issuer}/oauth/authorize`
    || info.authorizationServerMetadata.token_endpoint!==`${binding.issuer}/oauth/token`) throw loginRequired();
  return {metadata:info.authorizationServerMetadata,fetchFn};
}
function sessionFrom(binding,tokens) {
  if(tokens.token_type?.toLowerCase()!=='bearer' || !Number.isInteger(tokens.expires_in) || tokens.expires_in<=0 || tokens.expires_in>300)throw loginRequired();
  // JWT validation in save checks that server lifetime does not exceed its exp.
  const exp=JSON.parse(Buffer.from(tokens.access_token.split('.')[1],'base64url')).exp*1000;
  return {schemaVersion:1,issuer:binding.issuer,resource:binding.url,subject:binding.subject,
    clientId:clientInformation.client_id,accessToken:tokens.access_token,
    expiresAt:new Date(Math.min(exp,Date.now()+tokens.expires_in*1000)).toISOString(),
    ...(tokens.refresh_token ? {refreshToken:tokens.refresh_token} : {})};
}
export async function resourceCredential(binding,{fetchImpl=fetch}={}) {
  const current=await readResourceSession(binding,{allowExpired:true});
  if(Date.parse(current.expiresAt)>Date.now()+1000)return current;
  if(!current.refreshToken)throw loginRequired();
  const unlock=await lock(binding);
  try {
    const latest=await readResourceSession(binding,{allowExpired:true});
    if(Date.parse(latest.expiresAt)>Date.now()+1000)return latest;
    const {metadata,fetchFn}=await discover(binding,fetchImpl);
    // After dispatch a lost reply may mean the refresh token was rotated.
    // Erase its replayability BEFORE exchange. Successful exchange saves anew.
    await invalidateResourceSession(binding);
    const tokens=await refreshAuthorization(binding.issuer,{metadata,clientInformation,refreshToken:latest.refreshToken,resource:new URL(binding.url),fetchFn});
    const next=sessionFrom(binding,tokens);await saveResourceSession(binding,next);return next;
  } catch {throw loginRequired();} finally {await unlock();}
}
export async function startResourceLogin(binding,{fetchImpl=fetch,ttlMs=300_000,isCurrent=()=>true}={}) {
  const unlock=await lock(binding);
  let server,timer,callback,flow,busy=false,closed=false,closing;
  const state=randomBytes(32).toString('base64url');
  const close=()=>closing ||= (async()=>{
    closed=true;clearTimeout(timer);
    if(server)await new Promise(resolve=>server.close(resolve));
    await unlock();
  })();
  try {
    const {metadata,fetchFn}=await discover(binding,fetchImpl);
    server=http.createServer(async(req,res)=>{
      res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
      res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Connection','close');
      res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
      const respond=(status,text)=>{res.statusCode=status;res.end(`<meta charset="utf-8"><p>${text}</p>`);};
      let url;try{url=new URL(req.url,callback);}catch{respond(400,'Некорректный ответ.');return;}
      const returned=url.searchParams.get('state') || '';
      if(req.method!=='GET' || req.headers.host!==new URL(callback).host || url.pathname!=='/operator/resource-callback'
        || url.searchParams.getAll('state').length!==1 || !/^[A-Za-z0-9_-]{43}$/.test(returned)
        || !timingSafeEqual(Buffer.from(returned),Buffer.from(state))
        || ['code','iss','error'].some(k=>url.searchParams.getAll(k).length>1)) {respond(400,'Ответ не относится к этому входу.');return;}
      if(closed || busy){respond(409,'Вход уже обрабатывается или завершён.');return;}
      busy=true;
      try {
        if(!flow || !isCurrent() || url.searchParams.has('error'))throw loginRequired();
        const code=url.searchParams.get('code');if(!code || code.length>2048)throw loginRequired();
        const tokens=await exchangeAuthorization(binding.issuer,{metadata,clientInformation,authorizationCode:code,
          iss:url.searchParams.get('iss') ?? undefined,codeVerifier:flow.codeVerifier,redirectUri:callback,resource:new URL(binding.url),fetchFn});
        if(closed || !isCurrent())throw loginRequired();
        await saveResourceSession(binding,sessionFrom(binding,tokens));
        respond(200,'Компания подключена. Вернитесь в чат и повторите чтение выбранной компании. Эту вкладку можно закрыть.');
      }catch{respond(400,'Подключение не завершено. Вернитесь в чат и запросите новый вход. Пароль и коды не отправляйте в чат.');}
      finally{void close();}
    });
    server.requestTimeout=5000;server.headersTimeout=5000;
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    callback=`http://127.0.0.1:${server.address().port}/operator/resource-callback`;
    flow=await startAuthorization(binding.issuer,{metadata,clientInformation,redirectUrl:callback,scope:'operator:manage',state,resource:new URL(binding.url)});
    if(flow.authorizationUrl.origin!==binding.issuer || flow.authorizationUrl.pathname!=='/oauth/authorize')throw loginRequired();
    timer=setTimeout(()=>{void close();},ttlMs);timer.unref();server.unref();
    return {url:flow.authorizationUrl.href,close,get closed(){return closed;}};
  }catch{await close();throw loginRequired();}
}
