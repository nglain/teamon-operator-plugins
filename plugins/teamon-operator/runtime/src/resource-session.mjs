import { open, mkdir, rename, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { adapterError } from './compatibility.mjs';

const failure = () => adapterError('authentication_failed', 'instance_login_required');
// Decode only to reject misplaced credentials before transmission. This is NOT
// signature verification: the receiving Core must verify the issuer's signature.
function claims(token) {
  try {
    if (typeof token !== 'string' || token.length > 8192 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) throw failure();
    const [header, payload] = token.split('.').slice(0,2).map(x => JSON.parse(Buffer.from(x,'base64url')));
    if (header.typ !== 'at+jwt' || !['RS256','ES256','EdDSA'].includes(header.alg)) throw failure();
    return payload;
  } catch { throw failure(); }
}
export function validateResourceSession(value, binding, now = Date.now(), allowExpired = false) {
  if (value?.schemaVersion !== 1 || value.issuer !== binding.issuer || value.resource !== binding.url
    || value.subject !== binding.subject || value.clientId !== 'teamon-operator') throw failure();
  const c = claims(value.accessToken);
  if (c.iss !== binding.issuer || c.aud !== binding.url || c.sub !== binding.subject
    || c.client_id !== value.clientId || typeof c.jti !== 'string' || !c.jti
    || !String(c.scope || '').split(' ').includes('operator:manage')
    || !Number.isSafeInteger(c.exp) || !Number.isSafeInteger(c.iat) || c.exp <= c.iat
    || c.exp - c.iat > 300 || c.iat * 1000 > now + 30_000
    || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) > c.exp * 1000) throw failure();
  if (!allowExpired && Math.min(c.exp * 1000, Date.parse(value.expiresAt)) <= now + 1000) throw failure();
  if (value.refreshToken !== undefined && (typeof value.refreshToken !== 'string' || !value.refreshToken || value.refreshToken.length > 8192 || /[\r\n\0]/.test(value.refreshToken))) throw failure();
  return value;
}
export async function readResourceSession(binding, {allowExpired = false} = {}) {
  let handle;
  try {
    handle = await open(binding.tokenFile, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 16_384 || stat.mode & 0o077
      || process.getuid && stat.uid !== process.getuid()) throw failure();
    return validateResourceSession(JSON.parse(await handle.readFile('utf8')), binding,Date.now(),allowExpired);
  } catch { throw failure(); } finally { await handle?.close(); }
}
// For the OAuth owner only: no tool accepts token bytes or an arbitrary save path.
export async function saveResourceSession(binding, value) {
  validateResourceSession(value, binding);
  await writeResourceFile(binding,value);
}
export async function invalidateResourceSession(binding) {
  await writeResourceFile(binding,{schemaVersion:1,reauthorizationRequired:true});
}
async function writeResourceFile(binding,value) {
  await mkdir(path.dirname(binding.tokenFile), {recursive:true,mode:0o700});
  const temporary = `${binding.tokenFile}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    await handle.writeFile(JSON.stringify(value)); await handle.sync(); await handle.close(); handle = undefined;
    await rename(temporary,binding.tokenFile);
  } finally { await handle?.close(); await unlink(temporary).catch(e => {if (e.code !== 'ENOENT') throw e;}); }
}
