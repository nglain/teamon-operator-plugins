import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import packageInfo from '../package.json' with { type: 'json' };

export const ACTIVE_BUILD = Object.freeze({version:packageInfo.version, node:process.versions.node});
const messages = {
  not_configured:'Войдите в TeamON через браузер. Затем укажите компанию, с которой хотите работать в чате.',
  account_pending:'Сохранённый вход ещё не проверен. Запросите проверку статуса с refresh_account:true; список компаний автоматически не выводится.',
  account_login_required:'Сеанс входа завершён или недействителен. Войдите снова; настройки компаний не удалены.',
  account_service_unavailable:'Master сейчас недоступен. Повторите проверку статуса позже; повторный вход пока не требуется.',
  account_reconnect_required:'Настроен личный вход через Master вместо прямых подключений. Переподключите MCP; старые настройки сохранены, но здесь больше не используются.',
  account_changed:'Выполнен вход под другим оператором. Переподключите MCP и явно выберите рабочую компанию, чтобы не смешивать контекст разных людей.'
};
export function installationStatus(state = 'configured', configPath) {
  return {...ACTIVE_BUILD,state,liveChecked:false,accountLogin:!!configPath,
    ...(state !== 'configured' ? {message:messages[state] || messages.not_configured,
      setupCommand:[process.execPath,fileURLToPath(new URL('./cli.mjs',import.meta.url)),'setup','--config',configPath]} : {}),
    note:'Версия относится к этому запущенному MCP. Доступ к компании и выполнение действий проверяются отдельно.'};
}
export function registerInstallationStatus(server, status) {
  server.registerTool('installation_status', {
    description:'Read the running package version and last observed connection state. Default is local, with no network or file writes. Set refresh_account:true explicitly after browser login or to recheck access: refresh the existing Master identity/assignments without returning a company list or probing companies. Does not start login, grant access or change agents. configured is not a company health check.',
    inputSchema:{refresh_account:z.boolean().optional()},outputSchema:z.looseObject({version:z.string(),state:z.string()}),
    annotations:{readOnlyHint:true,openWorldHint:true}
  }, async (input) => {
    const value = typeof status === 'function' ? await status(input) : status;
    return {content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};
  });
}
