// Local adapter contract, not a remote API version or an authorization grant.
const FEATURES = [
  "instance_inspect", "agent_inspect", "conversations_list", "conversation_read",
  "context_read", "activity_read", "activity_attention", "automations_list",
  "message_prepare", "context_prepare", "member_prepare", "operation_commit", "operation_inspect",
  "agent_configuration_read", "agent_document_read", "agent_change_prepare",
  "agent_documents_list", "reminders_read", "provider_auth_read", "provider_auth_start", "connector_credential_read",
  "agent_consult", "consultation_read", "consultation_cancel"
];
const SUPPORTED = {
  core: new Set([...FEATURES.slice(0, 8), "message_prepare", "operation_commit", "operation_inspect",
    "agent_configuration_read", "agent_document_read", "agent_change_prepare",
    "agent_documents_list", "reminders_read", "provider_auth_read", "provider_auth_start", "connector_credential_read",
    "agent_consult", "consultation_read", "consultation_cancel"]),
  staff: new Set(["instance_inspect", "conversations_list", "conversation_read", "context_read",
    "message_prepare", "context_prepare", "member_prepare", "operation_commit", "operation_inspect"])
};
const SAFE_REASONS = new Set([
  "auth_not_configured", "authentication_failed", "permission_denied", "endpoint_missing",
  "upstream_error", "request_failed", "request_timeout", "response_interrupted",
  "response_too_large", "invalid_response", "endpoint_error"
]);

export function adapterError(reason, message) {
  return Object.assign(new Error(message), { operatorReason: reason });
}

export function probeFailure(error) {
  const reason = SAFE_REASONS.has(error?.operatorReason) ? error.operatorReason : "request_failed";
  return { status: reason === "endpoint_missing" ? "unavailable" : "error", reason };
}

export function compatibilityReport(runtime, evidence = {}) {
  return {
    schemaVersion: 1, runtime, basis: "api_evidence", checkedAt: new Date().toISOString(),
    features: Object.fromEntries(FEATURES.map(name => [name, SUPPORTED[runtime].has(name)
      ? (evidence[name] || { status: "not_checked" })
      : { status: "adapter_not_supported" }])),
    note: "Inspection evidence is scoped to this request. Advertised tools are not delivery/readiness proof; unchecked target-dependent operations are not missing capabilities. No version gate or cached authorization."
  };
}
