# TeamON Installer

Separate small MCP App; working Operator remains plain MCP. No company access.
The source directory is a packaging template, **not a standalone installed plugin**.

## Установка из нашего каталога

Нужны Codex с поддержкой plugins/MCP Apps, Git и Node `>=24.14.1 <25` в PATH
приложения. macOS/Linux; Windows пока не принят. GitHub-аккаунт не требуется.

```sh
codex plugin marketplace add https://github.com/nglain/teamon-operator-plugins.git
codex plugin add teamon-installer@teamon-operator
```

Если каталог уже подключён к этому HTTPS-источнику на main, вместо первого
шага выполните `codex plugin marketplace upgrade teamon-operator`.
Каталог с другим источником или закреплённым ref не заменяйте автоматически.

1. В новом чате выберите **@TeamON Installer** и напишите «Покажи установку».
2. Нажмите **Установить Operator** в бело-золотой карточке. Этапы реальные;
   плавное движение между проверками — оценка. Время измеряется, не обещается.
3. После 100% нажмите **Начать**, при запросе Codex подтвердите отправку.
4. Продолжите в том же чате: подключение **@TeamON Operator**, браузерный вход,
   выбор компании, проверка доступа и короткий гайд. Если инструменты ещё не
   появились, выберите Operator через `@`; здоровый пакет не переустанавливайте.

Bootstrap самого Installer происходит до карточки. Рабочее место Operator —
обычный чат, не отдельная панель. Вход не означает доступ ко всем компаниям.
Пароли вводятся только на защищённой странице входа, не в чате.
Уже существующий Installer из `personal` не нужно устанавливать второй раз:
для перехода сначала явно выберите один источник и отключите старый helper.

## Сборка для разработчика

Build from the source repository with `node scripts/package-installer.mjs`.
It prints a self-contained candidate plugin path with pinned JS dependencies.
The build generates portable `plugin.json` and `mcp.json` from the authoring
manifest/config. Do not install the legacy-only template: on the observed Codex
build its `${PLUGIN_ROOT}` remains literal and the MCP process cannot start.
Before host testing, run `codex mcp get teamon-installer --json` and verify that
the launch path and cwd resolve to the installed bundle (no literal placeholder).
An absolute-path SDK smoke alone misses this packaging failure.
Node >=24.14.1 <25, Codex CLI with plugin commands, and Git must be installed.
For publication use `node scripts/package-installer.mjs --release` from a clean
committed source tree. It emits a new immutable build with relative file hashes
and source SHA in `distribution.json`. Copy only that plugin into the existing
TeamON catalog. Preserve the existing Operator artifact and publish the helper
under its own version. A release build does not itself publish or prove UI/login
acceptance. Default builds remain local candidates.

For developer protocol checks, run `node installer/mcp-server.mjs` from the
source repository with its dependencies installed. This starts stdio only;
it does not install Operator, open a browser, or read company credentials.

## Recipient behavior contract

1. Install/connect **TeamON Installer** using the host's plugin workflow. This
   bootstrap is outside the progress card, because the helper is not active yet.
2. Ask to open installation. `installer_open` shows a ready card, with no commands.
3. Click **Установить Operator**. One job owns all five verified stages. Keep the
   helper connected; the card polls status without another agent turn.
4. **100%** means package, enabled state and launcher verified, not company login.
5. **Начать** requests the next chat message. The host may ask consent. This is not
   an automatic plugin mention/activation or guaranteed composer prefill. Select
   `@TeamON Operator` if its tools are not attached, then sign in through its
   browser flow. No password belongs in the installer.
6. Continue in that same chat: check `installation_status`, offer browser login
   when needed, then after consent use `installation_status(refresh_account:true)`.
   Installation success is not the end of recipient onboarding. A development
   test may explicitly stop at Begin delivery; never copy that stop rule into
   the recipient flow. Do not reinstall a healthy package to connect its tools.
7. Ask which company to work with (or offer to list assigned companies on request).
   Check only the selected company's access; if it needs resource-bound login,
   guide that explicit login and check again. Zero assignments require the
   administrator, not another installation. Keep passwords out of chat.
8. Explain the workspace accurately: ordinary Codex chat, not a built-in Operator
   dashboard. Finish with a short guide: find an agent/conversation, inspect a
   request with evidence, read skills/connectors/identity, prepare a reply/change
   for confirmation. Do not send to employees or modify agents as an onboarding
   demonstration. Guide handed off and company access verified are separate facts.

On a lost response, **Проверить состояние** only reads the same run. It never
retries installation. A new helper process has a new ID: old cards cannot start
work there. Process loss aborts children where possible; inspect native package
state before any fresh attempt. No automatic rollback/removal. An intentionally
disabled Operator remains disabled and is reported for manual resolution.

Acceptance still requires observing this card in the actual host, followed by
isolated real installation. Mock bridge tests are not evidence of Codex rendering.
