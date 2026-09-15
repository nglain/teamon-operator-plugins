// Compact observations of already validated native reads. Never copy a request,
// draft, error, secret, document body or arbitrary native action into the journal.
const bounded = value => typeof value === 'string' && value.length > 0 && value.length <= 300 ? value : undefined;
const oneOf = (value, values) => values.includes(value) ? value : 'unknown';
const bool = value => typeof value === 'boolean' ? value : 'unknown';

export function nativeJournalEvidence(runtime, tool, input, output) {
  if (runtime !== 'core' || output?.isError) return null;
  const value = output?.structuredContent;
  if (tool === 'operation_inspect' && value?.nativeReceipt) {
    const operation = value.operation;
    const receipt = value.nativeReceipt;
    // Adapter validates the native actor, route, digest and revision. These
    // checks also stop accidental correlation to another local operation here.
    if (!input.operation_id || operation?.operationId !== input.operation_id
      || !bounded(receipt.operationId) || operation.nativeOperation?.id !== receipt.operationId) return null;
    return {
      kind: 'operation', source: 'validated_core_adapter',
      operation_id: operation.operationId, native_operation_id: receipt.operationId,
      operation_type: oneOf(operation.type, ['message_send', 'agent_change']),
      status: oneOf(receipt.status, ['prepared', 'sending', 'delivered', 'unknown', 'applying', 'applied', 'needs_review', 'failed']),
      actor_id: bounded(receipt.actor?.id),
      before_revision: bounded(receipt.beforeRevision), after_revision: bounded(receipt.afterRevision),
      persisted: bool(receipt.outcome?.persisted),
      runtime: oneOf(receipt.outcome?.runtime, ['applied_next_turn', 'available_on_next_read', 'scheduler_refreshed']),
      message_id: Number.isSafeInteger(receipt.messageId) && receipt.messageId > 0 ? receipt.messageId : undefined,
      user_acceptance: 'not_established'
    };
  }
  if (['agent_consult', 'consultation_read', 'consultation_cancel'].includes(tool) && value?.consultation) {
    const c = value.consultation;
    if (!bounded(c.id) || c.audience !== 'operator'
      || input.consultation_id && input.consultation_id !== c.id
      || input.request_id && input.request_id !== c.requestId) return null;
    return {
      kind: 'consultation', source: 'validated_core_adapter',
      consultation_id: c.id, request_id: bounded(c.requestId),
      status: oneOf(c.status, ['queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted']),
      audience: 'operator', assistance: 'operator_delegated',
      agent_id: bounded(c.scope?.agentId), user_id: bounded(String(c.scope?.userId ?? '')),
      session_id: bounded(c.scope?.sessionId), context_revision: bounded(c.contextRevision),
      provider: bounded(c.provider), model: bounded(c.model),
      effects_may_have_occurred: bool(c.effectsMayHaveOccurred),
      user_acceptance: 'not_established'
    };
  }
  return null;
}
