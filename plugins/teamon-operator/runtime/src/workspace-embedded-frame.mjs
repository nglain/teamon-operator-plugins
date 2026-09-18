// Serialized into the package-owned embedded document; no credentials or network.
export function startEmbeddedWorkspace(protocol) {
  const pending = new Map();
  let port = null, stopped = false, sequence = 0, latestContext = null, observer, cancelConnection = () => {};
  const parameters = new URLSearchParams(location.hash.slice(1));
  const binding = { nonce:parameters.get('bridge_nonce'), epoch:Number(parameters.get('bridge_epoch')), documentId:crypto.randomUUID() };
  let parentOrigin = '';
  try {
    const candidate = parameters.get('parent_origin'), url = new URL(candidate);
    if (url.origin === candidate && ['http:','https:'].includes(url.protocol)) parentOrigin = candidate;
  } catch { /* Invalid configuration fails closed. */ }
  const envelope = value => ({ version:protocol.EMBED_VERSION, ...binding, ...value });
  const announce = () => parent.postMessage(envelope({type:'teamon:operator-ready'}), parentOrigin);
  const probe = event => {
    if (!stopped && event.source === parent && event.origin === parentOrigin && event.data?.type === 'teamon:operator-probe' &&
        event.data.version === protocol.EMBED_VERSION && event.data.nonce === binding.nonce && event.data.epoch === binding.epoch) announce();
  };
  const ready = new Promise((resolve, reject) => {
    const finish = error => { clearTimeout(timeout); clearInterval(retry); removeEventListener('message', connect); error ? reject(error) : resolve(); };
    cancelConnection = () => finish(new Error('bridge_disconnected'));
    const connect = event => {
      if (stopped || port || event.source !== parent || event.origin !== parentOrigin ||
          event.data?.type !== 'teamon:operator-connect' || !protocol.matchesEmbedBinding(event.data,binding) || event.ports.length !== 1) return;
      port = event.ports[0]; port.onmessage = receive; port.onmessageerror = () => stop('bridge_disconnected'); port.start();
      finish(); if (latestContext) publish(latestContext);
    };
    const timeout = setTimeout(() => finish(new Error('bridge_connection_timeout')), protocol.EMBED_LIMITS.timeout);
    let retry;
    if (parent === window || !parentOrigin || !protocol.validateEmbedBinding(binding)) { finish(new Error('bridge_configuration_invalid')); return; }
    addEventListener('message',connect); addEventListener('message',probe); announce(); retry = setInterval(announce,250);
  });
  // UI first read awaits this promise; suppress an unhandled rejection on an empty page.
  ready.catch(() => stop('bridge_connection_failed'));
  function stop(code) {
    if (stopped) return;
    cancelConnection();
    stopped = true; port?.close(); port = null; observer?.disconnect(); removeEventListener('message',probe);
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error(code)); }
    pending.clear();
  }
  function receive(event) {
    const message = event.data;
    if (stopped || !protocol.matchesEmbedBinding(message,binding) || !protocol.isBoundedJson(message,protocol.EMBED_LIMITS.response)) return;
    if (message.type === 'close') { stop('bridge_disconnected'); return; }
    const request = pending.get(message.id);
    if (!request || !['result','error'].includes(message.type)) return;
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.type === 'result' && message.result && typeof message.result === 'object') request.resolve(message.result);
    else request.reject(new Error(typeof message.code === 'string' && /^[a-z_]{1,80}$/.test(message.code) ? message.code : 'read_unavailable'));
  }
  async function read(name,args = {}) {
    const message = envelope({type:'read',id:'r'+(++sequence),name,arguments:args});
    if (!protocol.validateEmbedRead(message)) throw new Error('read_not_allowed');
    await ready;
    if (stopped || !port) throw new Error('bridge_disconnected');
    if (pending.size >= protocol.EMBED_LIMITS.pending) throw new Error('read_limit_reached');
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => { pending.delete(message.id); reject(new Error('read_timeout')); },protocol.EMBED_LIMITS.timeout);
      pending.set(message.id,{resolve,reject,timer});
      try { port.postMessage(message); }
      catch { pending.delete(message.id); clearTimeout(timer); reject(new Error('bridge_disconnected')); }
    });
  }
  function publish(context) {
    latestContext = context;
    if (!stopped && port) port.postMessage(envelope({type:'context',context}));
  }
  function watchSelection() {
    const element = document.getElementById('operator-context-data');
    if (!element) return;
    let signature = '', publicationRevision = 0;
    const update = () => {
      let context;
      try {
        if (element.textContent.length <= protocol.EMBED_LIMITS.response) context = protocol.projectOperatorContext(JSON.parse(element.textContent));
      } catch { /* Invalid selection clears prior references, never keeps stale authority. */ }
      context ||= {schema:'operator_context/v1',document_id:binding.documentId,revision:0,browsing:null,pinned:null,default_basis:'none'};
      context.document_id = binding.documentId;
      const next = JSON.stringify(context);
      if (signature === next) return;
      signature = next; context.revision = ++publicationRevision; publish(context);
    };
    observer = new MutationObserver(update); observer.observe(element,{childList:true,subtree:true,characterData:true}); update();
  }
  globalThis.TeamONOperatorEmbedded = Object.freeze({read});
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded',watchSelection,{once:true}); else watchSelection();
  addEventListener('pagehide',() => stop('bridge_disconnected'),{once:true});
}
