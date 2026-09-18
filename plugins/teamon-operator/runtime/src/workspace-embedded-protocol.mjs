// Browser-safe contract shared by the renderer and its host. This is navigation,
// never identity, authorization, a tool grant, or approval of an operation.
export const EMBED_VERSION = 1;
export const EMBED_READS = Object.freeze(['fleet_list', 'instance_inspect', 'agent_inspect',
  'activity_read', 'conversations_list', 'conversation_read', 'context_read',
  'agent_configuration_read', 'agent_documents_list', 'agent_document_read',
  'automations_list', 'operator_reminders_read', 'journal_read']);
export const EMBED_LIMITS = Object.freeze({ request: 16384, response: 2097152, context: 65536, pending: 16, timeout: 30000 });

export function validateEmbedBinding(value) {
  return !!value && typeof value === 'object' &&
    typeof value.nonce === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(value.nonce) &&
    Number.isSafeInteger(value.epoch) && value.epoch > 0 &&
    typeof value.documentId === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value.documentId);
}

export function matchesEmbedBinding(value, binding) {
  return validateEmbedBinding(binding) && !!value && value.version === EMBED_VERSION &&
    value.nonce === binding.nonce && value.epoch === binding.epoch && value.documentId === binding.documentId;
}

export function isBoundedJson(value, maximum) {
  try { return new TextEncoder().encode(JSON.stringify(value)).length <= maximum; }
  catch { return false; }
}

export function validateEmbedRead(value) {
  return !!value && value.type === 'read' && typeof value.id === 'string' &&
    /^[A-Za-z0-9_-]{1,80}$/.test(value.id) && EMBED_READS.includes(value.name) &&
    !!value.arguments && typeof value.arguments === 'object' && !Array.isArray(value.arguments) &&
    isBoundedJson(value, EMBED_LIMITS.request);
}

export function projectOperatorContext(value) {
  if (!value || value.schema !== 'operator_context/v1' || typeof value.document_id !== 'string' ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(value.document_id) || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
      !isBoundedJson(value, EMBED_LIMITS.response)) return null;
  const text = (value, maximum = 512) => typeof value === 'string' && value.length <= maximum && !/[\u0000-\u001f]/.test(value) ? value : undefined;
  const reference = input => {
    if (!input || typeof input !== 'object' || !text(input.instance_id)) return null;
    const result = {};
    for (const key of ['instance_id','agent_id','user_id','session_key','task_id','view','tab','scope_kind','selection_kind']) {
      const item = text(input[key]); if (item !== undefined) result[key] = item;
    }
    if (result.user_id && !result.agent_id) return null;
    if (Array.isArray(input.message_ids) && input.message_ids.length <= 200) {
      result.message_ids = input.message_ids.filter(item => text(item) !== undefined || Number.isSafeInteger(item));
    }
    if (input.inspection_target && typeof input.inspection_target === 'object') {
      const target = {};
      for (const key of ['kind','instance_id','agent_id','user_id','session_key','task_id','case_id','document_id','skill_name','connector','provider','account_id']) {
        const item = text(input.inspection_target[key]); if (item !== undefined) target[key] = item;
      }
      if (target.instance_id && target.instance_id !== result.instance_id) return null;
      if (target.user_id && !target.agent_id && !result.agent_id) return null;
      if (Array.isArray(input.inspection_target.message_ids) && input.inspection_target.message_ids.length <= 200) {
        target.message_ids = input.inspection_target.message_ids.filter(item => text(item) !== undefined || Number.isSafeInteger(item));
      }
      const document = input.inspection_target.read?.tool === 'agent_document_read' ? input.inspection_target.read?.arguments?.target :
        {scope:input.inspection_target.document_scope,path:input.inspection_target.document_path};
      if (document && ['costume','company_context','agent_context','agent_skill','user_context'].includes(document.scope) &&
          text(document.path) && !document.path.startsWith('/') && !document.path.includes('\\') && !document.path.split('/').some(part => ['.','..',''].includes(part))) {
        target.document_scope = document.scope; target.document_path = document.path;
      }
      if (Object.keys(target).length) result.inspection_target = target;
    }
    // Omit selected_messages, labels, arbitrary read arguments, source bodies and notes.
    // The host resolves these exact references through its authenticated read service.
    return result;
  };
  const browsing = reference(value.browsing), pinned = reference(value.pinned);
  const result = { schema:'operator_context/v1', document_id:value.document_id, revision:value.revision,
    ...(text(value.updated_at,64) ? {updated_at:value.updated_at} : {}), browsing, pinned,
    default_basis:pinned ? 'pinned' : browsing ? 'browsing' : 'none' };
  return isBoundedJson(result, EMBED_LIMITS.context) ? result : null;
}
