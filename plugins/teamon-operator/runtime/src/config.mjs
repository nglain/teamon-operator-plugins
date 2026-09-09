import { readFile } from "node:fs/promises";
import path from "node:path";
import { MASTER_ORIGIN } from './account-session.mjs';

const SAFE_ID = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/u;

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function exactKeys(value, allowed, label) {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`${label} contains unknown field: ${unknown}`);
}

function text(value, label, max = 500) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  const normalized = value.trim();
  if (normalized.length > max || /[\0\r\n]/u.test(normalized)) throw new Error(`${label} is invalid`);
  return normalized;
}

function id(value, label) {
  const normalized = text(value, label, 64);
  if (!SAFE_ID.test(normalized)) throw new Error(`${label} must be a stable lowercase id`);
  return normalized;
}

function command(value, label, base) {
  const input = object(value, label);
  exactKeys(input, ["command", "args", "cwd"], label);
  const executable = text(input.command, `${label}.command`, 400);
  const args = input.args === undefined ? [] : input.args;
  if (!Array.isArray(args) || args.length > 50) throw new Error(`${label}.args must contain at most 50 strings`);
  const normalizedArgs = args.map((item, index) => text(item, `${label}.args[${index}]`, 1000));
  if (normalizedArgs.some((item) => /^--(?:token|password)(?:=|$)/u.test(item) || /^(?:sk-|Bearer\s)/u.test(item))) {
    throw new Error(`${label} must use host-local auth or a token file, not an inline secret`);
  }
  return {
    command: executable,
    args: normalizedArgs,
    ...(input.cwd ? { cwd: path.resolve(base, text(input.cwd, `${label}.cwd`, 1000)) } : {})
  };
}

async function instanceSpec(file, instanceId) {
  const value = object(JSON.parse(await readFile(file, "utf8")), `InstanceSpec ${instanceId}`);
  if (value.schemaVersion !== 1 || typeof value.instanceId !== "string" || !value.release || !value.target) {
    throw new Error(`InstanceSpec ${instanceId} has an unsupported shape`);
  }
  if (value.instanceId !== instanceId) {
    throw new Error(`InstanceSpec ${instanceId} identifies another instance: ${value.instanceId}`);
  }
  return value;
}

function coreDashboard(value, label, base) {
  const input = object(value, label);
  exactKeys(input, ["baseUrl", "tokenEnv", "tokenFile", "accountFile", "gatewayInstanceId"], label);
  let url;
  try { url = new URL(text(input.baseUrl, `${label}.baseUrl`, 1000)); }
  catch { throw new Error(`${label}.baseUrl must be an HTTPS origin or loopback HTTP tunnel`); }
  const loopback = ["127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error(`${label}.baseUrl must be an HTTPS origin or loopback HTTP tunnel without credentials, path or query`);
  }
  if (input.accountFile !== undefined || input.gatewayInstanceId !== undefined) {
    if (input.tokenEnv !== undefined || input.tokenFile !== undefined || url.origin !== MASTER_ORIGIN) throw new Error('invalid account gateway binding');
    return Object.freeze({baseUrl:url.origin,accountFile:path.resolve(base,text(input.accountFile,'accountFile',1000)),gatewayInstanceId:id(input.gatewayInstanceId,'gatewayInstanceId')});
  }
  if ((input.tokenEnv !== undefined) === (input.tokenFile !== undefined)) throw new Error(`${label} requires exactly one credential reference: tokenEnv or tokenFile`);
  if (input.tokenFile !== undefined) return Object.freeze({
    baseUrl: url.origin, tokenFile: path.resolve(base, text(input.tokenFile, `${label}.tokenFile`, 1000))
  });
  const tokenEnv = text(input.tokenEnv, `${label}.tokenEnv`, 120);
  if (!/^[A-Z_][A-Z0-9_]*$/u.test(tokenEnv)) throw new Error(`${label}.tokenEnv must name an environment variable, not contain a token`);
  return Object.freeze({ baseUrl: url.origin, tokenEnv });
}

export async function loadOperatorConfig(file) {
  return parseOperatorConfig(JSON.parse(await readFile(file, "utf8")), file);
}

export async function parseOperatorConfig(input, file, { allowEmptyInstances = false } = {}) {
  const absolute = path.resolve(file);
  const base = path.dirname(absolute);
  const value = object(input, "operator config");
  exactKeys(value, ["schemaVersion", "operator", "stateRoot", "hubs", "instances"], "operator config");
  if (value.schemaVersion !== 1) throw new Error("unsupported operator config schemaVersion");
  const operator = object(value.operator, "operator");
  exactKeys(operator, ["id", "displayName"], "operator");
  const hubsInput = Array.isArray(value.hubs) ? value.hubs : [];
  const instancesInput = Array.isArray(value.instances) ? value.instances : [];
  if (instancesInput.length === 0 && !allowEmptyInstances) throw new Error("at least one Instance is required");

  const hubs = hubsInput.map((entry, index) => {
    const hub = object(entry, `hubs[${index}]`);
    exactKeys(hub, ["id", "repository", "branch"], `hubs[${index}]`);
    return {
      id: id(hub.id, `hubs[${index}].id`),
      repository: path.resolve(base, text(hub.repository, `hubs[${index}].repository`, 1000)),
      branch: text(hub.branch || "main", `hubs[${index}].branch`, 200)
    };
  });
  if (new Set(hubs.map(({ id: hubId }) => hubId)).size !== hubs.length) throw new Error("Hub ids must be unique");
  const hubIds = new Set(hubs.map(({ id: hubId }) => hubId));

  const instances = await Promise.all(instancesInput.map(async (entry, index) => {
    const instance = object(entry, `instances[${index}]`);
    if (instance.runtime === "core") {
      exactKeys(instance, ["id", "label", "runtime", "core"], `instances[${index}]`);
      const instanceId = id(instance.id, `instances[${index}].id`);
      return Object.freeze({
        id: instanceId,
        label: text(instance.label || instanceId, `instances[${index}].label`, 120),
        runtime: "core",
        core: coreDashboard(instance.core, `instances[${index}].core`, base)
      });
    }
    exactKeys(instance, ["id", "label", "runtime", "hubId", "instanceSpec", "channelMcp", "controlRpc"], `instances[${index}]`);
    if (instance.runtime !== undefined && instance.runtime !== "staff") throw new Error(`instances[${index}] has an unsupported runtime`);
    if (hubsInput.length === 0) throw new Error("at least one Hub is required for Staff instances");
    const instanceId = id(instance.id, `instances[${index}].id`);
    const hubId = id(instance.hubId, `instances[${index}].hubId`);
    if (!hubIds.has(hubId)) throw new Error(`instances[${index}] references unknown Hub: ${hubId}`);
    const specPath = path.resolve(base, text(instance.instanceSpec, `instances[${index}].instanceSpec`, 1000));
    return {
      id: instanceId,
      label: text(instance.label || instanceId, `instances[${index}].label`, 120),
      hubId,
      instanceSpec: specPath,
      desired: await instanceSpec(specPath, instanceId),
      channelMcp: command(instance.channelMcp, `instances[${index}].channelMcp`, base),
      controlRpc: command(instance.controlRpc, `instances[${index}].controlRpc`, base)
    };
  }));
  if (new Set(instances.map(({ id: instanceId }) => instanceId)).size !== instances.length) throw new Error("Instance ids must be unique");

  return Object.freeze({
    schemaVersion: 1,
    file: absolute,
    operator: Object.freeze({
      id: id(operator.id, "operator.id"),
      displayName: text(operator.displayName || operator.id, "operator.displayName", 120)
    }),
    stateRoot: path.resolve(base, text(value.stateRoot || ".teamon-operator", "stateRoot", 1000)),
    hubs: Object.freeze(hubs),
    instances: Object.freeze(instances)
  });
}
