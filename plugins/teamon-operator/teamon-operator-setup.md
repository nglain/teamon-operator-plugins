---
name: teamon-operator-setup
description: Установить, обновить или проверить TeamON Operator для работы с выбранной компанией в обычном чате. Золотая стартовая анимация встроена; MCP App пульта нет. Не обновляет серверы и не выдаёт доступ.
metadata:
  revision: "2026-09-10-chat-only"
---

# TeamON Operator: установка и обновление

## Сначала — золотая стартовая карточка

Короткое «установи, пожалуйста» с этим файлом означает: показать стартовую
карточку → установить пакет → проверить доступность MCP-инструментов →
предложить браузерный вход → работать с выбранной компанией в этом же чате.
Само прикрепление файла ничего не запускает. Просьба «проверь» разрешает только
диагностику; «открой / подключи Operator» после установки — продолжение, не переустановка.
Явные «без анимации» и «только пакет» имеют приоритет.

Для новой установки/обновления, если стартовая карточка ещё не показана:

1. Прочитай этот файл и доступные инструкции визуализации. Извлеки весь HTML
   между маркерами `TEAMON_SETUP_VIEW:BEGIN` / `TEAMON_SETUP_VIEW:END`, убрав
   только Markdown-ограждение, в разрешённый файл на этом компьютере.
   Начальное состояние уже задано: 0% и кнопка «Начать».
2. Покажи его встроенной визуализацией в ПЕРВОМ итоговом ответе и закончи ответ.
   До показа не обновляй каталог, не устанавливай пакет и не запускай это в фоне.
   Чтение навыка и извлечение карточки допустимы.
3. После «Начать» / «Начинай» продолжай исходный запрос в этом же чате.
   Не повторяй карточку 0%, не спрашивай разрешение заново, не создавай другую задачу.

Для Codex с объявленной поддержкой `visualize` формат итогового показа:

```text
visualize{"path":"<фактический абсолютный путь к извлечённому HTML>"}
```

Используй reference вне блока кода, на отдельной строке итогового ответа.
Ссылка на HTML, создание файла или чтение его содержимого не означают показ.
Если хост объявляет другой механизм, следуй его документации. Не выдумывай
промежуточные каналы или автозапуск. Operator для этой анимации НЕ нужен.

Если визуализация недоступна, выясни это ДО установки. Предложи выбрать
`@Visualize`, если он доступен, либо продолжить текстом. Не пропускай оформление
молча и не устанавливай другие плагины ради него. При явном выборе текстового
режима продолжай без карточки. Если MCP уже установлен и нужно только войти,
переходи к разделу 3: повторный старт и переустановка не нужны.

## 1. Проверить среду, сохранить существующее

Канонический каталог: `https://github.com/nglain/teamon-operator-plugins.git`.
Плагин: `teamon-operator@teamon-operator`. Источник публичный; пользователю
не нужно вводить адрес вручную. Используй текущую основную ветку без старого
`--ref`, а не принудительно указанную в этом файле версию.

Новый chat-only contract подготовлен для 0.2.11. Публикация и установка — отдельные
факты: не утверждай наличие этой поставки в каталоге без проверки. Если каталог
ещё предлагает старый runtime с пультом, сообщи, что chat-only поставка ещё не
доступна. Не выдавай старую версию за новую, не патчи installed cache и не
создавай второй MCP для обхода. Более новая версия допустима при том же контракте.

Кратко сообщи о начале проверки и сохранении подключений, затем выполни:

```sh
codex --version
git --version
node --version
codex plugin marketplace list --json
codex plugin list --available --json
```

При расхождении CLI используй соответствующий `--help`; не угадывай поля.
Различай доступный в каталоге, установленный, включённый и запущенный пакет.
Версия Node в терминале не доказывает, какой executable запускает MCP в приложении.
Проверяй `engines` и launcher выбранного пакета: у 0.2.11 диапазон
`>=24.14.1 <25`, не произвольная «последняя Node».

При установке/обновлении выполняй обычные необходимые шаги самостоятельно.
Если зависимости нет, сначала найди подходящую установленную; при необходимости
используй поддерживаемую установку для текущего пользователя из официального
источника. Не заменяй системную Node, не используй автоматически `sudo npm`
или непроверенный `curl | sh`. Обязательные разрешения среды сохраняются.

Не обходи предупреждение macOS о вредоносном ПО снятием quarantine:
проверь происхождение executable и официальный путь переустановки.
Не восстанавливай автоматически отключённые подключения, в том числе Larry.
Не трогай Master, Core, серверы, назначения операторов, токены и личные профили.
Не удаляй registry, сессии, credentials или старый standalone MCP «для чистоты».

## 2. Установить / обновить через существующий каталог

Если официального каталога нет:

```sh
codex plugin marketplace add https://github.com/nglain/teamon-operator-plugins.git
```

Если он есть и не закреплён на старом ref:

```sh
codex plugin marketplace upgrade teamon-operator
```

Для запроса актуальной установки переведи старый tag/commit того же официального
каталога на main без отдельного вопроса; явная просьба оставить версию важнее.
Сначала проверь CLI help на поддерживаемый способ смены ref. Если требуется
remove/add каталога, это именно запись каталога, НЕ `plugin remove` и НЕ
удаление установленного пакета/подключений. Выполняй только после проверки
точного источника и сохранности установленной регистрации. Не повторяй remove
при сетевой ошибке. Другой источник под тем же именем или developer/local
вариант не заменяй молча.

Сравни установленную версию с актуальной в обновлённом каталоге. Если плагина
нет или доступна новая версия:

```sh
codex plugin add teamon-operator@teamon-operator
```

Успешная CLI-установка не требует второй установки через графический магазин.
Обновление каталога не доказывает обновления плагина: перечитай его версию.
Актуальный исправный пакет не переустанавливай. Не обновляй чужие каталоги
командой без имени. Не создавай `codex mcp add` поверх плагина, не редактируй
config.toml/кэш вручную. Если внутри пакета есть пользовательские правки,
сначала предупреди о замене и предложи отдельно сохранить их.

## 3. Проверить MCP в текущем чате — без пульта

Проверь реально доступные инструменты, используя поиск хоста для отложенной
загрузки. Если плагин не выбран, предложи выбрать `@TeamON Operator` здесь.
Простое текстовое название не доказывает активацию. Не создавай другую задачу.

Вызови `installation_status` без параметров: это локальная версия и последнее
наблюдаемое состояние, не запрос компаний. `not_configured` — нормальное
ожидание входа; bootstrap tools уже должны быть доступны. Код 1 от `doctor`
вместе с этим состоянием сам по себе не означает поломку или недоступность Master.

Chat-only runtime не объявляет Apps resources, `_meta.ui` или
`workspace_view_*`. `installation_status` поддерживает `refresh_account`.
Не вызывай `fleet_list` при старте и не пытайся открыть/прочитать старый UI-ресурс.
Полный список компаний выводится только по запросу пользователя.

Если tools не появились после выбора плагина:

1. Проверь installed/enabled, источник, путь пакета и профиль Codex.
   Cache/available не означают включение в нужном desktop-профиле.
2. Найди конкретную ошибку startup/handshake: время, launcher, его Node, причина.
   Показывай только нужные очищенные строки, не полные конфиги/логи/истории/токены.
3. При необходимости проверь установленный distribution отдельно: `version`,
   затем ограниченный по времени `initialize → tools/list → installation_status`
   через поставляемый SDK, с пустым временным config и закрытием клиента в finally.
   Не запускай login или компанию из такой пробы. Отдельный процесс — не
   подключение к текущему чату; `version`/`doctor` даже handshake не проверяют.
4. Старая standalone-регистрация сама по себе не доказывает конфликт.
   Не отключай её без проверенной замены и согласованного перехода.

Только если ошибок запуска не найдено, а хост не подхватывает установку, предложи
один штатный reconnect или один новый чат. Переход делает человек; автоматические
задачи/handoff запрещены. Не устраивай циклы reinstall/restart. Если причина
не установлена, так и скажи; запроси конкретную недостающую диагностику.

## 4. Браузерный вход и конкретная компания

После установки предложи войти. Если человек уже попросил подключить аккаунт /
помочь войти, вызови `account_login_open` без повторного разговорного согласования.
Покажи полученную ссылку обычной ссылкой в чате. Это браузерный вход, не форма MCP App.
Пароль вводит человек только на защищённой странице Master; не проси его в чате.

После подтверждения в браузере человек возвращается сюда. Вызови
`installation_status({"refresh_account":true})`: он обновляет прежний account
binding без вывода списка компаний. `configured` подтверждает проверенный
вход, но не доступность агента или успешное внешнее действие.
`assignedCompanies: 0` — нужны назначения от администратора Master, а не переустановка.
Недоступный Master не равен отозванному входу. Смена уже привязанного оператора
или переход с manual connections требует reconnect; старые файлы не удаляются.

Работай с компанией, названной человеком:

- Если её точный id уже известен — `instance_inspect` этой компании.
- Если известно только название — `fleet_list` с `search` по этому названию.
  Покажи только совпадения; при неоднозначности уточни, не выбирай случайную.
- Полный `fleet_list` без фильтра — лишь по явной просьбе показать доступные компании.
- Если компания требует отдельную resource authorization (`instance_login_required`),
  по запросу подключения вызови `instance_login_open` для неё, покажи браузерную
  ссылку и после подтверждения повтори её `instance_inspect`.
- Не подставляй account token вместо resource token, не обходи отказ другим
  подключением и не выдавай сохранённое назначение за работающий доступ.

После успешного чтения выбранной компании дай краткий итог и продолжай работу
в обычном чате. Никакого App-пульта, автопросмотра чужих компаний и массового аудита.
Контекст разных компаний не смешивается. Установка и вход не разрешают отправлять
сообщения, запускать агентов или менять настройки: для эффектов сохраняются
штатные preview → подтверждение точной операции → commit → receipt.
Master-админка операторов этим навыком не меняется.

## Оформление и честность результата

Сохрани встроенный HTML/CSS/контроллер целиком: золотой поток, свечение,
перекатывающиеся цифры, отметки, искры и пружинящий акцент. Не перерисовывай по памяти.
После извлечения вне JSON отличий быть не должно. Для новых снимков меняй только
JSON в `operator-setup-state`. Правильно сериализуй его, экранируя `<` как
`\u003c`. Не включай токены, OAuth-ссылки, пароли, полные логи или частные переписки.

Пять отметок — доля подтверждённых этапов, не процент скачивания или времени:

| Отметка | Доказательство для true |
| --- | --- |
| Среда | CLI, Git, подходящий Node и источник проверены. |
| Пакет | Установленная версия повторно проверена; это chat-only поставка. |
| MCP | Инструменты реально доступны в этом чате и installation_status ответил. |
| Вход | Свежий refresh_account подтвердил личный вход. |
| Компания | Явно выбранная компания успешно прочитана через instance_inspect. |

`verified` — пять boolean подряд, `from` — предыдущая подтверждённая отметка
этого запуска (0/20/40/60/80/100), `checkedAt` — время проверки ISO 8601.
`mode`: running / waiting / blocked / ready; ready допустим только после всех
пяти доказательств. `title`/`detail` — короткий статус и следующий шаг.
`startAction:true` допустим только для самой первой карточки: waiting, все false,
from:0, checkedAt:null. Для всех последующих снимков он false или отсутствует.
Кнопка отправляет один same-chat follow-up, не выполняет установку и не растит процент.

Карточка — снимок, не live-монитор. Запись нового HTML не перерисовывает старое
сообщение. После стартового клика веди короткие текстовые обновления;
новую визуализацию покажи на естественной остановке, входе, ошибке или завершении.
Не добавляй кнопки «Далее» между этапами. Не рисуй 100% до входа и проверки компании,
не растягивай работу искусственными паузами. Уважай reduced motion.
Справка: https://learn.chatgpt.com/docs/visualizations.

Итог различает: пакет установлен / MCP доступен именно здесь / вход проверен /
выбранная компания прочитана. Отдельная CLI-проба или локальные тесты не означают
успех на ноутбуке получателя. При незавершённом шаге назови его и одно следующее
действие. Не говори «всё готово», если реально проверен только пакет.
Справка подключения: https://learn.chatgpt.com/docs/plugins.

<!-- TEAMON_SETUP_VIEW:BEGIN -->
```html
<section id="operator-setup-installer" aria-label="Подтверждённые этапы подключения TeamON Operator">
  <style>
    #operator-setup-installer {
      --os-bg: light-dark(#fbf9f3, #171713);
      --os-text: light-dark(#29261e, #f5efdf);
      --os-muted: light-dark(#766c57, #b5ac96);
      --os-border: light-dark(#e2d9c5, #373429);
      --os-track: light-dark(#e9e1cf, #302e24);
      --os-gold: light-dark(#936509, #eac373);
      --os-metal: light-dark(#ba8326, #c8943b);
      --os-bright: light-dark(#f9d683, #ffe6a4);
      --os-halo: light-dark(#dbb65a42, #efbd532c);
      --os-chip: light-dark(#f0e8d5, #2b281e);
      --os-on-gold: light-dark(#fffaf0, #201b10);
      --os-inner: light-dark(#fffdf8, #25221a);
      --os-shadow: light-dark(#a1751520, #00000040);
      box-sizing: border-box; position: relative; isolation: isolate;
      width: 100%; max-width: 720px; margin: 0 auto; padding: 30px 32px 23px;
      border: 1px solid var(--os-border); border-radius: 26px;
      background: var(--os-bg); color: var(--os-text); overflow: hidden;
      font: 400 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-shadow: 0 12px 40px -22px var(--os-shadow);
      -webkit-font-smoothing: antialiased;
    }
    #operator-setup-installer * {box-sizing: border-box;}
    #operator-setup-installer .os-atmosphere {
      position: absolute; z-index: -1; inset: 0; pointer-events: none;
      background: radial-gradient(ellipse at 74% 48%, var(--os-halo), transparent 60%);
      opacity: .62;
    }
    #operator-setup-installer .os-header {display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;}
    #operator-setup-installer .os-brand {font-size: 11px; font-weight: 650; letter-spacing: .19em; color: var(--os-gold);}
    #operator-setup-installer .os-demo {font-size: 11px; letter-spacing: .03em; color: var(--os-muted); display: flex; align-items: center; gap: 7px;}
    #operator-setup-installer .os-demo::before {content: ""; width: 5px; height: 5px; border-radius: 50%; background: var(--os-gold);}
    #operator-setup-installer .os-hero {display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; margin: 33px 0 27px; min-height: 102px;}
    #operator-setup-installer .os-copy {min-width: 0; flex: 1;}
    #operator-setup-installer .os-eyebrow {color: var(--os-muted); font-size: 11px; font-weight: 500; letter-spacing: .12em; margin-bottom: 10px;}
    #operator-setup-installer h2 {font: 550 26px/1.15 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing: -.045em; color: var(--os-text); margin: 0 0 7px;}
    #operator-setup-installer .os-description {color: var(--os-muted); font-size: 13px; min-height: 19px;}
    #operator-setup-installer .os-number {display: flex; align-items: baseline; flex-shrink: 0; font-variant-numeric: tabular-nums; font-size: 72px; line-height: .94; letter-spacing: -.075em; font-weight: 450; transform-origin: 85% 80%; padding-bottom: 3px;}
    #operator-setup-installer .os-digits {display: flex; color: var(--os-gold); height: 1em; line-height: 1em; letter-spacing: -.055em;}
    #operator-setup-installer .os-digit-column {display: block; width: .58em; height: 1em; overflow: hidden; text-align: center;}
    #operator-setup-installer .os-digit-reel {display: block; transition: transform .22s cubic-bezier(.2,.75,.3,1);}
    #operator-setup-installer .os-digit-reel > span {display: block; height: 1em; background: linear-gradient(155deg, var(--os-text) 16%, var(--os-gold) 90%); color: var(--os-gold); background-clip: text; -webkit-text-fill-color: transparent;}
    #operator-setup-installer .os-percent {font-size: 23px; letter-spacing: -.04em; color: var(--os-gold); margin-left: 6px; font-weight: 400;}
    #operator-setup-installer .os-progress-zone {position: relative; padding: 6px 0;}
    #operator-setup-installer .os-track {position: relative; height: 12px; border-radius: 20px; background: var(--os-track); overflow: hidden;}
    #operator-setup-installer .os-fill {position: absolute; inset: 0; overflow: hidden; transform: scaleX(0); transform-origin: left; border-radius: inherit; background: linear-gradient(90deg, var(--os-metal), var(--os-gold) 55%, var(--os-bright)); will-change: transform;}
    #operator-setup-installer .os-fill::after {content: ""; position: absolute; inset: 0; background: linear-gradient(0deg, transparent, var(--os-bright)); opacity: .4;}
    #operator-setup-installer .os-stream {position: absolute; inset: 0; opacity: .48; transform: translateX(-100%); background: linear-gradient(100deg, transparent 32%, var(--os-bright) 49%, transparent 66%); animation: os-flow 2.3s ease-in-out infinite;}
    #operator-setup-installer .os-head {position: absolute; top: 5px; left: -7px; width: 14px; height: 14px; border-radius: 50%; background: var(--os-bright); box-shadow: 0 0 12px var(--os-gold), 0 0 34px var(--os-halo); pointer-events: none; opacity: 0; will-change: transform;}
    #operator-setup-installer .os-head::after {content: ""; position: absolute; inset: -15px; border-radius: 50%; background: radial-gradient(circle, var(--os-halo), transparent 70%);}
    #operator-setup-installer .os-sweep {position: absolute; inset: -2px 0; background: linear-gradient(100deg, transparent 30%, var(--os-bright) 50%, transparent 70%); opacity: 0; transform: translateX(-100%); pointer-events: none;}
    #operator-setup-installer .os-particles {position: absolute; inset: 0; pointer-events: none;}
    #operator-setup-installer .os-particle {position: absolute; top: 9px; left: 0; width: 3px; height: 3px; border-radius: 50%; background: var(--os-bright); opacity: 0; box-shadow: 0 0 7px var(--os-gold);}
    #operator-setup-installer .os-stages {display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); margin: 22px -8px 0; padding: 0; list-style: none; gap: 4px;}
    #operator-setup-installer .os-stage {display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--os-muted); font-size: 12px;}
    #operator-setup-installer .os-stage-dot {display: grid; place-items: center; width: 25px; height: 25px; border: 1px solid var(--os-border); border-radius: 50%; font-size: 11px; line-height: 1; position: relative; background: var(--os-bg);}
    #operator-setup-installer .os-stage[data-status="active"] {color: var(--os-gold);}
    #operator-setup-installer .os-stage[data-status="active"] .os-stage-dot {border-color: var(--os-gold); background: var(--os-chip); box-shadow: 0 0 0 4px var(--os-halo);}
    #operator-setup-installer .os-stage[data-status="done"] {color: var(--os-text);}
    #operator-setup-installer .os-stage[data-status="done"] .os-stage-dot {background: var(--os-gold); border-color: var(--os-gold); color: var(--os-on-gold); font-size: 13px;}
    #operator-setup-installer .os-footer {display: flex; align-items: center; justify-content: space-between; gap: 14px; padding-top: 23px; margin-top: 25px; border-top: 1px solid var(--os-border);}
    #operator-setup-installer .os-status {display: flex; align-items: center; gap: 8px; min-width: 0; color: var(--os-muted); font-size: 12px;}
    #operator-setup-installer .os-status-symbol {width: 16px; flex-shrink: 0; color: var(--os-gold); text-align: center; font-size: 16px; line-height: 1;}
    #operator-setup-installer button {font: 500 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--os-text); background: var(--os-inner); border: 1px solid var(--os-border); border-radius: 11px; padding: 11px 15px; cursor: pointer; min-height: 40px; white-space: nowrap; flex-shrink: 0; transition: background .18s, border-color .18s;}
    #operator-setup-installer button:hover {background: var(--os-chip); border-color: var(--os-gold);}
    #operator-setup-installer .os-note {font-size: 11px; color: var(--os-muted); margin-top: 12px;}
    #operator-setup-installer .os-sr {position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap;}
    #operator-setup-installer[data-playback="paused"] .os-stream,
    #operator-setup-installer[data-playback="complete"] .os-stream {animation-play-state: paused;}
    #operator-setup-installer[data-phase="confirmed"] .os-status,
    #operator-setup-installer[data-playback="complete"] .os-status {color: var(--os-gold);}
    #operator-setup-installer[data-playback="complete"] .os-head {opacity: 0 !important;}
    @keyframes os-flow {0% {transform: translateX(-100%);} 100% {transform: translateX(100%);}}
    @media(max-width: 500px) {
      #operator-setup-installer {padding: 24px 21px 20px; border-radius: 22px;}
      #operator-setup-installer .os-hero {gap: 8px; margin: 25px 0 23px; min-height: 137px;}
      #operator-setup-installer h2 {font-size: 23px; min-height: 2.3em;}
      #operator-setup-installer .os-number {font-size: 55px;}
      #operator-setup-installer .os-percent {font-size: 19px; margin-left: 3px;}
      #operator-setup-installer .os-description {font-size: 12px; min-height: 4.35em;}
      #operator-setup-installer .os-stage {font-size: 11px;}
      #operator-setup-installer .os-footer {gap: 8px; padding-top: 20px;}
      #operator-setup-installer button {min-height: 44px; padding: 10px 12px;}
    }
    @media(max-width: 355px) {
      #operator-setup-installer {padding: 22px 16px 18px;}
      #operator-setup-installer .os-brand {letter-spacing: .12em;}
      #operator-setup-installer .os-demo {font-size: 11px;}
      #operator-setup-installer h2 {font-size: 21px;}
      #operator-setup-installer .os-number {font-size: 49px;}
    }
    @media(prefers-reduced-motion: reduce) {
      #operator-setup-installer .os-stream {animation: none;}
      #operator-setup-installer button {transition: none;}
      #operator-setup-installer .os-head {display: none;}
      #operator-setup-installer .os-digit-reel {transition: none;}
    }
  #operator-setup-installer .os-copy,#operator-setup-installer .os-status {overflow-wrap:anywhere;}
    #operator-setup-installer button:disabled {cursor:default;}
  </style>
  <div class="os-atmosphere" aria-hidden="true"></div>
  <header class="os-header">
    <span class="os-brand">TEAMON / OPERATOR</span>
    <span class="os-demo">Ход подключения</span>
  </header>
  <div class="os-hero">
    <div class="os-copy">
      <div class="os-eyebrow">ЭТАП <span class="os-step-count">01 / 05</span></div>
      <div class="os-changing">
        <h2>Начнём подключение</h2>
        <div class="os-description">Проверим среду и установим актуальный плагин. Ваши подключения сохраним</div>
      </div>
    </div>
    <div class="os-number" aria-hidden="true"><span class="os-digits"><span class="os-digit-column" style="visibility:hidden"><span class="os-digit-reel">0</span></span><span class="os-digit-column" style="visibility:hidden"><span class="os-digit-reel">0</span></span><span class="os-digit-column"><span class="os-digit-reel">0</span></span></span><span class="os-percent">%</span></div>
  </div>
  <div class="os-progress-zone">
    <div class="os-track" role="progressbar" aria-label="Доля пяти подтверждённых этапов" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
      <div class="os-fill"><div class="os-stream"></div></div>
      <div class="os-sweep" aria-hidden="true"></div>
    </div>
    <div class="os-head" aria-hidden="true"></div>
    <div class="os-particles" aria-hidden="true"></div>
  </div>
  <ol class="os-stages" aria-label="Этапы подключения">
    <li class="os-stage" data-status="active"><span class="os-stage-dot" aria-hidden="true">1</span><span>Среда</span></li>
    <li class="os-stage" data-status="pending"><span class="os-stage-dot" aria-hidden="true">2</span><span>Пакет</span></li>
    <li class="os-stage" data-status="pending"><span class="os-stage-dot" aria-hidden="true">3</span><span>MCP</span></li>
    <li class="os-stage" data-status="pending"><span class="os-stage-dot" aria-hidden="true">4</span><span>Вход</span></li>
    <li class="os-stage" data-status="pending"><span class="os-stage-dot" aria-hidden="true">5</span><span>Компания</span></li>
  </ol>
  <footer class="os-footer">
    <div class="os-status"><span class="os-status-symbol" aria-hidden="true">·</span><span class="os-status-text">Готовы начать</span></div>
    <button type="button" class="os-control">Начать</button>
  </footer>
  <div class="os-note">Проверенных этапов пока нет</div>
  <div class="os-sr" aria-live="polite" aria-atomic="true"></div>
  <script type="application/json" id="operator-setup-state">
{"checkedAt":null,"verified":[false,false,false,false,false],"from":0,"mode":"waiting","startAction":true,"title":"Начнём подключение","detail":"Проверим среду и установим актуальный плагин. Ваши подключения сохраним"}
  </script>
  <script>
(() => {
  const root = document.getElementById('operator-setup-installer');
  const el = selector => root.querySelector(selector);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const button = el('.os-control'), track = el('.os-track'), fill = el('.os-fill'), head = el('.os-head');
  const stages = [...root.querySelectorAll('.os-stage')];
  const columns = [...root.querySelectorAll('.os-digit-column')];
  const reels = [...root.querySelectorAll('.os-digit-reel')], places = [100, 10, 1];
  let state, count = 0, valid = true;
  try {
    state = JSON.parse(el('#operator-setup-state').textContent);
    if (!Array.isArray(state.verified) || state.verified.length !== 5 || state.verified.some(v => typeof v !== 'boolean')) throw Error();
    while (count < 5 && state.verified[count]) count++;
    if (state.verified.slice(count).some(Boolean)) throw Error();
    if (!['running', 'waiting', 'blocked', 'ready'].includes(state.mode)) throw Error();
    if ((state.mode === 'ready') !== (count === 5)) throw Error();
    if (state.checkedAt !== null && (typeof state.checkedAt !== 'string' || !Number.isFinite(Date.parse(state.checkedAt)))) throw Error();
    if (count > 0 && !state.checkedAt) throw Error();
    if (!Number.isInteger(state.from) || state.from < 0 || state.from > count * 20 || state.from % 20 !== 0) throw Error();
    if (typeof state.title !== 'string' || typeof state.detail !== 'string') throw Error();
    if (state.startAction !== undefined && typeof state.startAction !== 'boolean') throw Error();
    if (state.startAction && (count !== 0 || state.mode !== 'waiting' || state.checkedAt !== null)) throw Error();
  } catch {
    valid = false; count = 0;
    state = {from: 0, mode: 'blocked', checkedAt: null, title: 'Статус не подтверждён', detail: 'Нужна новая проверка. Эта карточка не подтверждает установку.'};
  }
  const target = count * 20;
  const startRequested = valid && state.startAction === true;
  let startState = 'idle';
  let animationEnabled = !motion.matches, visible = false, raf = 0, elapsed = 0, last = 0, shown = state.from;
  let width = track.getBoundingClientRect().width, finished = false;
  const effects = new Set();
  const particles = [];
  for (let i = 0; i < 12; i++) {
    const particle = document.createElement('span'); particle.className = 'os-particle';
    el('.os-particles').append(particle); particles.push(particle);
  }
  reels.forEach((reel, index) => {
    reel.textContent = '';
    for (let n = 0; n <= 100 / places[index]; n++) {
      const digit = document.createElement('span'); digit.textContent = String(n % 10); reel.append(digit);
    }
  });
  el('.os-demo').textContent = 'Ход подключения';
  el('h2').textContent = state.title;
  el('.os-description').textContent = state.detail;
  el('.os-step-count').textContent = `${String(Math.min(count + 1, 5)).padStart(2, '0')} / 05`;
  el('.os-status-symbol').textContent = state.mode === 'ready' ? '✓' : state.mode === 'blocked' ? '!' : '·';
  const statuses = {running: 'Проверяем следующий этап', waiting: 'Ожидаем ваше действие', blocked: 'Нужен следующий шаг', ready: 'Подключение проверено'};
  el('.os-status-text').textContent = statuses[state.mode];
  const timestamp = state.checkedAt ? new Date(state.checkedAt).toLocaleString('ru-RU', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}) : 'пока без проверки';
  el('.os-note').textContent = `Срез: ${timestamp} · проверено ${count} из 5 этапов`;
  el('.os-sr').textContent = `${state.title}. ${state.detail}. Проверено ${count} из 5 этапов.`;
  track.setAttribute('aria-label', 'Доля пяти подтверждённых этапов подключения');
  root.dataset.valid = String(valid); root.dataset.mode = state.mode; root.dataset.target = String(target);
  function animate(node, frames, options) {
    if (!animationEnabled || !node.animate) return;
    const effect = node.animate(frames, options); effects.add(effect);
    effect.onfinish = () => {effects.delete(effect); effect.cancel();};
    effect.oncancel = () => effects.delete(effect);
  }
  function draw(value) {
    shown = Math.max(state.from, Math.min(target, value));
    const integer = Math.floor(shown + .00001);
    fill.style.transform = `scaleX(${shown / 100})`;
    head.style.transform = `translateX(${Math.min(width - 1, width * shown / 100)}px)`;
    head.style.opacity = shown > 0 && shown < 100 && state.mode === 'running' ? '1' : '0';
    reels.forEach((reel, i) => {
      reel.style.transform = `translateY(-${Math.floor(integer / places[i])}em)`;
      columns[i].style.visibility = integer >= places[i] || i === 2 ? 'visible' : 'hidden';
    });
    stages.forEach((node, i) => {
      const done = integer >= (i + 1) * 20 && i < count;
      node.dataset.status = done ? 'done' : i === count ? 'active' : 'pending';
      node.querySelector('.os-stage-dot').textContent = done ? '✓' : i === count && state.mode === 'blocked' ? '!' : String(i + 1);
      node.setAttribute('aria-label', `${node.lastElementChild.textContent}: ${done ? 'проверено' : i === count ? statuses[state.mode] : 'не проверено'}`);
    });
    track.setAttribute('aria-valuenow', String(integer)); root.dataset.progress = String(integer);
  }
  function celebrate() {
    if (!count || target <= state.from || state.mode === 'blocked' || state.mode === 'waiting') return;
    animate(stages[count - 1].firstElementChild, [{transform:'scale(.7)'}, {transform:'scale(1.19)',offset:.5}, {transform:'scale(1)'}], {duration:520,easing:'cubic-bezier(.2,.75,.25,1)'});
    animate(el('.os-number'), [{transform:'scale(1)'},{transform:'scale(1.045)',offset:.4},{transform:'scale(1)'}], {duration:620,easing:'ease-out'});
    animate(el('.os-sweep'), [{transform:'translateX(-100%)',opacity:0},{transform:'translateX(-30%)',opacity:.58,offset:.34},{transform:'translateX(100%)',opacity:0}], {duration:count === 5 ? 1150 : 740,easing:'cubic-bezier(.16,.6,.2,1)'});
    animate(el('.os-atmosphere'), [{opacity:.62},{opacity:1,offset:.36},{opacity:.62}], {duration:1200,easing:'ease-out'});
    particles.forEach((node, i) => {
      const angle = (-160 + i * 27) * Math.PI / 180, distance = 18 + (i % 4) * 9;
      node.style.left = Math.min(width - 7, width * target / 100) + 'px';
      animate(node, [{transform:'translate(0,0) scale(.3)',opacity:0},{opacity:.85,offset:.14},{transform:`translate(${Math.cos(angle)*distance}px,${Math.sin(angle)*distance}px) scale(.1)`,opacity:0}], {duration:750+(i%3)*110,delay:(i%3)*28,easing:'cubic-bezier(.12,.65,.22,1)'});
    });
  }
  function playback() {
    root.dataset.playback = finished && state.mode === 'ready' ? 'complete' : animationEnabled && visible && !document.hidden && state.mode === 'running' ? 'playing' : 'paused';
    root.dataset.action = startRequested ? 'start' : 'motion';
    if (startRequested) {
      button.textContent = {idle:'Начать',pending:'Передаём в чат…',sent:'Продолжение в чате',unknown:'Проверьте чат'}[startState];
      button.disabled = startState !== 'idle';
      el('.os-status-text').textContent = {idle:'Готовы начать',pending:'Передаём запрос',sent:'Запрос передан',unknown:'Продолжите в чате'}[startState];
    } else {
      button.textContent = motion.matches ? 'Без движения' : animationEnabled ? 'Убрать анимацию' : 'Включить анимацию';
      button.disabled = motion.matches;
    }
    reels.forEach(reel => {reel.style.transition = animationEnabled ? '' : 'none';});
  }
  function settle(withEffects) {
    finished = true; draw(target);
    root.dataset.phase = count > 0 && (state.mode === 'running' || state.mode === 'ready') ? 'confirmed' : state.mode;
    if (count > 0 && target > state.from && state.mode === 'running') {
      el('.os-status-symbol').textContent = '✓';
      el('.os-status-text').textContent = `Этап ${count} пройден`;
    }
    playback();
    if (withEffects) celebrate();
  }
  function frame(now) {
    raf = 0;
    if (!root.isConnected || !visible || document.hidden || finished) {last = 0; return;}
    if (last) elapsed += Math.min(now - last, 100);
    last = now;
    const t = animationEnabled ? Math.min(1, elapsed / 1350) : 1;
    draw(state.from + (target - state.from) * (t*t*(3-2*t)));
    if (t === 1) {settle(true); return;}
    raf = requestAnimationFrame(frame);
  }
  function schedule() {
    playback();
    if (!finished && !raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function disableMotion() {
    for (const effect of [...effects]) effect.cancel();
    settle(false);
  }
  button.addEventListener('click', async () => {
    if (startRequested) {
      if (startState !== 'idle') return;
      startState = 'pending'; playback();
      const note = el('.os-note');
      if (typeof window.openai?.sendFollowUpMessage !== 'function') {
        startState = 'unknown'; playback();
        note.textContent = 'Напишите «Начинай» в этом чате. Установка ещё не запускалась.';
        el('.os-sr').textContent = note.textContent;
        return;
      }
      try {
        await window.openai.sendFollowUpMessage({
          prompt: 'Продолжи ранее запрошенную установку или обновление TeamON Operator по приложенному в этом чате навыку. Стартовая карточка уже показана — не показывай её повторно и не спрашивай подтверждение установки заново. Сначала проверь текущее состояние; если пакет уже установлен и исправен, не переустанавливай его. Выполняй только исходно запрошенный объём. Оставайся в этом чате, не создавай другую задачу и не меняй серверы или доступы. Вход подтверждает сам пользователь.',
          title: 'Продолжить установку TeamON Operator в этом чате'
        });
        startState = 'sent';
        note.textContent = 'Продолжение передано в чат. Результаты установки ещё не проверены.';
      } catch {
        startState = 'unknown';
        note.textContent = 'Отправка не подтверждена. Проверьте чат; если продолжения нет, напишите «Начинай». Автоматически не повторяем.';
      }
      playback(); el('.os-sr').textContent = note.textContent;
      return;
    }
    animationEnabled = !animationEnabled;
    if (!animationEnabled) disableMotion(); else playback();
  });
  motion.addEventListener('change', () => {animationEnabled = !motion.matches; if (!animationEnabled) disableMotion(); else playback();});
  new ResizeObserver(() => {width = track.getBoundingClientRect().width; draw(shown);}).observe(track);
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting; last = 0;
    for (const effect of effects) visible && !document.hidden ? effect.play() : effect.pause();
    schedule();
  }, {threshold:.2}).observe(root);
  document.addEventListener('visibilitychange', () => {last = 0; for (const effect of effects) document.hidden ? effect.pause() : effect.play(); schedule();});
  draw(state.from); playback();
  animate(el('.os-changing'), [{transform:'translateY(7px)',opacity:.25},{transform:'translateY(0)',opacity:1}], {duration:370,easing:'cubic-bezier(.2,.8,.2,1)'});
  if (!animationEnabled || target === state.from) settle(false);
})();
  </script>
</section>
```
<!-- TEAMON_SETUP_VIEW:END -->
