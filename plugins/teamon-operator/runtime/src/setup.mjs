import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { connectCore } from "./connect.mjs";
import { readInstallation, installationPath } from "./installation.mjs";
import { parseOperatorConfig } from "./config.mjs";

export async function setupCore(configPath, ask, dependencies = {}) {
  const previous = await readInstallation(configPath);
  const operator = previous.config?.operator;
  const operatorId = operator?.id || (await ask("Ваш короткий ID (латиницей, например anna): ")).trim();
  const operatorName = operator?.displayName || (await ask("Ваше имя: ")).trim();
  const instanceId = (await ask("Короткий ID компании (латиницей): ")).trim();
  const label = (await ask("Название компании: ")).trim();
  const baseUrl = (await ask("HTTPS-адрес панели (без /v3): ")).trim();
  if (!operatorId || !operatorName || !instanceId || !label || !baseUrl) throw Object.assign(new Error("Все поля обязательны. Подключение не изменено."), { setupProblem: "invalid_fields" });
  if (previous.config?.instances.some(instance => instance.id === instanceId)) throw Object.assign(new Error("company already configured"), { setupProblem: "already_configured" });
  try {
    await parseOperatorConfig({ schemaVersion: 1, operator: { id: operatorId, displayName: operatorName }, hubs: [],
      instances: [{ id: instanceId, label, runtime: "core", core: { baseUrl, tokenEnv: "SETUP_CREDENTIAL" } }] }, configPath);
  } catch { throw Object.assign(new Error("Invalid company fields"), { setupProblem: "invalid_fields" }); }
  // Confirm the exact target before soliciting a credential. No secret in UI or MCP.
  const confirmation = (await ask(`Подключить «${label}» (${baseUrl})? yes / да: `)).trim().toLowerCase();
  if (!["yes", "да"].includes(confirmation)) return { ok: false, state: "cancelled" };
  const token = await ask("Ключ этой компании (скрытый ввод, не пароль Master): ", true);
  return connectCore({ configPath, operatorId, operatorName, instanceId, label, baseUrl, token }, dependencies);
}

export async function interactiveSetup(configPath = installationPath(), input = process.stdin, output = process.stderr) {
  if (!input.isTTY) throw Object.assign(new Error("Запустите setup в интерактивном терминале."), { setupProblem: "terminal_required" });
  let hidden = false;
  const masked = new Writable({ write(chunk, _encoding, done) { if (!hidden) output.write(chunk); done(); } });
  const reader = createInterface({ input, output: masked, terminal: true });
  const abort = new AbortController();
  reader.on("SIGINT", () => abort.abort());
  reader.on("close", () => abort.abort());
  const ask = async (question, secret = false) => {
    hidden = secret;
    if (secret) output.write(question);
    try { return await reader.question(secret ? "" : question, { signal: abort.signal }); }
    finally { if (secret) output.write("\n"); hidden = false; }
  };
  try { return await setupCore(configPath, ask); }
  finally { reader.close(); masked.destroy(); }
}
