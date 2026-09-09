// Closed native operations; paths are a local compatibility seam, never wire input.
const reads = {
  '/api/health': 'core_health_read', '/api/agents': 'core_agents_list',
  '/api/users': 'core_users_list', '/api/activity': 'core_activity_read',
  '/api/chat': 'core_messages_read', '/api/file': 'core_identity_read',
  '/api/context': 'core_context_read', '/api/incomplete-journeys': 'core_journeys_list',
  '/api/user-details': 'core_user_details_read',
  '/api/operator/access': 'core_operator_access',
  '/api/operator/conversation': 'core_delivery_context_read',
  '/api/operator/conversations': 'core_conversations_list',
  '/api/operator/conversation-context': 'core_conversation_context_read',
  '/api/operator/agent-state': 'core_agent_state_read',
  '/api/operator/agent-document': 'core_agent_document_read',
  '/api/operator/agent-documents': 'core_agent_documents_list',
  '/api/operator/reminders': 'core_reminders_read',
  '/api/operator/provider-auth/chatgpt': 'core_provider_auth_read',
  '/api/operator/connector-credential': 'core_connector_credential_read',
  '/api/operator/consultations': 'core_consultation_find'
};
const writes = {
  '/api/operator/messages/prepare': 'core_message_prepare',
  '/api/operator/messages/commit': 'core_message_commit',
  '/api/operator/agent-changes/prepare': 'core_agent_change_prepare',
  '/api/operator/agent-changes/commit': 'core_agent_change_commit',
  '/api/operator/provider-auth/chatgpt/start': 'core_provider_auth_start',
  '/api/operator/connector-credential': 'core_connector_credential_store',
  '/api/operator/consultations': 'core_consultation_start'
};
export function coreMcpCall(pathname, params = {}, body) {
  const write = body !== undefined;
  let name = (write ? writes : reads)[pathname];
  let args = write ? body : params;
  if (write && Object.values(params).some(v => v !== undefined)) throw new Error('unsupported_mcp_operation');
  if (!name) {
    const match = pathname.match(/^\/api\/operator\/(messages|agent-changes|consultations)\/(operator-(?:admin-|consultation-)?[a-f0-9-]{36})(\/cancel)?$/);
    if (match && Object.values(params).every(v => v === undefined)) {
      const kind = match[1], id = match[2];
      const valid = kind === 'messages' ? /^operator-[a-f0-9-]{36}$/.test(id)
        : kind === 'agent-changes' ? /^operator-admin-[a-f0-9-]{36}$/.test(id) : /^operator-consultation-[a-f0-9-]{36}$/.test(id);
      if (valid && !write && !match[3]) name = ({messages:'core_message_status','agent-changes':'core_agent_change_status',consultations:'core_consultation_read'})[kind];
      if (valid && write && kind === 'consultations' && match[3] && Object.keys(body).length === 0) name = 'core_consultation_cancel';
      args = {id};
    }
  }
  if (!name || pathname === '/api/file' && params.name !== 'CLAUDE.md') throw new Error('unsupported_mcp_operation');
  return {name, arguments: Object.fromEntries(Object.entries(args).filter(([,v]) => v !== undefined)), write};
}
