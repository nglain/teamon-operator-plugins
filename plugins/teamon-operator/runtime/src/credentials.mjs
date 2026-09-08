import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { adapterError } from "./compatibility.mjs";

export async function coreCredential(instance, env = process.env) {
  let token;
  if (instance.core.tokenFile) {
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
