import { readFile, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import packageInfo from "../package.json" with { type: "json" };
import { parseOperatorConfig } from "./config.mjs";
import { OPERATOR_UI_HTML, OPERATOR_UI_URI, operatorUiResource } from "./operator-ui.mjs";
import { readAccountConfig } from './account-config.mjs';
import { registerAccountLogin } from './account-login.mjs';

export const ACTIVE_BUILD = Object.freeze({
  version: packageInfo.version,
  uiSha256: createHash("sha256").update(OPERATOR_UI_HTML).digest("hex"),
  node: process.versions.node
});

export function installationPath(explicit, env = process.env, userHome = os.homedir()) {
  return path.resolve(explicit || env.TEAMON_OPERATOR_CONFIG || path.join(userHome, ".config", "teamon-operator", "operator.json"));
}

// Only an absent registry is onboarding. A missing Staff spec or broken JSON is an error.
export async function readInstallation(configPath) {
  try {
    const account=await readAccountConfig(configPath);
    if(account)return {state:'configured',config:account};
  } catch (error) {
    // Never fall back to a direct company credential after central auth fails.
    return {state:error.message==='account_login_required'?'account_login_required':'account_service_unavailable'};
  }
  let raw;
  try { raw = await readFile(configPath, "utf8"); }
  catch (error) {
    if (error.code === "ENOENT") {
      // A dangling registry symlink is not a fresh installation.
      try { await lstat(configPath); }
      catch (statError) { if (statError.code === "ENOENT") return { state: "not_configured" }; }
    }
    throw Object.assign(new Error("Configuration cannot be read"), { setupProblem: "unreadable_config" });
  }
  try { return { state: "configured", config: await parseOperatorConfig(JSON.parse(raw), configPath) }; }
  catch { throw Object.assign(new Error("Configuration is invalid or incomplete"), { setupProblem: "invalid_config" }); }
}

export function installationStatus(state = "configured", configPath) {
  return { ...ACTIVE_BUILD, state, liveChecked: false, accountLogin: !!configPath,
    ...(state !== "configured" ? {
      message: "Войдите в TeamON личным логином и паролем в браузере. Компании назначает администратор в Master. Если вход уже был выполнен, проверьте соединение с Master или войдите снова. Ручной setup остаётся для отдельных прямых подключений.",
      setupCommand: [process.execPath, fileURLToPath(new URL("./cli.mjs", import.meta.url)), "setup", "--config", configPath]
    } : {}),
    note: "Версия относится к этому запущенному MCP. Доступ к компании и выполнение действий проверяются отдельно."
  };
}

export function registerInstallationStatus(server, status) {
  server.registerTool("installation_status", {
    description: "Read the running Operator package/UI fingerprint and local setup state. No remote checks, credentials or mutations. After an update compare this running version with the expected release; reconnect the host and open a new card if stale.",
    inputSchema: {}, outputSchema: z.looseObject({ version: z.string(), state: z.string() }),
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async () => ({ content: [{ type: "text", text: JSON.stringify(status) }], structuredContent: status }));
}

export function createUnconfiguredMcpServer(configPath,state='not_configured') {
  const status = installationStatus(state, configPath);
  const server = new McpServer({ name: "teamon-operator", version: packageInfo.version }, {
    instructions: "TeamON Operator needs a connection. Show fleet_list. On explicit request to sign in, call account_login_open and open its browser URL. Passwords are entered only on Master, never in chat or tool arguments. The administrator assigns companies in Master Users. Reconnect after login. Manual protected local setup is a separate advanced option; never fall back to it after central authorization fails. No company access is implied by plugin installation."
  });
  registerInstallationStatus(server, status);
  registerAccountLogin(server,configPath);
  server.registerResource("operator-companies", OPERATOR_UI_URI, { mimeType: "text/html;profile=mcp-app" }, async () => operatorUiResource());
  const fleet = server.registerTool("fleet_list", {
    description: "Show the empty Operator workspace and protected setup instructions; does not contact a company.",
    inputSchema: {}, outputSchema: z.looseObject({ instances: z.array(z.unknown()) }),
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async () => {
    const value = { operator: { displayName: "Оператор" }, hubs: [], instances: [], installation: status };
    return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value };
  });
  server.server.oninitialized = () => {
    if (server.server.getClientCapabilities()?.extensions?.["io.modelcontextprotocol/ui"]?.mimeTypes?.includes("text/html;profile=mcp-app")) {
      fleet.update({ _meta: { ui: { resourceUri: OPERATOR_UI_URI } } });
    }
  };
  return server;
}

export async function serveUnconfigured(configPath,state) {
  const server = createUnconfiguredMcpServer(configPath,state);
  await server.connect(new StdioServerTransport());
  return server;
}
