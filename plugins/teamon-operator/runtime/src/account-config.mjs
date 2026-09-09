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
  const data=await accountJson(`${session.origin}/api/operator/instances`,{headers:{Authorization:`Bearer ${session.accessToken}`}},fetchImpl);
  if(!Array.isArray(data.instances) || data.instances.length>1000 || data.instances.some(i=>i?.runtime!=='core')) throw new Error('invalid_account_response');
  const config=await parseOperatorConfig({schemaVersion:1,operator:data.operator,hubs:[],
    stateRoot:path.join(path.dirname(configPath),'.teamon-operator-accounts',String(data.operator?.id || 'invalid')),
    instances:data.instances.map(i=>({id:i.id,label:i.label,runtime:'core',core:{baseUrl:session.origin,accountFile:file,
      accountFingerprint:createHash('sha256').update(session.accessToken).digest('hex'),gatewayInstanceId:i.id}}))
  },configPath,{allowEmptyInstances:true});
  return Object.freeze({...config,account:true});
}
