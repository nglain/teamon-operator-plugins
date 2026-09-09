import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseOperatorConfig } from './config.mjs';
import { accountPath, accountJson, readAccountSession } from './account-session.mjs';

export async function readAccountConfig(configPath,{fetchImpl=fetch}={}) {
  const file=accountPath(configPath);
  let session;
  try{session=await readAccountSession(file);}
  catch(error){
    if(error.code==='ENOENT') {
      try{await lstat(file);}catch(statError){if(statError.code==='ENOENT')return null;}
    }
    throw new Error('account_login_required');
  }
  if(Date.parse(session.expiresAt)<=Date.now())throw new Error('account_login_required');
  const data=await accountJson(`${session.origin}/api/operator/instances`,{headers:{Authorization:`Bearer ${session.accessToken}`,'X-TeamON-Operator-Transport':'direct-mcp-v1'}},fetchImpl);
  if(!Array.isArray(data.instances) || data.instances.length>1000 || data.instances.some(i=>i?.runtime!=='core')) throw new Error('invalid_account_response');
  const config=await parseOperatorConfig({schemaVersion:1,operator:data.operator,hubs:[],
    stateRoot:path.join(path.dirname(configPath),'.teamon-operator-accounts',String(data.operator?.id || 'invalid')),
    instances:data.instances.map(i=>{
      if (i.mcp !== undefined) {
        if (!i.mcp || Object.keys(i.mcp).some(k=>!['url','issuer','subject'].includes(k))
          || typeof i.mcp.subject !== 'string' || !i.mcp.subject) throw new Error('invalid_account_response');
        const key=createHash('sha256').update(JSON.stringify([i.id,i.mcp.issuer,i.mcp.subject,i.mcp.url])).digest('hex');
        return {id:i.id,label:i.label,runtime:'core',core:{mcp:{...i.mcp,tokenFile:path.join(`${file}.resources`,`${key}.json`)}}};
      }
      return {id:i.id,label:i.label,runtime:'core',core:{baseUrl:session.origin,accountFile:file,
        accountFingerprint:createHash('sha256').update(session.accessToken).digest('hex'),gatewayInstanceId:i.id}};
    })
  },configPath,{allowEmptyInstances:true});
  return Object.freeze({...config,account:true});
}
