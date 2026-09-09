import { activityEpisodes, intentPreview } from './activity-presentation.mjs';
import packageInfo from '../package.json' with { type: 'json' };

export const OPERATOR_UI_URI = "ui://teamon-operator/companies.html";
export const OPERATOR_UI_HTML = String.raw`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TeamON · Оператор</title><style>
:root{color-scheme:light dark;--bg:light-dark(#faf8f3,#1b1915);--card:light-dark(#fffdf8,#27231c);--text:light-dark(#352e20,#f2ebde);--muted:light-dark(#756951,#bdb09a);--line:light-dark(#e6ddcb,#4b4030);--accent:light-dark(#876013,#e5bd68)}
*{box-sizing:border-box}body{margin:0;color:var(--text);font:14px/1.5 system-ui,sans-serif;background:transparent}main{border:1px solid var(--line);border-radius:18px;background:var(--bg);overflow:hidden}header{padding:22px 24px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:16px;align-items:center}.eyebrow{font-size:10px;letter-spacing:.17em;text-transform:uppercase;color:var(--accent);font-weight:700}h1{font-size:23px;letter-spacing:-.03em;margin:4px 0}h2{font-size:18px;margin:0 0 10px}h3{font-size:14px;margin:12px 0 5px}p{margin:5px 0}.muted{color:var(--muted);font-size:12px}.layout{min-height:390px}.layout.workspace{display:grid;grid-template-columns:225px minmax(0,1fr)}#people{padding:14px;border-right:1px solid var(--line);max-height:690px;overflow:auto}article{padding:20px 24px;min-width:0;max-height:690px;overflow:auto}.choice{display:block;width:100%;text-align:left;margin:7px 0;padding:13px;background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:11px;cursor:pointer;overflow-wrap:anywhere}.choice:hover,.choice[aria-current=true],.quiet[aria-current=true]{border-color:var(--accent);box-shadow:inset 3px 0 var(--accent)}button{font:inherit}button:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.quiet{border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--accent);padding:7px 10px;cursor:pointer}button:disabled{opacity:.5;cursor:default}.row{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(215px,100%),1fr));gap:12px}.grid .choice{margin:0;min-height:120px}.avatar{width:36px;height:36px;border:1px solid var(--line);border-radius:11px;display:grid;place-items:center;margin-bottom:12px;color:var(--accent);font-weight:700}.message,pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:14px;background:var(--card);border:1px solid var(--line);border-radius:11px;margin:10px 0;max-width:100%;font:inherit}.message strong{display:block;font-size:11px;color:var(--accent);margin-bottom:5px}details{margin:10px 0;border:1px solid var(--line);border-radius:10px;padding:12px;background:var(--card)}details details{background:var(--bg)}summary{cursor:pointer;font-weight:600;overflow-wrap:anywhere}.sources{padding-top:10px;min-width:0}.empty{padding:24px 0;color:var(--muted)}#breadcrumb{padding:0 24px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}footer{padding:13px 24px;border-top:1px solid var(--line)}#status{color:var(--muted);font-size:12px;overflow-wrap:anywhere;min-height:20px}#use-context{margin-bottom:7px}#people-toggle{display:none}[hidden]{display:none!important}@media(max-width:600px){header{padding:18px;align-items:flex-start}article{padding:18px}.layout.workspace{grid-template-columns:1fr}#people{border-right:0;border-bottom:1px solid var(--line);max-height:250px}.workspace #people-toggle{display:block}h1{font-size:20px}#breadcrumb,footer{padding-left:18px;padding-right:18px}}
.intent{padding:14px 16px}.intent summary{list-style:none;font-weight:400}.intent summary::-webkit-details-marker{display:none}.intent-meta{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;color:var(--muted);font-size:11px}.intent-title{font-size:15px;font-weight:600;margin:7px 0 5px}.intent-answer{color:var(--muted);font-size:13px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.intent-bottom{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:9px;font-size:11px;color:var(--muted)}.intent-badge{border:1px solid var(--line);border-radius:20px;padding:2px 8px}.intent-open{color:var(--accent)}.data-note{background:transparent;border:0;padding:4px 0}.data-note summary{font-weight:400;font-size:12px;color:var(--muted)}
</style></head><body><main><header><div><div class="eyebrow">TeamON / Operator</div><h1>Рабочее место оператора</h1><p id="identity" class="muted">Компании → агенты → люди и контекст</p></div><button id="refresh" class="quiet" disabled>Обновить</button></header>
<div id="breadcrumb" class="row" aria-label="Навигация"></div><div id="layout" class="layout"><aside id="people" aria-label="Пользователи" hidden></aside><article id="detail"><h2>Компании</h2><p class="empty">Ожидаю список подключений…</p></article></div>
<footer><button id="use-context" class="quiet" hidden>Работать в этом контексте</button> <button id="clear-context" class="quiet" hidden>Снять закрепление</button><div id="status" role="status" aria-live="polite">Подключение к MCP host…</div><div id="installation" class="muted">UI ${packageInfo.version} · MCP ещё не проверен</div></footer></main>
<script>
(() => {
  const activityEpisodes = ${activityEpisodes.toString()};
  const intentPreview = ${intentPreview.toString()};
  const el = id => document.getElementById(id), detail = el('detail'), status = el('status');
  const pending = new Map();
  let nextId = 0, ready = false, contextSupport = false, companies = [], company = null, agents = [], agent = null, person = null;
  let generation = 0, page = 'companies', tab = 'dialogues', conversation = null, configuration = null, showService = false;
  let sourceRefs = [], contextWanted = null, contextRunning = false, contextRevision = 0, pinnedScope = null;
  let selectedMessageIds = [], activityData = null;
  let installation = null;
  const peopleByAgent = new Map();
  const send = value => window.parent.postMessage(value, '*');
  function request(method, params) {
    const id = 'teamon-operator-' + (++nextId);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Host не ответил. Повторите чтение явно.')); }, 20000);
      pending.set(id, { resolve, reject, timer }); send({ jsonrpc:'2.0', id, method, params });
    });
  }
  function node(tag, text, className) { const item = document.createElement(tag); item.textContent = text; if (className) item.className = className; return item; }
  function button(text, action, style = 'choice') { const b = node('button', text, style); b.type = 'button'; b.disabled = !ready; b.addEventListener('click', action); return b; }
  function note(parent, text) { parent.append(node('p', text, 'muted')); }
  function json(parent, value) { parent.append(node('pre', JSON.stringify(value, null, 2))); }
  const agentName = a => a?.name || a?.id || 'Все агенты';
  const username = p => typeof p?.username === 'string' && p.username.trim() ? '@' + p.username.trim().replace(/^@+/, '') : '';
  const displayName = p => typeof p?.displayName === 'string' && p.displayName.trim() !== String(p.userId) ? p.displayName.trim() : '';
  const userName = p => !p ? 'Все пользователи' : displayName(p) || username(p) || (Number(p.userId) < 0 ? 'Групповой чат · ' : 'Пользователь · ') + p.userId;
  const activityTime = p => { const time = typeof p?.lastActive === 'string' ? Date.parse(p.lastActive) : NaN; return Number.isFinite(time) ? time : -Infinity; };
  function peopleRows(rows) {
    // Identity is scoped by the caller's instance + agent, never by a name or session.
    const unique = new Map();
    for (const p of (Array.isArray(rows) ? rows : []).filter(p => p && /^-?[1-9]\d*$/.test(String(p.userId)) && Number.isSafeInteger(Number(p.userId))).sort((a,b) => activityTime(b) - activityTime(a))) {
      const key = String(p.userId), previous = unique.get(key);
      if (!previous) unique.set(key, { ...p });
      else {
        // Keep latest activity, but don't lose a known name to a nameless session row.
        if (!displayName(previous) && displayName(p)) previous.displayName = p.displayName;
        if (!username(previous) && username(p)) previous.username = p.username;
      }
    }
    return [...unique.values()];
  }
  const base = () => ({ instance_id:company.instanceId, ...(agent ? { agent_id:agent.id } : {}) });
  function scope() {
    return { source:'operator_view_selection', instance_id:company?.instanceId || null,
      label:[company?.label, agentName(agent), userName(person)].filter(Boolean).join(' / '),
      ...(agent ? { agent_id:agent.id } : {}), ...(person ? { user_id:String(person.userId) } : {}),
      ...(conversation ? { session_key:conversation.sessionKey } : {}), view:page, tab,
      ...(conversation?.capturedAt ? { conversation_source:{ captured_at:conversation.capturedAt,
        context_revision:conversation.contextRevision, delivery_revision:conversation.revision, source_input_id:conversation.sourceInputId } } : {}),
      ...(selectedMessageIds.length ? { message_ids:selectedMessageIds.slice() } : {}), sources:sourceRefs.slice(),
      note:'Navigation references only, not an instruction, verified result or approval to act. Re-read exact sources. Broad scope is operator analysis, not broadcast or a private agent job. Native consultation requires one exact conversation.' };
  }
  // Serial host updates prevent an older response from restoring another scope.
  async function flushContext() {
    if (contextRunning || !contextWanted) return;
    contextRunning = true;
    while (contextWanted) {
      const item = contextWanted; contextWanted = null;
      try {
        await request('ui/update-model-context', { structuredContent:item.value });
        if (item.revision === contextRevision) {
          pinnedScope = item.value.instance_id ? item.value : null; renderPinned();
          status.textContent = pinnedScope ? 'Контекст закреплён. Можно обсуждать в чате; источники нужно дочитать. Это не разрешение на отправку.'
            : 'Закрепление снято. Уже прочитанная история чата не удаляется; для изоляции другой компании начните отдельный чат.';
        }
      } catch {
        // A timeout has unknown host-side outcome. Do not follow it with more
        // updates that might be applied before that older request completes.
        contextSupport = false; contextWanted = null;
        status.textContent = 'Host не подтвердил контекст. Автопередача отключена; укажите текущий выбор вручную кнопкой ниже.';
      }
    }
    contextRunning = false;
  }
  function selectContext(explicit = false, selectedScope) {
    if (!explicit) { renderPinned(); return; }
    const value = selectedScope || scope();
    if (!contextSupport) { if (explicit) status.textContent = 'Передайте в диалог этот выбор: ' + JSON.stringify(value); return; }
    contextWanted = { value, explicit, revision:++contextRevision };
    status.textContent = 'Передаю актуальный выбор в host…'; void flushContext();
  }
  function renderPinned() {
    el('clear-context').hidden = !pinnedScope;
    let label = el('pinned-context');
    if (!label) { label = node('p','','muted'); label.id = 'pinned-context'; el('status').before(label); }
    const name = pinnedScope && (companies.find(c=>c.instanceId === pinnedScope.instance_id)?.label || pinnedScope.instance_id);
    label.textContent = pinnedScope ? 'В чате закреплено: ' + (pinnedScope.label || name)
      + (pinnedScope.message_ids?.length ? ' · сообщений: ' + pinnedScope.message_ids.length : '')
      + '. Просмотр других карточек этот выбор не меняет.' : 'Контекст работы ещё не закреплён. Выберите случай и нажмите кнопку ниже.';
  }
  function transition() { generation++; configuration = null; sourceRefs = []; selectedMessageIds = []; activityData = null; showService = false; selectContext(); }
  async function call(name, args) {
    const response = await request('tools/call', { name, arguments:args });
    if (response.isError) {
      const reason = (response.content || []).filter(item => item.type === 'text' && typeof item.text === 'string').map(item => item.text).join(' ').slice(0,1000);
      throw new Error('Чтение недоступно: ' + name + (reason ? ' · ' + reason : '') + '. Остальные разделы доступны; это не запрет агенту.');
    }
    if (!response.structuredContent || typeof response.structuredContent !== 'object') throw new Error('Неподдерживаемый ответ: ' + name);
    return response.structuredContent;
  }
  async function load(parent, action, render) {
    if (!parent.isConnected) return;
    const version = generation, busy = node('p', 'Читаю…', 'muted'); parent.append(busy);
    try { const data = await action(); if (version !== generation || !parent.isConnected) return; busy.remove(); render(data); }
    catch (error) {
      if (version !== generation || !parent.isConnected) return;
      busy.textContent = error.message;
      const retry = button('Повторить чтение', () => { busy.remove(); retry.remove(); void load(parent, action, render); }, 'quiet'); parent.append(retry);
    }
  }
  function section(parent, label, render) {
    const box = node('details', ''), body = node('div', '', 'sources'); let opened = false;
    box.append(node('summary', label), body); parent.append(box);
    box.addEventListener('toggle', () => { if (box.isConnected && box.open && !opened) { opened = true; render(body); } }); return box;
  }
  function chrome() {
    el('layout').classList.toggle('workspace', page === 'workspace'); el('people').hidden = page !== 'workspace'; el('use-context').hidden = !company;
    const crumbs = el('breadcrumb'); crumbs.replaceChildren(button('Компании', showCompanies, 'quiet'));
    if (company) crumbs.append(button(company.label || company.instanceId, () => inspect(company), 'quiet'));
    if (page === 'workspace') crumbs.append(node('span', agentName(agent) + (person ? ' / ' + userName(person) : ' / Все пользователи'), 'muted'));
  }
  function companyCard(c) {
    const card = button('', () => inspect(c)); card.append(node('div', (c.label || c.instanceId).slice(0,2).toUpperCase(), 'avatar'), node('h3', c.label || c.instanceId));
    note(card, c.runtime === 'core' ? 'TeamON Core' : 'TeamON Staff');
    note(card, Array.isArray(c.observedAgents) ? c.observedAgents.length + ' агентов · срез ' + c.observedAt : 'Агенты и доступность — проверить при открытии');
    card.dataset.instance = c.instanceId; return card;
  }
  function renderFleet(payload) {
    if (!Array.isArray(payload?.instances)) return; companies = payload.instances;
    installation = payload.installation || null;
    el('installation').textContent = 'UI ${packageInfo.version} · MCP ' + (installation?.version || 'версия неизвестна') +
      (installation?.uiSha256 ? ' · UI hash ' + installation.uiSha256.slice(0,12) : '') +
      (installation?.version && installation.version !== '${packageInfo.version}' ? ' · Версии различаются: переподключите MCP и откройте новый пульт.' : '');
    el('identity').textContent = (payload.operator?.displayName || 'Оператор') + ' · подключений: ' + companies.length; showCompanies();
  }
  function showCompanies() {
    company = agent = person = conversation = null; agents = []; page = 'companies'; transition(); chrome();
    detail.replaceChildren(node('h2', 'Компании')); note(detail, 'Выберите инстанс. Наличие подключения не означает, что сервис и все сценарии исправны.');
    if(installation?.accountLogin) detail.append(button(installation.account ? 'Войти другим аккаунтом' : 'Войти в TeamON', async () => {
      try {
        const data=await call('account_login_open',{}); const url=new URL(data.url);
        if(url.origin!=='https://master.nglain.com' || url.pathname!=='/operator/authorize')throw new Error('Неожиданный адрес входа');
        const link=node('a','Открыть вход в браузере');link.href=url.href;link.target='_blank';link.rel='noreferrer noopener';detail.append(link);
        note(detail,'После входа переподключите MCP. Пароль вводите только в браузере Master, не в чате.');
        try{await request('ui/open-link',{url:url.href});}catch{}
      }catch{note(detail,'Не удалось начать вход. Переподключите Operator и повторите.');}
    }));
    const grid = node('div', '', 'grid'); companies.forEach(c => grid.append(companyCard(c))); detail.append(grid);
    if (!companies.length) {
      note(detail, installation?.message || 'Нет настроенных подключений. Добавьте адрес компании и её ключ через защищённый setup.');
      if (Array.isArray(installation?.setupCommand)) detail.append(node('pre', installation.setupCommand.map(value => "'" + String(value).replaceAll("'", "'\\''") + "'").join(' ')));
    }
  }
  function agentCard(a, action) {
    const card = button('', action); card.append(node('div', a ? agentName(a).slice(0,2).toUpperCase() : 'Все', 'avatar'), node('h3', agentName(a)));
    if (a) { note(card, [a.role, a.runtime, a.model].filter(Boolean).join(' · ')); note(card, (a.userCount ?? '—') + ' пользователей · ' + (a.assignedConnectors?.length ?? '—') + ' назначенных коннекторов'); }
    else note(card, 'Обзор компании. Не массовое поручение и не общая сессия.'); return card;
  }
  function renderAgents() {
    detail.replaceChildren(node('h2', company.label || company.instanceId)); note(detail, agents.length + ' агентов · назначение подключения не доказывает авторизацию и успешную работу');
    const grid = node('div', '', 'grid'); grid.append(agentCard(null, () => workspace(null))); agents.forEach(a => grid.append(agentCard(a, () => workspace(a)))); detail.append(grid);
  }
  function inspect(c) {
    peopleByAgent.clear();
    company = c; agent = person = conversation = null; agents = []; page = 'agents'; transition(); chrome(); detail.replaceChildren(node('h2', c.label || c.instanceId));
    void load(detail, () => call('instance_inspect', { instance_id:c.instanceId }), data => {
      if (!Array.isArray(data.observed?.agents)) { note(detail, 'Этот сервер не предоставил список агентов. Используйте текстовые инструменты с его native contract.'); return; }
      agents = data.observed.agents; c.observedAgents = agents; c.observedAt = new Date().toLocaleTimeString(); renderAgents();
    });
  }
  function workspace(a, p = null, selectedTab = company.runtime === 'core' ? 'activity' : 'dialogues') {
    agent = a; person = p; conversation = null; page = 'workspace'; tab = selectedTab; transition(); chrome(); renderPeople(); renderTab();
  }
  function renderPeople() {
    const nav = el('people'); nav.replaceChildren(node('h3', 'Пользователи'));
    const all = button('Все пользователи', () => workspace(agent)); all.setAttribute('aria-current', String(!person)); nav.append(all);
    if (company.runtime !== 'core') { note(nav, 'Пользовательская навигация пока доступна для Core. Беседы Staff доступны справа.'); return; }
    const peopleFor = (parent, a) => load(parent, () => call('agent_inspect', { instance_id:company.instanceId, agent_id:a.id }), data => {
      const people = peopleRows(data.people);
      peopleByAgent.set(a.id,people);
      note(parent, 'По последней активности · новые сверху');
      const appendPerson = (target, p) => {
        const b = button(userName(p), () => workspace(a, p)); b.dataset.userId = String(p.userId); b.title = 'ID ' + p.userId;
        b.setAttribute('aria-current', String(agent?.id === a.id && String(person?.userId) === String(p.userId)));
        const handle = username(p);
        if (handle && !userName(p).toLowerCase().includes(handle.toLowerCase())) note(b, handle);
        if (!displayName(p) && !handle) note(b, 'Имя аккаунта не сохранено');
        note(b, Number.isFinite(activityTime(p)) ? 'Активность: ' + new Date(activityTime(p)).toLocaleString('ru-RU') : 'Дата активности неизвестна');
        target.append(b);
      };
      people.filter(p => Number(p.userId) > 0).forEach(p => appendPerson(parent, p));
      const groups = people.filter(p => Number(p.userId) < 0);
      if (groups.length) section(parent, 'Групповые чаты · ' + groups.length, body => groups.forEach(p => appendPerson(body, p)));
      if (!people.length) note(parent, 'В этом срезе пользователей нет. История справа может содержать другие retained-беседы.');
    });
    if (agent) void peopleFor(nav, agent);
    else { note(nav, 'Раскройте агента для списка людей. Одинаковые имена не объединяются.'); agents.forEach(a => section(nav, agentName(a), body => void peopleFor(body, a))); }
  }
  function renderTab() {
    detail.replaceChildren();
    const toggle = button('Пользователи ▾', () => { el('people').hidden = !el('people').hidden; }, 'quiet'); toggle.id = 'people-toggle'; detail.append(toggle);
    detail.append(node('h2', agentName(agent) + (person ? ' / ' + userName(person) : '')));
    const tabs = node('div', '', 'row');
    [...(company.runtime === 'core' ? [['activity','Интенты'],['messages','Сообщения']] : []),['dialogues','Сессии'],['context','Контекст'],['settings',agent ? 'Настройки агента' : 'Агенты и настройки']].forEach(([id,label]) => {
      const b = button(label, () => { tab = id; selectContext(); renderTab(); }, 'quiet'); b.setAttribute('aria-current', String(tab === id)); tabs.append(b);
    }); detail.append(tabs); const body = node('div', ''); detail.append(body);
    if (tab === 'activity' || tab === 'messages') activity(body);
    else if (tab === 'dialogues') { if (conversation) history(body, conversation); else conversations(body); }
    else if (tab === 'context') contextView(body); else settings(body);
  }
  function openConversation(c, knownPerson, messageIds = []) {
    if (company.runtime === 'core') {
      const exactAgent = agents.find(a => a.id === c.agentId);
      if (!exactAgent || !Number.isSafeInteger(Number(c.userId)) || !Number(c.userId)) { status.textContent = 'Точная пара агент/пользователь не подтверждена. Прочитайте беседу через Operator.'; return; }
      person = knownPerson || (agent?.id === exactAgent.id && String(person?.userId) === String(c.userId) ? person : { userId:c.userId });
      agent = exactAgent; conversation = c; tab = 'dialogues'; transition(); chrome(); renderPeople();
    }
    conversation = c; selectedMessageIds = messageIds.slice(); tab = 'dialogues'; selectContext(); renderTab();
  }
  const dateLabel = ts => Number.isFinite(Date.parse(ts)) ? new Date(ts).toLocaleString('ru-RU') : 'Время не сохранено';
  function intentCards(parent, messages) {
    activityEpisodes(messages).forEach(e => {
      const box = node('details','','intent'); box.dataset.intentId = e.id;
      const clean = e.requestMissing ? 'Продолжение разговора' : intentPreview(e.title) || 'Сообщение без текста';
      const title = clean.length > 120 ? clean.slice(0,120) + '…' : clean;
      const summary = node('summary',''); box.append(summary);
      const a = agents.find(a=>a.id === e.agentId) || {id:e.agentId};
      const meta = node('div','','intent-meta');
      meta.append(node('span',userName({userId:e.userId,displayName:e.userName,username:e.username}) + ' → ' + agentName(a)),node('span',dateLabel(e.lastActive)));
      summary.append(meta,node('div',title,'intent-title'));
      const replies = e.messages.filter(m=>m.role === 'assistant');
      const answer = replies.at(-1);
      summary.append(node('div',answer ? 'Ответ: ' + (intentPreview(answer.preview) || 'Без текста') + (answer.previewTruncated ? '…' : '') : 'В загруженной истории ответа пока нет.','intent-answer'));
      const bottom = node('div','','intent-bottom'), facts = node('span','');
      facts.append(node('span',answer ? 'Агент ответил' : 'Нет ответа','intent-badge'));
      const ms = !e.requestMissing && replies.length ? Date.parse(replies[0].ts)-Date.parse(e.startedAt) : NaN;
      if (Number.isFinite(ms) && ms >= 0) {
        const seconds = Math.round(ms/1000);
        facts.append(document.createTextNode(' · До ответа: ' + (seconds < 60 ? seconds + ' с' : Math.floor(seconds/60) + ' мин' + (seconds%60 ? ' ' + seconds%60 + ' с' : ''))));
      }
      bottom.append(facts,node('span','Подробнее ›','intent-open')); summary.append(bottom);
      const body = node('div','','sources'); box.append(body);
      note(body,'Выполнение и принятие результата ещё не проверены. ' + e.userMessages + ' сообщ. пользователя · ' + e.agentMessages + ' сообщ. агента.');
      e.messages.forEach(m => {
        const line = node('div','','message'); line.append(node('strong',(m.role === 'user' ? 'Пользователь' : 'Агент') + ' · ' + dateLabel(m.ts)),node('div',(m.preview || '[Без текста]') + (m.previewTruncated ? '…' : ''))); body.append(line);
      });
      body.append(button('Выбрать для разбора',()=>openConversation(e,{userId:e.userId,displayName:e.userName,username:e.username},e.messageIds),'quiet'));
      parent.append(box);
    });
  }
  function activity(parent) {
    note(parent, tab === 'activity' ? 'Последние обращения · новые сверху' : 'Последние сообщения · новые сверху');
    void load(parent, () => activityData ? Promise.resolve(activityData) : call('activity_read', { ...base(), view:'messages', limit:50, ...(person ? { user_id:String(person.userId) } : {}) }), data => {
      activityData = data;
      const seen = new Set();
      const messages = (data.items || []).filter(m => {
        if (!['user','assistant'].includes(m.role) || !m.sessionKey || ['cron','api','unknown'].includes(m.channel)
          || agent && m.agentId !== agent.id || person && String(m.userId) !== String(person.userId)) return false;
        const key = JSON.stringify([m.sessionKey,m.agentId,String(m.userId),String(m.id)]); if (seen.has(key)) return false; seen.add(key); return true;
      }).sort((a,b) => activityTime({lastActive:b.ts}) - activityTime({lastActive:a.ts}));
      if (tab === 'activity') intentCards(parent,messages);
      else messages.forEach(m => {
        const p = { userId:m.userId, displayName:m.userName, username:m.username };
        const name = userName(p), handle = username(p), a = agents.find(a => a.id === m.agentId) || {id:m.agentId};
        const group = Number(m.userId) < 0;
        const heading = group ? (m.role === 'assistant' ? agentName(a) + ' → ' + name : 'Сообщение в чате «' + name + '»')
          : m.role === 'assistant' ? agentName(a) + ' → ' + name : name + ' → ' + agentName(a);
        const card = node('div', '', 'message'); card.dataset.activityId = m.id; card.dataset.userId = String(m.userId);
        card.append(node('strong', heading));
        if (handle && !name.toLowerCase().includes(handle.toLowerCase())) note(card, handle);
        const date = activityTime({lastActive:m.ts});
        note(card, (Number.isFinite(date) ? new Date(date).toLocaleString('ru-RU') : 'Время не сохранено') + ' · ' + (m.channel || 'Канал неизвестен') + (m.role === 'assistant' ? ' · Ответ агента' : ' · Сообщение пользователя'));
        card.append(node('div', typeof m.preview === 'string' && m.preview ? m.preview + (m.previewTruncated ? '…' : '') : '[Без текстового содержимого]'));
        card.append(button('Открыть беседу', () => openConversation({ ...m, logicalSessionId:m.sessionId }, p), 'quiet'));
        parent.append(card);
      });
      if (!messages.length) note(parent, 'В недавней выборке сообщений нет. Более старые беседы доступны во вкладке «Сессии».');
      if (data.unavailable?.length) note(parent, 'Не удалось прочитать бесед: ' + data.unavailable.length + '. Это не означает, что сообщений не было.');
      if (data.coverage?.namesAvailable === false) note(parent, 'Справочник имён недоступен; показаны известные имена из событий.');
      const info = section(parent,'О данных',body => {
        note(body,'Показаны недавние сохранённые сообщения, не весь внешний чат. Интенты сгруппированы предварительно: уточнение может относиться к прежнему обращению.');
        note(body,'«Агент ответил» не означает, что задача выполнена или результат принят. «До ответа» — время между сохранёнными сообщениями, включая ожидание, не время вычисления. Число сообщений — не число ходов модели.');
        note(body,'Для проверки результата и извлечения уроков откройте обращение и выберите его для разбора. Без источников выводы не добавляются.');
      }); info.classList.add('data-note');
    });
  }
  function conversations(parent) {
    note(parent, 'Сохранённые сессии · новые среди загруженных сверху. Серверные страницы могут быть не по свежести; для полноты загрузите остальные.');
    const serviceToggle = button(showService ? 'Скрыть служебные / cron' : 'Показать служебные / cron', () => { showService = !showService; renderTab(); }, 'quiet'); parent.append(serviceToggle);
    const list = node('div', ''), controls = node('div', '', 'row'); parent.append(list, controls); const seen = new Set(), cursors = new Set(), collected = []; let total = 0;
    function next(cursor) {
      controls.replaceChildren(); const args = { ...base(), ...(person ? { user_id:String(person.userId) } : {}), ...(cursor ? { cursor } : {}), limit:50 };
      void load(controls, () => call('conversations_list', args), data => {
        const rows = (data.conversations || []).filter(c => showService || !['cron','api'].includes(c.channel));
        rows.forEach(c => {
          if (agent && c.agentId !== undefined && c.agentId !== agent.id || person && String(c.userId) !== String(person.userId) || seen.has(c.sessionKey)) return;
          seen.add(c.sessionKey); total++; collected.push(c);
        });
        list.replaceChildren();
        collected.sort((a,b)=>activityTime(b)-activityTime(a)).forEach(c=>{
          const p = peopleByAgent.get(c.agentId)?.find(p=>String(p.userId) === String(c.userId));
          const description = c.title && !/^-?\d+$/.test(c.title) ? c.title : '';
          const title = p ? userName(p) + (description && description !== userName(p) ? ' · ' + description : '') : description || userName({userId:c.userId});
          const b = button(title,()=>openConversation(c,p));
          const a = agents.find(a=>a.id === c.agentId) || {id:c.agentId};
          note(b,[agentName(a),c.channel,dateLabel(c.lastActive)].filter(Boolean).join(' · ')); list.append(b);
        });
        note(controls, total + ' бесед в прочитанных страницах' + (data.coverage?.source === 'recent_activity_sample' ? ' · только выборка активности' : ''));
        if (data.nextCursor && !cursors.has(data.nextCursor)) { cursors.add(data.nextCursor); controls.append(button(rows.length ? 'Ещё беседы' : 'На этой странице нет совпадений · искать дальше', () => next(data.nextCursor), 'quiet')); }
        else if (data.nextCursor) note(controls, 'Сервер повторил курсор. Чтение остановлено; это не конец истории.');
        else note(controls, 'Конец доступной выборки; отсутствие здесь не означает удаление разговора.');
      });
    } next();
  }
  function history(parent, c) {
    parent.append(button('← Беседы', () => { conversation = null; selectContext(); renderTab(); }, 'quiet'));
    note(parent, 'Сохранённая история, не полный активный контекст модели. Публикация и поручение — отдельные действия в диалоге с Operator.');
    const selectionLabel = node('p','','muted'); parent.append(selectionLabel);
    const updateSelection = () => { selectionLabel.textContent = selectedMessageIds.length
      ? 'Для разбора выбрано сообщений: ' + selectedMessageIds.length + '. Нажмите «Работать в этом контексте»; затем задайте вопрос в чате.'
      : 'Можно выбрать отдельные сообщения или закрепить всю сессию. Это не отправит ничего пользователю.'; };
    updateSelection();
    const messages = node('div', ''), controls = node('div', '', 'row'); parent.append(controls, messages); const seen = new Set(), cursors = new Set();
    function older(cursor) {
      controls.replaceChildren();
      void load(controls, () => call('conversation_read', { instance_id:company.instanceId, session_key:c.sessionKey, limit:30, ...(cursor ? { before_message_id:cursor } : {}) }), data => {
        if (!cursor) conversation = {...conversation, capturedAt:data.capturedAt, contextRevision:data.contextRevision, revision:data.revision, sourceInputId:data.sourceInputId};
        const group = node('div', '');
        (data.messages || []).forEach(m => {
          if (m.id !== undefined && seen.has(m.id)) return; if (m.id !== undefined) seen.add(m.id);
          const box = node('div', '', 'message');
          const who = m.role === 'user' ? userName(person) : m.role === 'assistant' ? agentName(agent) : 'Системная запись';
          box.append(node('strong',who + ' · ' + dateLabel(m.ts || m.created_at)), node('div', typeof m.content === 'string' ? m.content : typeof m.text === 'string' ? m.text : '[Нет текстовой проекции]'));
          if (m.id !== undefined && m.id !== null) {
            const label = node('label',''), check = document.createElement('input'); check.type = 'checkbox';
            check.checked = selectedMessageIds.some(id=>String(id) === String(m.id));
            check.addEventListener('change',()=>{ selectedMessageIds = selectedMessageIds.filter(id=>String(id) !== String(m.id)); if(check.checked) selectedMessageIds.push(m.id); updateSelection(); });
            label.append(check,document.createTextNode(' Включить в разбор')); box.append(label);
          }
          group.append(box);
        }); messages.prepend(group);
        if (data.nextMessageCursor && !cursors.has(data.nextMessageCursor)) { cursors.add(data.nextMessageCursor); controls.append(button('Ранее', () => older(data.nextMessageCursor), 'quiet')); }
        if (data.truncated) note(controls, 'История показана частично.');
        if (data.nextMessageCursor && cursors.has(data.nextMessageCursor) && !controls.querySelector('button')) note(controls,'Сервер повторил курсор. Чтение остановлено; это не конец истории.');
      });
    } older();
  }
  function state() {
    if (!configuration) configuration = call('agent_configuration_read', base()).then(data => data.state).catch(error => { configuration = null; throw error; }); return configuration;
  }
  function readDocument(parent, target, label) {
    section(parent, label || target.path, body => void load(body, () => call('agent_document_read', { ...base(), target }), data => {
      const d = data.document; note(body, d.exists ? 'Источник: ' + target.scope + ' · revision ' + d.revision : 'Файл отсутствует'); body.append(node('pre', d.content || (d.exists ? '[Пустой файл]' : '[Нет источника]')));
      const ref = { agent_id:agent.id, target:d.target, revision:d.revision }; if (!sourceRefs.some(r => JSON.stringify(r) === JSON.stringify(ref))) sourceRefs.push(ref);
    }));
  }
  function inventory(parent, scopeName, label) {
    const selection = { scope:scopeName, ...(scopeName === 'user_context' ? { userId:Number(person.userId) } : {}), limit:100 };
    section(parent, label, body => void load(body, () => call('agent_documents_list', { ...base(), selection }), data => {
      (data.documents || []).forEach(d => readDocument(body, d.target, d.target.path + ' · ' + d.bytes + ' B'));
      note(body, data.truncated ? 'Серверная выборка ограничена; не показано: ' + data.omitted + '. Полнота не доказана.' : (data.documents?.length || 0) + ' документов в этом scope.');
    }));
  }
  function contextView(parent) {
    note(parent, 'Костюм читается по разделам. Доступно ≠ прочитано агентом. Просмотр здесь не загружает всё в модель оператора. Значения ключей не запрашиваются.');
    if (!agent) { note(parent, 'Для костюма выберите агента. Обзор компании не объединяет пользовательские сессии.'); agents.forEach(a => parent.append(agentCard(a, () => workspace(a, null, 'context')))); return; }
    if (company.runtime !== 'core') { note(parent, 'Для Staff используйте native context_read. Core-only источники не подменяют Staff-контекст.'); return; }
    section(parent, '1 · Identity и инструкции', body => {
      void load(body, state, s => { json(body, s.identity); note(body, 'Для настроенного провайдера: ' + (s.costume?.effectiveFile || 'неизвестно') + '. Это не доказательство доставки конкретному turn.'); note(body, s.costume?.divergent ? 'AGENTS.md и CLAUDE.md различаются. Причину нужно проверить, автоматически не синхронизируем.' : 'Совпадение файлов: ' + (s.costume?.divergent === false ? 'подтверждено снимком' : 'не проверено')); });
      readDocument(body, { scope:'costume', path:'AGENTS.md' }); readDocument(body, { scope:'costume', path:'CLAUDE.md' });
    });
    section(parent, '2 · Знания и память', body => {
      inventory(body, 'company_context', 'Общие знания компании'); inventory(body, 'agent_context', 'Контекст агента'); note(body, 'Каноническая личная память, WORK_STATE и полный журнал не имеют отдельной ручки чтения в этом контракте. Это пробел наблюдаемости, не отсутствие памяти у агента.');
    });
    section(parent, '3 · Скиллы', body => {
      void load(body, state, s => { json(body, { assigned:s.skills.assigned, disabled:s.skills.disabled, available:s.skills.available }); note(body, 'Назначены, выключены и доступны — разные состояния. Доступность не доказывает использование в текущем ходе.'); });
      inventory(body, 'agent_skill', 'Локальные SKILL.md'); note(body, 'Тела глобальных навыков и вложенные ресурсы, не перечисленные native inventory, этим чтением не раскрываются.');
    });
    section(parent, '4 · Коннекторы', body => void load(body, state, s => {
      json(body, s.connectors); note(body, 'assigned — назначения; scope — область подключения. present_unverified не означает авторизацию. liveAuthentication=not_checked — живой тест не проводился.');
      if (person) note(body, 'Персональные credentials проверяются отдельным connector_credential_read с точным agent/user; без значений ключей.');
    }));
    section(parent, '5 · Инструменты, MCP и браузер', body => {
      if (agent.tools !== undefined) json(body, { configuredTools:agent.tools }); note(body, 'Полный runtime tools/MCP, готовность Browser/Edge и фактическое использование инструментов не доказаны этим API. Нужны точные traces; отсутствие проекции не ограничивает агента.');
    });
    section(parent, '6 · Провайдер и параметры', body => void load(body, state, s => { json(body, { provider:s.provider, model:s.model, settingsSupport:s.settingsSupport }); note(body, 'Конфигурация агента; беседа может иметь свой route/model. Пул не доказывает запас лимитов.'); }));
    section(parent, '7 · Пользователь, беседа и незавершённое', body => {
      if (!person) { note(body, 'Выберите пользователя слева. Личные контексты разных людей не смешиваются.'); return; }
      note(body, userName(person) + ' · ID ' + person.userId); inventory(body, 'user_context', 'Документы пользователя');
      section(body, 'Напоминания', child => void load(child, () => call('reminders_read', { ...base(), user_id:String(person.userId) }), data => { json(child, data.reminders); note(child, 'Настроено ≠ выполнено и доставлено.'); }));
      if (conversation) section(body, 'Контекст выбранной беседы', child => void load(child, () => call('conversation_read', { instance_id:company.instanceId, session_key:conversation.sessionKey, limit:10 }), data => {
        if (data.context) { json(child, data.context); note(child, 'Native source snapshot, не полный скрытый prompt/SDK-контекст. Проверяйте missing/truncated.'); } else note(child, 'Доступна только legacy история; source snapshot недоступен.');
      }));
      else note(body, 'Выберите беседу в «Диалогах», затем вернитесь для source snapshot.'); note(body, 'Отдельный полный реестр файлов, compact и pending effects этим интерфейсом не заявляется.');
    });
  }
  function settings(parent) {
    if (!agent) { note(parent, 'Выберите точного агента. Массовых изменений здесь нет.'); agents.forEach(a => parent.append(agentCard(a, () => workspace(a, null, 'settings')))); return; }
    note(parent, 'Настройки всего агента, не только выбранного пользователя. Изменения — в диалоге: точный diff → подтверждение → receipt. Этот экран только читает.');
    if (company.runtime !== 'core') { note(parent, 'Настройки Staff — через его native tools.'); return; }
    void load(parent, state, s => json(parent, { agentId:s.agentId, revision:s.revision, busy:s.busy, identity:s.identity, provider:s.provider, model:s.model, settingsSupport:s.settingsSupport, supportedChanges:s.supportedChanges }));
  }
  window.addEventListener('message', event => {
    if (event.source !== window.parent) return;
    const message = event.data; if (!message || message.jsonrpc !== '2.0') return;
    if (pending.has(message.id)) {
      const entry = pending.get(message.id); pending.delete(message.id); clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error('Host отклонил запрос. Используйте обычные инструменты Operator.')); else entry.resolve(message.result);
    } else if (message.method === 'ui/notifications/tool-result' && page === 'companies' && generation === 0) renderFleet(message.params?.structuredContent);
    else if (message.method === 'ping' && message.id !== undefined) send({ jsonrpc:'2.0', id:message.id, result:{} });
  });
  el('use-context').addEventListener('click', () => selectContext(true));
  el('clear-context').addEventListener('click', () => selectContext(true, {source:'operator_view_selection', instance_id:null, view:'none', sources:[], note:'Selection cleared, not an instruction to erase chat history or approval to act. Choose an exact subject again before any action.'}));
  el('refresh').addEventListener('click', () => { company = agent = person = conversation = null; page = 'companies'; transition(); chrome(); detail.replaceChildren(); void load(detail, () => call('fleet_list', {}), renderFleet); });
  request('ui/initialize', { protocolVersion:'2026-01-26', appInfo:{ name:'TeamON Operator', version:'2' }, appCapabilities:{ availableDisplayModes:['inline'] } }).then(host => {
    if (host.protocolVersion !== '2026-01-26') throw new Error('Версия MCP Apps не поддержана. Используйте текстовые инструменты.');
    ready = !!host.hostCapabilities?.serverTools; contextSupport = !!host.hostCapabilities?.updateModelContext?.structuredContent;
    el('refresh').disabled = !ready; send({ jsonrpc:'2.0', method:'ui/notifications/initialized', params:{} });
    status.textContent = ready ? 'Только чтение. Поручения и публикация — отдельно через диалог с Operator.' : 'Host не поддерживает интерактивное чтение. MCP tools доступны текстом.';
    if (companies.length) showCompanies();
    else { detail.replaceChildren(); void load(detail, () => call('fleet_list', {}), renderFleet); }
  }).catch(error => { status.textContent = error.message; });
})();
</script></body></html>`;

export function operatorUiResource() {
  return { contents: [{ uri: OPERATOR_UI_URI, mimeType: "text/html;profile=mcp-app", text: OPERATOR_UI_HTML,
    _meta: { ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: [], frameDomains: [] } } }
  }] };
}
