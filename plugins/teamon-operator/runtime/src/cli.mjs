#!/usr/bin/env node
import { loadOperatorConfig } from "./config.mjs";
import { serveOperatorMcp } from "./server.mjs";
import { connectCore } from "./connect.mjs";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { CoreDashboard } from "./adapters/core.mjs";
import { coreCredentialSelectionSchema, coreRevisionSchema } from "./adapters/core-changes.mjs";
import { ACTIVE_BUILD, installationPath, installationStatus, readInstallation, serveUnconfigured } from "./installation.mjs";
import { interactiveSetup } from "./setup.mjs";
import { OperatorService } from "./operator-service.mjs";
import { probeFailure } from "./compatibility.mjs";

function option(name) {
  const index = process.argv.indexOf(name);
  if (index !== -1 && (!process.argv[index + 1] || process.argv[index + 1].startsWith("--"))) throw new Error(`${name} requires a value`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const command = process.argv[2] || "serve";
const configPath = installationPath(option("--config"));

async function credentialInput({ stdinFlag = "--token-stdin", maxLength = 8192, prompt = "Credential for this company (hidden; not a Master password): " } = {}) {
  if (!process.stdin.isTTY) {
    if (!process.argv.includes(stdinFlag)) throw new Error(`use protected terminal input or explicit ${stdinFlag}, never a secret argument`);
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk.toString();
      if (input.length > maxLength) throw new Error("credential input too large");
    }
    return input.trim();
  }
  process.stderr.write(prompt);
  const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const reader = createInterface({ input: process.stdin, output: muted, terminal: true });
  reader.on("SIGINT", () => reader.close());
  try {
    for await (const line of reader) {
      if (line.length > maxLength) throw new Error("credential input too large");
      return line.trim();
    }
    throw new Error("connection cancelled");
  } finally { reader.close(); muted.destroy(); process.stderr.write("\n"); }
}

if (["--version", "version"].includes(command)) {
  process.stdout.write(`${JSON.stringify(ACTIVE_BUILD)}\n`);
} else if (["--help", "help"].includes(command)) {
  process.stdout.write("TeamON Operator\n  setup [--config PATH] — подключить компанию, ключ скрыт в терминале\n  serve [--config PATH] — STDIO MCP (запускает ваш клиент)\n  doctor [--config PATH] [--live --instance ID] — локальная проверка или чтение выбранной компании\n  version — версия пакета и отпечаток UI\nDefault config: ~/.config/teamon-operator/operator.json (or TEAMON_OPERATOR_CONFIG)\nNever send credentials in chat or command arguments. Plugin installation does not require codex mcp add.\n");
} else if (command === "setup") {
  if (process.argv.some(arg => /^--(?:token|password)(?:=|$)/u.test(arg))) throw new Error("inline credentials are not allowed");
  try {
    const connected = await interactiveSetup(configPath);
    process.stdout.write(`${JSON.stringify(connected, null, 2)}\n`);
    if (connected.ok) process.stderr.write(`Подключено. Найдено агентов: ${connected.agentsObserved}. Переподключите MCP и откройте новый пульт. Не регистрируйте второй MCP поверх плагина.\n`);
  } catch (error) {
    const messages = { terminal_required: "Откройте интерактивный терминал для скрытого ввода ключа.", invalid_fields: "Проверьте поля: короткие ID латиницей, HTTPS origin без /v3.", already_configured: "Компания уже подключена. При обновлении повторять setup не нужно.", invalid_config: "Существующая конфигурация повреждена или неполна; она не перезаписана.", unreadable_config: "Файл конфигурации недоступен для чтения." };
    process.stderr.write(`Подключение не завершено (${error.name === "AbortError" ? "cancelled" : error.setupProblem || probeFailure(error).reason}). ${messages[error.setupProblem] || "Проверьте адрес, ключ, ID компании и отсутствие уже существующего подключения."} Ключ не отправляйте в чат.\n`);
    process.exitCode = 1;
  }
} else if (command === "serve") {
  const installation=await readInstallation(configPath,{deferAccount:true});
  if(installation.config) await serveOperatorMcp(installation.config);
  else await serveUnconfigured(configPath,installation.state);
} else if (command === "doctor") {
  try {
    const installation = await readInstallation(configPath);
    const status = installationStatus(installation.state, configPath);
    if (!installation.config) {
      process.stdout.write(`${JSON.stringify({ ok: false, ...status }, null, 2)}\n`);
      process.exitCode = 1;
    } else {
      const config = installation.config;
      const id = option("--instance");
      if (process.argv.includes("--live") && (!id || !config.instances.some(instance => instance.id === id))) {
        throw new Error("--live requires one configured --instance ID");
      }
      const report = { ok: true, ...status, validation: config.account ? "account_discovery_not_instance_health" : "local_config_only", operator: config.operator, hubs: config.hubs.length,
        instances: config.instances.map(({ id, runtime, hubId, desired }) => runtime === "core"
          ? { id, runtime: "core", mode: "native_operator_not_checked", liveChecked: false }
          : { id, hubId, application: desired.release.application, version: desired.release.version, liveChecked: false }) };
      if (process.argv.includes("--live")) {
        const service = new OperatorService(config);
        try {
          report.observed = (await service.instanceInspect(id)).observed;
          report.validation = "selected_instance_read";
          report.liveChecked = true;
          report.checkedInstanceId = id;
          report.instances.find(instance => instance.id === id).liveChecked = true;
          const features = report.observed.compatibility?.features || {};
          report.ok = !Object.values(features).some(feature => feature.status === "error");
          if (report.observed.health?.ok === false) report.ok = false;
          // Roster is required for a useful Core connection, not just public health.
          if (config.instances.find(instance => instance.id === id).runtime === "core" && !Array.isArray(report.observed.agents)) report.ok = false;
        } finally { await service.close(); }
      }
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      if (!report.ok) process.exitCode = 1;
    }
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, ...ACTIVE_BUILD, state: error.setupProblem || "check_failed", failure: probeFailure(error), note: "Проверьте конфигурацию и выбранный --instance. Raw errors/credentials не выводятся." })}\n`);
    process.exitCode = 1;
  }
} else if (command === "connect") {
  if (process.argv.some(arg => /^--(?:token|password)(?:=|$)/u.test(arg))) throw new Error("inline credentials are not allowed; use protected input");
  for (const name of ["--instance", "--url", "--operator"]) if (!option(name) || option(name).startsWith("--")) throw new Error(`${name} is required before connecting`);
  const connected = await connectCore({
    configPath, instanceId: option("--instance"), label: option("--label"), baseUrl: option("--url"),
    operatorId: option("--operator"), operatorName: option("--operator-name"), token: await credentialInput()
  });
  process.stdout.write(`${JSON.stringify({ ...connected,
    next: ["codex", "mcp", "add", "teamon-operator", "--", process.execPath, fileURLToPath(import.meta.url), "serve", "--config", connected.configPath]
  }, null, 2)}\n`);
} else {
  const config = (await readInstallation(configPath)).config;
  if(!config) throw new Error('Account login or protected local setup required');

  if (command === "credential-read" || command === "credential-store") {
    if (process.argv.some(arg => /^--(?:entries|token|password|secret)(?:=|$)/u.test(arg))) throw new Error("inline secrets are not allowed; use protected input");
    const instance = config.instances.find(value => value.id === option("--instance"));
    if (!instance || instance.runtime !== "core") throw new Error("select one configured Core company with --instance");
    const selection = coreCredentialSelectionSchema.parse({ connector: option("--connector"),
      ...(option("--agent") ? { agentId: option("--agent") } : {}), ...(option("--user") ? { userId: Number(option("--user")) } : {}) });
    const core = new CoreDashboard({ operator: config.operator });
    const snapshot = await core.connectorCredentialRead(instance, selection);
    if (command === "credential-read") process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    else {
      const revision = coreRevisionSchema.parse(option("--expected-revision"));
      if (revision !== snapshot.credential.revision) throw new Error("credential_changed: inspect the current target before supplying values");
      process.stderr.write(`${JSON.stringify({ instance: instance.id, ...snapshot.credential })}\n`);
      let entries;
      try { entries = JSON.parse(await credentialInput({ stdinFlag: "--entries-stdin", maxLength: 128 * 1024, prompt: "Named credential values as one JSON object (hidden): " })); }
      catch { throw new Error("Private input cancelled or invalid; expected one JSON object. No values sent."); }
      try {
        const stored = await core.connectorCredentialStore(instance, selection, revision, entries);
        process.stdout.write(`${JSON.stringify(stored, null, 2)}\n`);
      } catch (error) {
        // A lost receipt is not proof that the native write did not happen.
        process.stderr.write("No automatic retry. If the response was lost, inspect the current credential metadata and native audit; a changed revision alone is not proof of this write.\n");
        throw error;
      } finally { entries = undefined; }
    }
  } else {
    throw new Error(`unknown command: ${command}`);
  }
}
