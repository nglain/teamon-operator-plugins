import { readFile, lstat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parseOperatorConfig } from './config.mjs';
import { readAccountConfig } from './account-config.mjs';
import { accountPath } from './account-session.mjs';
import { createBootstrapMcpServer } from './server.mjs';
export { ACTIVE_BUILD, installationStatus, registerInstallationStatus } from './installation-status.mjs';

export function installationPath(explicit, env = process.env, userHome = os.homedir()) {
  return path.resolve(explicit || env.TEAMON_OPERATOR_CONFIG || path.join(userHome,'.config','teamon-operator','operator.json'));
}
// MCP initialization is local. Account discovery requires an explicit status refresh or company lookup.
export async function readInstallation(configPath, {deferAccount = false} = {}) {
  if (deferAccount) {
    try { await lstat(accountPath(configPath)); return {state:'account_pending'}; }
    catch (error) { if (error.code !== 'ENOENT') return {state:'account_login_required'}; }
  } else {
    try {
      const account = await readAccountConfig(configPath);
      if (account) return {state:'configured',config:account};
    } catch (error) {
      // Never fall back to direct credentials after central auth fails.
      return {state:error.message === 'account_login_required' ? 'account_login_required' : 'account_service_unavailable'};
    }
  }
  let raw;
  try { raw = await readFile(configPath,'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') {
      try { await lstat(configPath); }
      catch (statError) { if (statError.code === 'ENOENT') return {state:'not_configured'}; }
    }
    throw Object.assign(new Error('Configuration cannot be read'),{setupProblem:'unreadable_config'});
  }
  try { return {state:'configured',config:await parseOperatorConfig(JSON.parse(raw),configPath)}; }
  catch { throw Object.assign(new Error('Configuration is invalid or incomplete'),{setupProblem:'invalid_config'}); }
}
export function createUnconfiguredMcpServer(configPath,state = 'not_configured',dependencies) {
  return createBootstrapMcpServer(configPath,state,dependencies).server;
}
export async function serveUnconfigured(configPath,state) {
  const server = createUnconfiguredMcpServer(configPath,state);
  await server.connect(new StdioServerTransport());
  return server;
}
