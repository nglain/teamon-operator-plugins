import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { adapterError } from "./compatibility.mjs";
import { readAccountSession } from './account-session.mjs';
import { createHash } from 'node:crypto';

export async function coreCredential(instance, env = process.env) {
  let token;
  if (instance.core.accountFile) {
    const session=await readAccountSession(instance.core.accountFile);
    if(Date.parse(session.expiresAt)<=Date.now() || session.origin!==instance.core.baseUrl) throw new Error('account_login_required');
    if(createHash('sha256').update(session.accessToken).digest('hex') !== instance.core.accountFingerprint) throw new Error('account_changed_refresh_required');
    token=session.accessToken;
  } else if (instance.core.tokenFile) {
    let handle;
    try {
      handle = await open(instance.core.tokenFile, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 8192 || (stat.mode & 0o077) !== 0
        || (process.getuid && stat.uid !== process.getuid())) throw new Error("not_private");
      token = (await handle.readFile("utf8")).trim();
    } catch {
      throw adapterError("auth_not_configured", `Core private credential unavailable: ${instance.id}`);
    } finally { await handle?.close(); }
  } else token = env[instance.core.tokenEnv];
  if (typeof token !== "string" || !token.trim() || token.length > 8192 || /[\0\r\n]/u.test(token)) {
    throw adapterError("auth_not_configured", `Core auth_not_configured: ${instance.id}`);
  }
  return token;
}
