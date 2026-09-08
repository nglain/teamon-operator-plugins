import { constants } from "node:fs";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { parseOperatorConfig } from "./config.mjs";
import { CoreDashboard, coreActorMatches } from "./adapters/core.mjs";
import { CORE_ADMIN_CAPABILITIES } from "./adapters/core-changes.mjs";
import { probeFailure } from "./compatibility.mjs";

async function readConfig(file) {
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 1024 * 1024 || (stat.mode & 0o022)) throw new Error("config must be a regular non-writable-by-others file");
    const raw = await handle.readFile("utf8");
    return { raw, value: JSON.parse(raw) };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  } finally { await handle?.close(); }
}

async function createPrivate(file, content) {
  const handle = await open(file, "wx", 0o600);
  try { await handle.writeFile(content, "utf8"); await handle.sync(); }
  catch (error) { await handle.close(); await unlink(file); throw error; }
  await handle.close();
}

// REQ-OP-CONNECT: setup binds one explicit company; it never grants server rights.
export async function connectCore({ configPath, instanceId, label, baseUrl, operatorId, operatorName, token }, dependencies = {}) {
  if (typeof token !== "string" || !token.trim() || token.length > 8192 || /[\0\r\n]/u.test(token.trim())) throw new Error("invalid credential input");
  const file = path.resolve(configPath);
  const base = path.dirname(file);
  // Validate caller-supplied identifiers and origin before creating any files.
  const entry = { id: instanceId, label: label || instanceId, runtime: "core", core: { baseUrl, tokenEnv: "TEAMON_CONNECT_TOKEN" } };
  const seed = { schemaVersion: 1, operator: { id: operatorId, displayName: operatorName || operatorId }, hubs: [], instances: [entry] };
  await parseOperatorConfig(seed, file);
  await mkdir(base, { recursive: true, mode: 0o700 });
  const lockPath = `${file}.connect-lock`;
  let lock;
  try { lock = await open(lockPath, "wx", 0o600); }
  catch (error) { if (error.code === "EEXIST") throw new Error("connection setup already running; inspect the existing attempt before retrying"); throw error; }
  const nonce = randomUUID();
  const tokenPath = `${file}.${instanceId}.${nonce}.credential`;
  const temporaryPath = `${file}.${nonce}.pending`;
  let tokenCreated = false, temporaryCreated = false, committed = false;
  try {
    const snapshot = await readConfig(file);
    const current = snapshot?.value;
    if (current) {
      await parseOperatorConfig(current, file);
      if (current.operator.id !== operatorId) throw new Error("operator identity differs from existing config");
      if (current.instances.some(instance => instance.id === instanceId)) throw new Error("company already configured; setup will not overwrite its connection");
    }
    const candidate = current ? { ...current, instances: [...current.instances, entry] } : seed;
    const checked = await parseOperatorConfig(candidate, file);
    const selected = checked.instances.find(instance => instance.id === instanceId);
    const adapter = dependencies.core || new CoreDashboard({ operator: checked.operator, env: { TEAMON_CONNECT_TOKEN: token.trim() } });
    const observed = await adapter.instanceInspect(selected);
    // /health alone can be public. Require the authenticated roster read too.
    if (!Array.isArray(observed.agents)) throw new Error("company connection not verified: authenticated agent list unavailable");
    const access = await adapter.accessInspect(selected).catch(error => ({ failure: probeFailure(error) }));
    if (access.actor && !coreActorMatches(access, operatorId)) throw new Error("server operator identity mismatch; use the assigned personal credential");
    await createPrivate(tokenPath, `${token.trim()}\n`);
    tokenCreated = true;
    entry.core = { baseUrl: selected.core.baseUrl, tokenFile: path.basename(tokenPath) };
    await parseOperatorConfig(candidate, file);
    await createPrivate(temporaryPath, `${JSON.stringify(candidate, null, 2)}\n`);
    temporaryCreated = true;
    // Registry has no secrets; keep the exact previous revision for recovery.
    const latest = await readConfig(file);
    if (latest?.raw !== snapshot?.raw) throw new Error("config changed during connection check; retry with its current version");
    if (current) await createPrivate(`${file}.${nonce}.backup`, snapshot.raw);
    await rename(temporaryPath, file);
    temporaryCreated = false;
    committed = true;
    return {
      ok: true, configPath: file, instanceId, label: entry.label, origin: selected.core.baseUrl,
      operator: checked.operator, agentsObserved: observed.agents.length,
      validation: "authenticated_product_and_roster_read", credentialStored: "private_file",
      serverIdentity: access.actor ? { status: "verified", actor: access.actor, authType: access.authType || "personal_operator",
        verifiedSubject: access.authType === "company_admin" ? "company_credential" : "assigned_person" } : { status: "not_checked", reason: access.failure.reason },
      writesEnabled: !!access.actor && ["messagePrepare", "messageCommit", "messageStatus"].every(name => access.capabilities[name] === true)
        && access.capabilities.channels.includes("telegram_bot_text"),
      administration: access.actor && CORE_ADMIN_CAPABILITIES.every(name => access.capabilities[name] === true)
        ? { status: "advertised", executionVerified: false } : { status: "not_advertised", executionVerified: false },
      note: "Connection uses an existing issued credential, not a one-time code. Local identity is not server authority. Restart the MCP host after changing connections."
    };
  } finally {
    if (temporaryCreated) await unlink(temporaryPath);
    if (tokenCreated && !committed) await unlink(tokenPath);
    await lock.close();
    await unlink(lockPath);
  }
}
