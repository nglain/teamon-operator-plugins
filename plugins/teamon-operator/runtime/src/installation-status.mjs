import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import packageInfo from '../package.json' with { type: 'json' };
import { OPERATOR_UI_HTML } from './operator-ui.mjs';

export const ACTIVE_BUILD = Object.freeze({version:packageInfo.version,
  uiSha256:createHash('sha256').update(OPERATOR_UI_HTML).digest('hex'), node:process.versions.node});
const messages = {
  not_configured:'Войдите в TeamON. После входа здесь появятся компании, назначенные вам администратором.',
  account_pending:'Нажмите «Показать мои компании», чтобы проверить вход и загрузить доступные компании.',
  account_login_required:'Сеанс входа завершён или недействителен. Войдите снова; настройки компаний не удалены.',
  account_service_unavailable:'Master сейчас недоступен. Повторите загрузку компаний позже; повторный вход пока не требуется.',
  account_reconnect_required:'Настроен личный вход через Master вместо прямых подключений. Переподключите MCP и откройте новый пульт; старые настройки сохранены, но здесь больше не используются.',
  account_changed:'Выполнен вход под другим оператором. Переподключите MCP и откройте новый пульт, чтобы не смешивать контекст разных людей.'
};
export function installationStatus(state = 'configured', configPath) {
  return {...ACTIVE_BUILD,state,liveChecked:false,accountLogin:!!configPath,
    ...(state !== 'configured' ? {message:messages[state] || messages.not_configured,
      setupCommand:[process.execPath,fileURLToPath(new URL('./cli.mjs',import.meta.url)),'setup','--config',configPath]} : {}),
    note:'Версия относится к этому запущенному MCP. Доступ к компании и выполнение действий проверяются отдельно.'};
}
export function registerInstallationStatus(server, status) {
  server.registerTool('installation_status', {
    description:'Read the running Operator package/UI fingerprint and last observed setup state. No remote checks, credentials or mutations.',
    inputSchema:{},outputSchema:z.looseObject({version:z.string(),state:z.string()}),
    annotations:{readOnlyHint:true,openWorldHint:false}
  }, async () => {
    const value = typeof status === 'function' ? status() : status;
    return {content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};
  });
}
