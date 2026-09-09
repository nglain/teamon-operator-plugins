import { digest } from "../digest.mjs";
import { adapterError, compatibilityReport, probeFailure } from "../compatibility.mjs";
import { coreCredential } from "../credentials.mjs";
import { createHash } from "node:crypto";
import { CoreMcp } from '../core-mcp.mjs';
import { coreChangeSchema, coreDocumentTargetSchema, coreDocumentInventorySchema, coreReminderRevisionSchema, coreCredentialSelectionSchema, coreCredentialEntriesSchema, coreRevisionSchema, CORE_CHANGE_KINDS, CORE_ADMIN_CAPABILITIES, CORE_LIFECYCLE_CAPABILITIES } from "./core-changes.mjs";

export const CORE_CAPABILITIES = Object.freeze({
  mode: "inspect_reply_and_adapt", conversations: "native_inventory_or_explicit_legacy_sample", context: "native_snapshot_or_explicit_dashboard_projection",
  automations: "inspect", messageSend: "requires_company_access_and_retained_route", contextWrite: "semantic_documents_via_native_adaptation",
  automationWrite: "native_reminder_change", memberWrite: "not_supported",
  agentConfiguration: "requires_native_company_contract", agentChanges: CORE_CHANGE_KINDS,
  consultation: "native_agent_execution_with_operator_only_result_when_advertised"
});

import { OPERATOR_ERRORS } from "../compatibility.mjs";
const nativeDigest = value => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const nativeId = value => typeof value === "string" && /^operator-[a-f0-9-]{36}$/u.test(value);
const nativeAdminId = value => typeof value === "string" && /^operator-admin-[a-f0-9-]{36}$/u.test(value);
const CORE_CONSULT_CAPABILITIES = ["conversations", "contextRead", "consultationStart", "consultationRead", "consultationCancel", "consultationExecution"];
const opaqueRevision = value => typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\x00-\x1f]/u.test(value);
const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;
const validRequestId = value => typeof value === "string" && requestIdPattern.test(value);
// Server authority is independent of the local operator's display identity.
// Old personal keys retain their exact person binding for backward compatibility.
export function coreActorMatches(access, operatorId, mcp) {
  if (mcp) return access?.authType === 'oauth_operator' && access.actor?.issuer === mcp.issuer && access.actor?.subject === mcp.subject;
  return access?.authType === "company_admin" || !!operatorId && access?.actor?.id === operatorId;
}
function assertSelectedRoute(route, selected) {
  if (!route || route.channel !== "telegram" || route.transport !== "bot" || route.agentId !== selected.agentId
    || String(route.userId) !== String(selected.userId) || route.sessionId !== selected.sessionId
    || !Number.isSafeInteger(route.botId) || route.botId <= 0 || !/^-?[1-9]\d*$/u.test(String(route.chatId))
    || !Number.isSafeInteger(Number(route.chatId)) || !Number.isSafeInteger(route.replyToMessageId) || route.replyToMessageId <= 0) {
    throw new Error("Core route mismatch or unsupported Telegram route");
  }
}

function agentId(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9_.-]*)?$/u.test(value) || value.length > 200) throw new Error("invalid Core agent id");
  return value;
}
function userId(value) {
  if (!/^-?[1-9]\d*$/u.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new Error("invalid Core user id");
  return String(value);
}
function limit(value, fallback, max) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`limit must be between 1 and ${max}`);
  return value;
}
function rows(value) {
  if (!Array.isArray(value) || value.some(row => !row || typeof row !== "object" || Array.isArray(row))) throw adapterError("invalid_response", "Core invalid_response: expected rows");
  return value;
}
function activityRows(value) {
  const events = rows(value);
  if (events.some(event => typeof event.type !== "string" || !event.type || typeof event.ts !== "string" || !event.ts || typeof event.agentId !== "string" || !event.agentId)) {
    throw adapterError("invalid_response", "Core invalid_response: activity fields missing");
  }
  return events;
}
function pick(value, keys) {
  return Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
}
function redactAuth(value, token) {
  if (typeof value === "string") return value.split(token).join("[REDACTED]");
  if (Array.isArray(value)) return value.map(item => redactAuth(item, token));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.split(token).join("[REDACTED]"), redactAuth(item, token)]));
  return value;
}
function agentSummary(agent) {
  try { agentId(agent.id); }
  catch { throw adapterError("invalid_response", "Core invalid_response: agent id missing or invalid"); }
  return {
    ...pick(agent, ["id", "name", "group", "role", "description", "model", "runtime", "providerPool", "tools", "assignedSkills", "assignedConnectors", "todayMessages", "userCount", "lastActivity", "telegramBot"]),
    connectorReadiness: "not_checked"
  };
}
function endpointBinding(instance) {
  if (instance.core.mcp) return digest({instanceId:instance.id,mcp:{url:instance.core.mcp.url,issuer:instance.core.mcp.issuer,subject:instance.core.mcp.subject}});
  return digest({ instanceId: instance.id, baseUrl: instance.core.baseUrl, ...(instance.core.gatewayInstanceId ? {gatewayInstanceId:instance.core.gatewayInstanceId} : {}) });
}
function conversationRef(instance, event) {
  return `core.v1.${Buffer.from(JSON.stringify({
    binding: endpointBinding(instance), agentId: event.agentId, userId: event.userId, sessionId: event.sessionId, channel: event.channel
  })).toString("base64url")}`;
}
function parseConversationRef(instance, ref) {
  let value;
  try {
    if (typeof ref !== "string" || !/^core\.v1\.[A-Za-z0-9_-]+$/u.test(ref) || ref.length > 2000) throw new Error();
    value = JSON.parse(Buffer.from(ref.slice(8), "base64url").toString("utf8"));
    agentId(value.agentId);
    userId(value.userId);
    if (typeof value.sessionId !== "string" || !value.sessionId || value.sessionId.length > 300 || /[\x00-\x1f]/u.test(value.sessionId)) throw new Error();
  } catch {
    throw new Error("invalid Core conversation reference; use conversations_list");
  }
  if (value.binding !== endpointBinding(instance)) throw new Error("conversation reference belongs to another instance or endpoint");
  return value;
}

export class CoreDashboard {
  async close() { await this.direct.close?.(); }
  constructor({ fetchImpl = globalThis.fetch, env = process.env, timeoutMs = 15_000, maxBytes = 2 * 1024 * 1024, operator, operations, direct } = {}) {
    this.fetch = fetchImpl;
    this.env = env;
    this.timeoutMs = timeoutMs;
    this.maxBytes = maxBytes;
    this.operator = operator;
    this.operations = operations;
    this.direct = direct || new CoreMcp({fetchImpl,maxBytes});
  }

  async #get(instance, pathname, params = {}, timeoutMs) {
    return await this.#request(instance, pathname, params, undefined, timeoutMs);
  }

  async #request(instance, pathname, params = {}, body, timeoutMs = this.timeoutMs) {
    if (instance.core.mcp) {
      const data = await this.direct.request(instance,pathname,params,body,body === undefined ? timeoutMs : Math.max(timeoutMs,30_000));
      if (data.ok === false || data.error) throw adapterError(OPERATOR_ERRORS.has(data.code) ? data.code : 'endpoint_error', 'Core MCP operation failed');
      return data;
    }
    const token = await coreCredential(instance, this.env);
    const prefix=instance.core.gatewayInstanceId ? `/api/operator/instances/${encodeURIComponent(instance.core.gatewayInstanceId)}/core` : '';
    const url = new URL(prefix + pathname, `${instance.core.baseUrl}/`);
    for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
    let response;
    try {
      response = await this.fetch(url, {
        method: body === undefined ? "GET" : "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error", signal: AbortSignal.timeout(body === undefined ? timeoutMs : Math.max(this.timeoutMs, 30_000))
      });
    } catch (error) {
      const reason = ["TimeoutError", "AbortError"].includes(error?.name) ? "request_timeout" : "request_failed";
      throw adapterError(reason, `Core request_failed: ${instance.id} ${pathname}`);
    }
    if (!response.ok && (!pathname.startsWith("/api/operator/") || ![400, 404, 409, 413, 503].includes(response.status))) {
      // Cleanup must not hide a known HTTP status or delay it on a stalled body.
      void response.body?.cancel().catch(() => {});
      const reason = ({ 401: "authentication_failed", 403: "permission_denied", 404: "endpoint_missing" })[response.status] || "upstream_error";
      throw adapterError(reason, `Core HTTP ${response.status}: ${instance.id} ${pathname}`);
    }
    const chunks = [];
    let bytes = 0;
    try {
      for await (const chunk of response.body || []) {
        bytes += chunk.length;
        if (bytes > this.maxBytes) throw new Error("response_too_large");
        chunks.push(chunk);
      }
    } catch (error) {
      if (error.message === "response_too_large") throw adapterError("response_too_large", `Core response_too_large: ${instance.id} ${pathname}`);
      throw adapterError("response_interrupted", `Core response_interrupted: ${instance.id} ${pathname}`);
    }
    let data;
    try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch {
      if (response.status === 404) throw adapterError("endpoint_missing", `Core HTTP 404: ${instance.id} ${pathname}`);
      throw adapterError("invalid_response", `Core invalid_response: ${instance.id} ${pathname}`);
    }
    if (!data || typeof data !== "object") throw adapterError("invalid_response", `Core invalid_response: ${instance.id} ${pathname}`);
    if (!response.ok && OPERATOR_ERRORS.has(data.code)) throw adapterError(data.code, `Core ${data.code}: ${instance.id} ${pathname}`);
    if (!response.ok) throw adapterError(response.status === 404 ? "endpoint_missing" : "upstream_error", `Core HTTP ${response.status}: ${instance.id} ${pathname}`);
    if (data.ok === false || data.error) throw adapterError("endpoint_error", `Core endpoint_error: ${instance.id} ${pathname}`);
    return redactAuth(data, token);
  }

  binding(instance) {
    if (instance.core.mcp) return endpointBinding(instance);
    // Login freshness is checked by coreCredential. A same-person re-login must
    // not orphan existing receipts or change pre-0.2.7 operation bindings.
    const { accountFingerprint, ...core } = instance.core;
    return digest({ instanceId: instance.id, core, actorId: this.operator?.id });
  }

  async accessInspect(instance) {
    const access = await this.#get(instance, "/api/operator/access");
    if (access.schemaVersion !== 1 || access.runtime !== "core" || access.scope !== "company"
      || typeof access.actor?.id !== "string" || !access.actor.id || typeof access.actor.label !== "string"
      || !access.capabilities || !Array.isArray(access.capabilities.channels)) {
      throw adapterError("invalid_response", "Core invalid_response: operator access contract");
    }
    if (access.authType !== undefined && !["company_admin", "personal_operator", ...(instance.core.mcp ? ['oauth_operator'] : [])].includes(access.authType)) throw adapterError("invalid_response", "Core invalid_response: operator authentication type");
    if (instance.core.mcp && !coreActorMatches(access,this.operator?.id,instance.core.mcp)) throw adapterError('permission_denied','Core MCP actor mismatch');
    if (access.capabilities.consultationExecution !== undefined && access.capabilities.consultationExecution !== "native_agent") throw adapterError("invalid_response", "Core invalid_response: consultation execution contract");
    return { actor: pick(access.actor, ["id", "label", ...(instance.core.mcp ? ['issuer','subject'] : [])]), scope: access.scope,
      authType: access.authType || "personal_operator",
      capabilities: pick(access.capabilities, ["messagePrepare", "messageCommit", "messageStatus", "channels", ...CORE_ADMIN_CAPABILITIES, ...CORE_LIFECYCLE_CAPABILITIES, ...CORE_CONSULT_CAPABILITIES]) };
  }

  async #replyAccess(instance) {
    const access = await this.accessInspect(instance);
    if (!coreActorMatches(access, this.operator?.id, instance.core.mcp)) throw new Error("Core operator identity mismatch; reconnect using this person's assigned access");
    if (!["messagePrepare", "messageCommit", "messageStatus"].every(name => access.capabilities[name] === true)
      || !access.capabilities.channels.includes("telegram_bot_text")) throw new Error("Core native reply operation_not_supported by this access contract");
    return access;
  }

  async messagePrepare(instance, ref, text, reason, basis) {
    if (typeof text !== "string" || !text.trim() || text.length > 4096 || text.includes("\0")) throw new Error("Core Telegram text must contain 1–4096 characters");
    if (typeof reason !== "string" || !reason.trim() || reason.length > 1000) throw new Error("Core assistance reason is required (1–1000 characters)");
    const selected = parseConversationRef(instance, ref);
    if (selected.channel !== "telegram") throw new Error("Core unsupported_transport: only retained Telegram bot text routes are supported");
    const access = await this.#replyAccess(instance);
    // A fresh GET may validate an old draft, but must never silently rebase it.
    if (!opaqueRevision(basis?.expectedRevision) || typeof basis?.sourceInputId !== "string" || !basis.sourceInputId || basis.sourceInputId.length > 300) {
      throw new Error("Core conversation_revision_required: read the exact conversation and pass its revision and sourceInputId; no automatic draft rebase");
    }
    const snapshot = await this.#get(instance, "/api/operator/conversation", { agent_id: selected.agentId, user_id: selected.userId, session_id: selected.sessionId });
    assertSelectedRoute(snapshot.route, selected);
    if (snapshot.busy === true) throw new Error("Core conversation_busy: wait for the current agent delivery, then prepare again");
    if (typeof snapshot.sourceInputId !== "string" || !snapshot.sourceInputId || typeof snapshot.revision !== "string" || !snapshot.revision) throw new Error("Core invalid_response: native conversation revision missing");
    if (snapshot.sourceInputId !== basis.sourceInputId || snapshot.revision !== basis.expectedRevision) throw adapterError("conversation_changed", "Core conversation_changed: preserve the draft, read new messages, then explicitly prepare against the new revision");
    const { operation: native } = await this.#request(instance, "/api/operator/messages/prepare", {}, {
      agentId: selected.agentId, userId: Number(selected.userId), sessionId: selected.sessionId,
      sourceInputId: basis.sourceInputId, expectedRevision: basis.expectedRevision, text, reason
    });
    if (!nativeId(native?.id) || !nativeDigest(native.digest) || native.status !== "prepared"
      || native.actor?.id !== access.actor.id || digest(native.route) !== digest(snapshot.route)
      || native.sourceInputId !== snapshot.sourceInputId || native.revision !== snapshot.revision
      || native.textHash !== createHash("sha256").update(text).digest("hex")) throw new Error("Core invalid_response: native proposal binding mismatch");
    const operation = await this.operations.create({ type: "message_send", retrySafe: false, actorId: access.actor.id,
      instanceId: instance.id, instanceBinding: this.binding(instance), sessionKey: ref, text, reason,
      nativeOperation: { id: native.id, digest: native.digest }, target: native.route });
    return { operationId: operation.operationId, proposalDigest: operation.proposalDigest, status: operation.status,
      instanceId: instance.id, target: operation.target, text, reason, actor: access.actor,
      warning: "Ответ от имени бота в указанную беседу. Нужны подтверждение оператора и свежая ревизия; неизвестную доставку сначала сверяем по receipt." };
  }

  #validatedReceipt(receipt, operation) {
    if (!receipt || receipt.operationId !== operation.nativeOperation.id || receipt.digest !== operation.nativeOperation.digest
      || receipt.actor?.id !== operation.actorId || digest(receipt.route) !== digest(operation.target)
      || !["prepared", "sending", "delivered", "unknown"].includes(receipt.status)
      || receipt.status === "delivered" && (!Number.isSafeInteger(receipt.messageId) || receipt.messageId <= 0)) {
      throw new Error("Core invalid_response: native receipt binding mismatch");
    }
    return receipt;
  }

  async operationInspect(instance, operation) {
    if (operation.type === "agent_change") {
      await this.#administrationAccess(instance);
      if (!nativeAdminId(operation.nativeOperation?.id) || !nativeDigest(operation.nativeOperation.digest)) throw new Error("Core invalid native change proposal");
      const { receipt } = await this.#get(instance, `/api/operator/agent-changes/${operation.nativeOperation.id}`);
      return this.#validatedChangeReceipt(receipt, operation);
    }
    await this.#replyAccess(instance);
    if (operation.type !== "message_send" || !nativeId(operation.nativeOperation?.id) || !nativeDigest(operation.nativeOperation.digest)) throw new Error("Core invalid native message proposal");
    const { receipt } = await this.#get(instance, `/api/operator/messages/${operation.nativeOperation.id}`);
    return this.#validatedReceipt(receipt, operation);
  }

  async executeOperation(instance, operation) {
    if (operation.type === "agent_change") {
      await this.#administrationAccess(instance);
      const { receipt } = await this.#request(instance, "/api/operator/agent-changes/commit", {}, {
        operationId: operation.nativeOperation.id, digest: operation.nativeOperation.digest
      });
      const checked = this.#validatedChangeReceipt(receipt, operation);
      if (checked.status !== "applied") throw new Error(`Core change ${checked.status}; inspect the same operation before any further change`);
      return checked;
    }
    await this.#replyAccess(instance);
    const { receipt } = await this.#request(instance, "/api/operator/messages/commit", {}, {
      operationId: operation.nativeOperation.id, digest: operation.nativeOperation.digest, text: operation.text
    });
    const checked = this.#validatedReceipt(receipt, operation);
    if (checked.status !== "delivered") throw new Error(`Core delivery ${checked.status}; inspect the same operation receipt before continuing`);
    return checked;
  }

  async #administrationAccess(instance) {
    const access = await this.accessInspect(instance);
    if (!coreActorMatches(access, this.operator?.id, instance.core.mcp)) throw new Error("Core operator identity mismatch; reconnect using this person's assigned access");
    if (!CORE_ADMIN_CAPABILITIES.every(name => access.capabilities[name] === true)) throw new Error("Core native agent administration operation_not_supported by this contract");
    return access;
  }

  async agentConfigurationRead(instance, selectedAgent) {
    agentId(selectedAgent);
    await this.#administrationAccess(instance);
    const { state } = await this.#get(instance, "/api/operator/agent-state", { agent_id: selectedAgent });
    if (state?.agentId !== selectedAgent || !nativeDigest(state.revision) || typeof state.busy !== "boolean"
      || !Array.isArray(state.supportedChanges) || !Array.isArray(state.skills?.available) || !Array.isArray(state.connectors?.available)) throw new Error("Core invalid_response: agent configuration binding mismatch");
    return { instanceId: instance.id, state, note: "Configuration and available sources, not current-turn consumption or external authentication proof. Read the exact document before changing it." };
  }

  async agentDocumentRead(instance, selectedAgent, target) {
    agentId(selectedAgent);
    const selected = coreDocumentTargetSchema.parse(target);
    await this.#administrationAccess(instance);
    const { document } = await this.#get(instance, "/api/operator/agent-document", {
      agent_id: selectedAgent, scope: selected.scope, path: selected.path, user_id: selected.userId
    });
    if (document?.agentId !== selectedAgent || digest(document.target) !== digest(selected)
      || typeof document.exists !== "boolean" || typeof document.content !== "string"
      || !(nativeDigest(document.revision) || document.revision === "absent" && !document.exists)) throw new Error("Core invalid_response: agent document binding mismatch");
    return { instanceId: instance.id, document, note: "Exact product-owned document; existing sessions are not reset. A missing file may only be created in a supported document scope." };
  }

  async agentChangePrepare(instance, selectedAgent, expectedRevision, input, reason) {
    agentId(selectedAgent); coreRevisionSchema.parse(expectedRevision);
    const change = coreChangeSchema.parse(input);
    if (typeof reason !== "string" || !reason.trim() || reason.length > 1000) throw new Error("Core adaptation reason is required (1–1000 characters)");
    const access = await this.#administrationAccess(instance);
    if (change.kind === "reminder.change" && access.capabilities.reminders !== true) throw new Error("Core reminder operation_not_supported by this contract");
    // Core validates secrets and semantic sources before creating any proposal.
    const { operation: native } = await this.#request(instance, "/api/operator/agent-changes/prepare", {}, {
      agentId: selectedAgent, expectedRevision, change, reason
    });
    if (!nativeAdminId(native?.id) || !nativeDigest(native.digest) || native.status !== "prepared"
      || native.actor?.id !== access.actor.id || native.agentId !== selectedAgent || native.revision !== expectedRevision
      || digest(native.change) !== digest(change) || native.reason !== reason) throw new Error("Core invalid_response: agent change proposal binding mismatch");
    const operation = await this.operations.create({ type: "agent_change", retrySafe: false, actorId: access.actor.id,
      instanceId: instance.id, instanceBinding: this.binding(instance), target: { agentId: selectedAgent },
      expectedRevision, change, reason, nativeOperation: { id: native.id, digest: native.digest } });
    return { operationId: operation.operationId, proposalDigest: operation.proposalDigest, status: operation.status,
      instanceId: instance.id, target: operation.target, expectedRevision, change, reason, actor: access.actor,
      warning: "Изменение настройки указанного агента. Проверьте точный diff и подтвердите. Сохранение, применение следующему ходу и готовность внешней системы — разные результаты." };
  }

  #validatedChangeReceipt(receipt, operation) {
    if (!receipt || receipt.operationId !== operation.nativeOperation.id || receipt.digest !== operation.nativeOperation.digest
      || receipt.actor?.id !== operation.actorId || receipt.agentId !== operation.target.agentId
      || receipt.beforeRevision !== operation.expectedRevision
      || !["prepared", "applying", "applied", "needs_review", "failed"].includes(receipt.status)
      || receipt.status === "applied" && (!nativeDigest(receipt.afterRevision) || receipt.outcome?.persisted !== true
        || !(operation.change.kind === "reminder.change" ? ["scheduler_refreshed"] : ["applied_next_turn", "available_on_next_read"]).includes(receipt.outcome.runtime))) throw new Error("Core invalid_response: agent change receipt binding mismatch");
    if (operation.change.kind === "reminder.change" && receipt.status === "applied") {
      const reminder = receipt.outcome.reminder;
      if (reminder?.commandId !== operation.nativeOperation.id || reminder.readback !== "confirmed"
        || !coreReminderRevisionSchema.safeParse(reminder.revision).success
        || !coreReminderRevisionSchema.safeParse(reminder.previousRevision).success
        || typeof reminder.changed !== "boolean" || !Array.isArray(reminder.entries)) throw new Error("Core invalid_response: reminder change receipt binding mismatch");
    }
    return receipt;
  }

  async #lifecycleAccess(instance, capability) {
    const access = await this.accessInspect(instance);
    if (!coreActorMatches(access, this.operator?.id, instance.core.mcp)) throw new Error("Core operator identity mismatch; reconnect using this person's assigned access");
    if (access.capabilities[capability] !== true) throw new Error(`Core ${capability} operation_not_supported by this contract`);
    return access;
  }

  async agentDocumentsList(instance, selectedAgent, input) {
    agentId(selectedAgent);
    const selected = coreDocumentInventorySchema.parse(input);
    await this.#lifecycleAccess(instance, "documentInventory");
    const data = await this.#get(instance, "/api/operator/agent-documents", {
      agent_id: selectedAgent, scope: selected.scope, user_id: selected.userId, limit: selected.limit
    });
    const documents = rows(data.documents);
    if (typeof data.truncated !== "boolean" || !Number.isSafeInteger(data.omitted) || data.omitted < 0
      || documents.length > (selected.limit || 100) || documents.some(doc => {
        const target = coreDocumentTargetSchema.safeParse(doc.target);
        return !target.success || target.data.scope !== selected.scope || target.data.userId !== selected.userId
          || !nativeDigest(doc.revision) || !Number.isSafeInteger(doc.bytes) || doc.bytes < 0;
      })) throw new Error("Core invalid_response: document inventory binding mismatch");
    return { instanceId: instance.id, agentId: selectedAgent, scope: selected.scope, documents,
      truncated: data.truncated, omitted: data.omitted, note: "Scoped source inventory, not the assembled prompt. Read the exact document before editing; truncated means more sources may exist." };
  }

  async remindersRead(instance, selectedAgent, selectedUser) {
    agentId(selectedAgent); userId(selectedUser);
    await this.#lifecycleAccess(instance, "reminders");
    const { reminders } = await this.#get(instance, "/api/operator/reminders", { agent_id: selectedAgent, user_id: selectedUser });
    if (reminders?.agentId !== selectedAgent || String(reminders.userId) !== String(selectedUser)
      || !coreReminderRevisionSchema.safeParse(reminders.revision).success || !Array.isArray(reminders.entries)) throw new Error("Core invalid_response: reminder snapshot binding mismatch");
    return { instanceId: instance.id, reminders, executionVerified: false,
      note: "Canonical reminder revision for reminder.change. Configured and scheduler-refreshed are not external delivery receipts." };
  }

  async #providerAuth(instance, start) {
    await this.#lifecycleAccess(instance, "providerAuth");
    const data = await this.#request(instance, `/api/operator/provider-auth/chatgpt${start ? "/start" : ""}`, {}, start ? {} : undefined);
    const auth = data.auth;
    if (data.provider !== "chatgpt" || !auth || typeof auth.ready !== "boolean"
      || !["ready", "awaiting_user", "starting", "failed"].includes(auth.state) || auth.ready !== (auth.state === "ready")
      || auth.reason !== undefined && !["not_configured", "process_failed"].includes(auth.reason)
      || auth.code !== undefined && (typeof auth.code !== "string" || !/^[A-Z0-9]{4,8}-[A-Z0-9]{4,8}$/u.test(auth.code))) throw new Error("Core invalid_response: provider auth status");
    if (auth.url !== undefined) {
      let url;
      try { url = new URL(auth.url); } catch { throw new Error("Core invalid_response: provider auth URL"); }
      if (url.protocol !== "https:" || url.username || url.password || url.port
        || !["openai.com", "chatgpt.com"].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) throw new Error("Core invalid_response: provider auth URL");
    }
    // Only a temporary native device challenge, never OAuth tokens or raw process logs.
    return { instanceId: instance.id, provider: "chatgpt", auth: pick(auth, ["ready", "state", "url", "code", "reason"]), providerChanged: false,
      note: "The account holder completes the native device login in their browser. No password/token input here. Recheck status; authorization does not switch any agent or reset sessions." };
  }

  async providerAuthRead(instance) { return await this.#providerAuth(instance, false); }
  async providerAuthStart(instance) { return await this.#providerAuth(instance, true); }

  #credentialMetadata(value, selected) {
    const expectedTarget = selected.userId !== undefined ? `user:${selected.userId}@${selected.agentId}` : selected.agentId ? `agent:${selected.agentId}` : "instance";
    const expectedScope = selected.userId !== undefined ? "user" : selected.agentId ? "agent" : "instance";
    if (value?.connector !== selected.connector || value.scope !== expectedScope || value.target !== expectedTarget
      || !nativeDigest(value.revision) || !["missing", "present_unverified"].includes(value.credential)
      || value.liveAuthentication !== "not_checked" || !Array.isArray(value.keys)
      || value.keys.some(key => typeof key !== "string" || !/^[A-Z_][A-Z0-9_]{0,127}$/u.test(key))) throw new Error("Core invalid_response: credential target binding mismatch");
    return pick(value, ["connector", "scope", "target", "revision", "keys", "credential", "liveAuthentication"]);
  }

  async connectorCredentialRead(instance, input) {
    const selected = coreCredentialSelectionSchema.parse(input);
    await this.#lifecycleAccess(instance, "connectorCredential");
    const { credential } = await this.#get(instance, "/api/operator/connector-credential", { connector: selected.connector, agent_id: selected.agentId, user_id: selected.userId });
    const metadata = this.#credentialMetadata(credential, selected);
    if (typeof credential.exists !== "boolean" || !Array.isArray(credential.requiredKeys)
      || credential.requiredKeys.some(key => typeof key !== "string" || !/^[A-Z_][A-Z0-9_]{0,127}$/u.test(key))) throw new Error("Core invalid_response: credential snapshot metadata");
    return { instanceId: instance.id, credential: { ...metadata, exists: credential.exists, requiredKeys: credential.requiredKeys },
      note: "Names and revision only, never values. Supply new values via protected credential-store CLI input. Presence is not successful external authentication." };
  }

  // CLI-only protected intake. Deliberately not a write MCP tool or OperationStore proposal.
  async connectorCredentialStore(instance, input, expectedRevision, entries) {
    const selected = coreCredentialSelectionSchema.parse(input);
    coreRevisionSchema.parse(expectedRevision);
    // Do not expose Zod's rejected values in a secret-input error.
    if (!coreCredentialEntriesSchema.safeParse(entries).success) throw new Error("Invalid credential entries; use named nonempty string values within the private input limits");
    const body = { ...selected, expectedRevision, entries };
    if (Buffer.byteLength(JSON.stringify(body), "utf8") > 128 * 1024) throw new Error("Protected credential request exceeds 128 KiB");
    const access = await this.#lifecycleAccess(instance, "connectorCredential");
    const { receipt } = await this.#request(instance, "/api/operator/connector-credential", {}, body);
    const metadata = this.#credentialMetadata(receipt, selected);
    if (receipt.actor?.id !== access.actor.id || receipt.previousRevision !== expectedRevision || receipt.readback !== "confirmed"
      || receipt.credential !== "present_unverified" || receipt.runtime !== "available_on_next_read"
      || Object.keys(entries).some(key => !metadata.keys.includes(key))) throw new Error("Core invalid_response: credential receipt binding mismatch");
    return { instanceId: instance.id, receipt: { ...metadata, actor: pick(access.actor, ["id", "label"]), previousRevision: expectedRevision,
      readback: "confirmed", runtime: "available_on_next_read" }, note: "Scoped values persisted/read back, external authentication not checked. No values stored by Operator." };
  }

  async instanceInspect(instance) {
    const health = await this.#get(instance, "/api/health");
    if (health.product !== "teamon-core") throw new Error(`Core product_mismatch: ${instance.id}`);
    const [roster, activity, access] = await Promise.allSettled([
      this.#get(instance, "/api/agents").then(data => rows(data).map(agentSummary)),
      this.#get(instance, "/api/activity", { limit: 1 }).then(data => activityRows(data)),
      this.accessInspect(instance)
    ]);
    const activitySupport = activity.status === "fulfilled" ? { status: "observed", evidence: "recent_activity_read" } : probeFailure(activity.reason);
    const agentSupport = roster.status === "fulfilled" ? { status: "not_checked", reason: "roster_observed_people_not_checked" } : probeFailure(roster.reason);
    const replySupport = access.status === "rejected" ? probeFailure(access.reason)
      : !coreActorMatches(access.value, this.operator?.id, instance.core.mcp) ? { status: "error", reason: "actor_mismatch" }
      : ["messagePrepare", "messageCommit", "messageStatus"].every(name => access.value.capabilities[name] === true)
        && access.value.capabilities.channels.includes("telegram_bot_text")
        ? { status: "advertised", evidence: "native_company_contract_route_not_checked" }
        : { status: "unavailable", reason: "native_reply_not_advertised" };
    const adminSupport = access.status === "rejected" ? probeFailure(access.reason)
      : !coreActorMatches(access.value, this.operator?.id, instance.core.mcp) ? { status: "error", reason: "actor_mismatch" }
      : CORE_ADMIN_CAPABILITIES.every(name => access.value.capabilities[name] === true)
        ? { status: "advertised", evidence: "native_company_administration_target_not_checked" }
        : { status: "unavailable", reason: "native_administration_not_advertised" };
    const optionalSupport = capability => access.status === "rejected" ? probeFailure(access.reason)
      : !coreActorMatches(access.value, this.operator?.id, instance.core.mcp) ? { status: "error", reason: "actor_mismatch" }
      : access.value.capabilities[capability] === true ? { status: "advertised", evidence: "native_company_contract_target_not_checked" }
      : { status: "unavailable", reason: "native_capability_not_advertised" };
    return {
      source: instance.core.mcp ? 'core_mcp' : "core_dashboard", retrievedAt: new Date().toISOString(),
      health: pick(health, ["ok", "product", "version", "gitSha", "uptimeHuman", "agentCount"]),
      agents: roster.status === "fulfilled" ? roster.value : null, capabilities: CORE_CAPABILITIES,
      operatorAccess: access.status === "fulfilled" ? access.value : { status: "not_checked", reason: probeFailure(access.reason).reason },
      compatibility: compatibilityReport("core", {
        instance_inspect: { status: "observed", evidence: "core_health_read" },
        agent_inspect: agentSupport,
        conversations_list: access.status === "fulfilled" && access.value.capabilities.conversations === true ? optionalSupport("conversations") : activitySupport,
        conversation_read: access.status === "fulfilled" && access.value.capabilities.contextRead === true ? optionalSupport("contextRead") : { status: "not_checked" },
        activity_read: activitySupport,
        message_prepare: replySupport, operation_commit: replySupport, operation_inspect: replySupport,
        agent_configuration_read: adminSupport, agent_document_read: adminSupport, agent_change_prepare: adminSupport,
        agent_documents_list: optionalSupport("documentInventory"), reminders_read: optionalSupport("reminders"),
        provider_auth_read: optionalSupport("providerAuth"), provider_auth_start: optionalSupport("providerAuth"),
        connector_credential_read: optionalSupport("connectorCredential"),
        agent_consult: access.status === "fulfilled" && coreActorMatches(access.value, this.operator?.id, instance.core.mcp)
          && access.value.capabilities.consultationStart === true && access.value.capabilities.consultationExecution !== "native_agent"
          ? { status: "unavailable", reason: "native_agent_execution_not_advertised" } : optionalSupport("consultationStart"),
        consultation_read: optionalSupport("consultationRead"),
        consultation_cancel: optionalSupport("consultationCancel")
      }),
      note: "Dashboard health is not proof of a working agent or completed business task."
    };
  }

  async agentInspect(instance, selectedAgent) {
    agentId(selectedAgent);
    const [agents, users] = await Promise.all([this.#get(instance, "/api/agents"), this.#get(instance, "/api/users")]);
    const agent = rows(agents).find(row => row.id === selectedAgent);
    if (!agent) throw new Error(`Core agent_not_found: ${selectedAgent}`);
    return {
      instanceId: instance.id, agent: agentSummary(agent), retrievedAt: new Date().toISOString(),
      people: rows(users).filter(row => row.agentId === selectedAgent).map(row => pick(row, ["userId", "displayName", "username", "role", "source", "lastActive", "messages", "sessions"])),
      contextTarget: `agent.${selectedAgent}`, note: "Assignments and configured model are not live connector/provider readiness."
    };
  }

  async conversationsList(instance, filters = {}) {
    const count = limit(filters.limit, 50, 500);
    if (filters.agentId !== undefined) agentId(filters.agentId);
    if (filters.userId !== undefined) {
      userId(filters.userId);
      if (!filters.agentId) throw new Error("Core user filter requires exact agentId");
    }
    if (filters.cursor !== undefined && (typeof filters.cursor !== "string" || !filters.cursor || filters.cursor.length > 2048 || /[\x00-\x1f]/u.test(filters.cursor))) throw new Error("invalid Core conversation cursor");
    let inventory;
    try {
      inventory = await this.#get(instance, "/api/operator/conversations", { agent_id: filters.agentId, limit: Math.min(count, 100), cursor: filters.cursor });
    } catch (error) {
      if (error.operatorReason !== "endpoint_missing") throw error;
      if (filters.cursor !== undefined) throw adapterError("endpoint_missing", "Core native conversation pagination is unavailable; legacy activity is not the next inventory page");
    }
    if (inventory) {
      const items = rows(inventory.conversations);
      const cursor = inventory.nextCursor;
      if (items.length > Math.min(count, 100) || cursor !== undefined && cursor !== null
        && !(typeof cursor === "string" && cursor.length > 0 && cursor.length <= 2048 || Number.isSafeInteger(cursor) && cursor >= 0)
        || cursor != null && String(cursor) === filters.cursor) throw adapterError("invalid_response", "Core invalid_response: conversation inventory page");
      const nextCursor = cursor == null ? undefined : String(cursor);
      const conversations = items.map(item => {
        agentId(item.agentId); userId(item.userId);
        if (typeof item.sessionId !== "string" || !item.sessionId || item.sessionId.length > 300 || /[\x00-\x1f]/u.test(item.sessionId)
          || filters.agentId && item.agentId !== filters.agentId) throw adapterError("invalid_response", "Core invalid_response: conversation inventory scope");
        const channel = typeof item.channel === "string" && item.channel ? item.channel : "unknown";
        return { sessionKey: conversationRef(instance, { ...item, channel }),
          agentId: item.agentId, userId: item.userId, logicalSessionId: item.sessionId, channel,
          title: item.title || item.userName || String(item.userId), lastActive: item.lastActive,
          deliverySupported: false, routeStatus: "not_resolved" };
      }).filter(item => (!filters.channel || item.channel === filters.channel)
        && (filters.userId === undefined || String(item.userId) === String(filters.userId))
        && (!filters.search || `${item.agentId} ${item.title} ${item.userId}`.toLowerCase().includes(filters.search.toLowerCase())));
      return { instanceId: instance.id, conversations, nextCursor,
        coverage: { ...inventory.coverage, source: "native_retained_conversations", complete: false,
          hasMore: nextCursor !== undefined, locallyFiltered: !!(filters.channel || filters.search || filters.userId !== undefined) },
        note: "One native retained-record page, not the complete external channel history. Follow nextCursor even when a filtered page is empty. Reading history does not verify a send route." };
    }
    const events = activityRows(await this.#get(instance, "/api/activity", { limit: 200, agent: filters.agentId }));
    const found = new Map();
    for (const event of events) {
      if (!event.agentId || !event.sessionId || !event.channel || event.channel === "cron") continue;
      try { agentId(event.agentId); userId(event.userId); } catch { continue; }
      if (typeof event.sessionId !== "string" || event.sessionId.length > 300 || /[\x00-\x1f]/u.test(event.sessionId)) continue;
      if (filters.agentId && event.agentId !== filters.agentId) continue;
      if (filters.userId !== undefined && String(event.userId) !== String(filters.userId)) continue;
      if (filters.channel && event.channel !== filters.channel) continue;
      const search = filters.search?.toLowerCase();
      if (search && !`${event.agentId} ${event.userName || ""} ${event.userId}`.toLowerCase().includes(search)) continue;
      const key = conversationRef(instance, event);
      // Core activity is newest-first; an older event must not replace this preview.
      if (found.has(key)) continue;
      found.set(key, {
        sessionKey: key, agentId: event.agentId, userId: event.userId, logicalSessionId: event.sessionId,
        channel: event.channel, title: event.userName || String(event.userId), lastActive: event.ts,
        deliverySupported: false, routeStatus: "not_resolved"
      });
    }
    return {
      instanceId: instance.id,
      conversations: [...found.values()].sort((a, b) => String(b.lastActive).localeCompare(String(a.lastActive))).slice(0, count),
      coverage: { source: "recent_activity_sample", complete: false, sampledEvents: events.length, maxEvents: 200 },
      note: "Not a complete conversation inventory. References select stored transcripts, not native send destinations."
    };
  }

  async conversationRead(instance, ref, requestedLimit, selection = {}) {
    const selected = parseConversationRef(instance, ref);
    const count = limit(requestedLimit, 20, 200);
    const sources = selection.contextSources === undefined ? undefined : coreDocumentTargetSchema.array().max(8).parse(selection.contextSources);
    if (selection.beforeMessageId !== undefined && (!Number.isSafeInteger(selection.beforeMessageId) || selection.beforeMessageId < 1)) throw new Error("Invalid Core history cursor");
    let context;
    try {
      const native = await this.#get(instance, "/api/operator/conversation-context", {
        agent_id: selected.agentId, user_id: selected.userId, session_id: selected.sessionId, limit: count,
        context_sources: sources === undefined ? undefined : JSON.stringify(sources), before_message_id: selection.beforeMessageId
      });
      context = this.#validatedContext(native.context, selected);
    } catch (error) {
      if (error.operatorReason !== "endpoint_missing" || sources !== undefined || selection.beforeMessageId !== undefined) throw error;
    }
    if (context) {
      const conversation = context.conversation;
      const messages = rows(conversation.messages);
      const canPrepare = selection.beforeMessageId === undefined && opaqueRevision(conversation.revision) && typeof conversation.sourceInputId === "string" && !!conversation.sourceInputId;
      return { instanceId: instance.id, sessionKey: ref, evidence: "core_native_context_snapshot",
        messages: messages.slice(-count), truncated: messages.length > count || conversation.truncated === true || context.coverage.historyTruncated === true,
        nextMessageCursor: messages.length > count && Number.isSafeInteger(messages.at(-count)?.id) ? messages.at(-count).id : conversation.nextCursor ?? undefined,
        totalMessages: Number.isSafeInteger(conversation.total) ? conversation.total : undefined,
        ...(canPrepare ? { revision: conversation.revision, sourceInputId: conversation.sourceInputId } : {}),
        contextRevision: selection.beforeMessageId === undefined ? context.revision : undefined, capturedAt: context.capturedAt, context,
        note: "Read-only source snapshot, not a resumed provider session. Pass top-level contextRevision with the same selected context_sources to agent_consult; pass revision + sourceInputId to message_prepare only when present. Older pages are for reading only: reread the current page before consultation or publication. Missing delivery metadata does not prevent private historical-session analysis." };
    }
    // Older Core: bracket the legacy transcript read. Never attach a revision
    // fetched only after reading an older conversation to the operator's draft.
    const before = await this.#legacyDeliverySnapshot(instance, selected);
    const history = rows(await this.#get(instance, "/api/chat", { agent: selected.agentId, user: selected.userId, session: selected.sessionId }));
    const after = before ? await this.#legacyDeliverySnapshot(instance, selected) : null;
    const stable = before && after && before.revision === after.revision && before.sourceInputId === after.sourceInputId;
    return {
      instanceId: instance.id, sessionKey: ref, evidence: "core_stored_transcript",
      messages: history.slice(-count).map(row => pick(row, ["role", "content", "created_at"])),
      truncated: history.length > count,
      ...(stable ? { revision: before.revision, sourceInputId: before.sourceInputId } : {}),
      note: "Legacy stored redacted transcript only; private consultation context is unavailable. "
        + (stable ? "Delivery revision remained unchanged across this read." : "No stable native delivery revision; do not prepare a reply from this read.")
    };
  }

  async #legacyDeliverySnapshot(instance, selected) {
    try {
      const snapshot = await this.#get(instance, "/api/operator/conversation", { agent_id: selected.agentId, user_id: selected.userId, session_id: selected.sessionId });
      assertSelectedRoute(snapshot.route, selected);
      if (!opaqueRevision(snapshot.revision) || typeof snapshot.sourceInputId !== "string" || !snapshot.sourceInputId) throw adapterError("invalid_response", "Core invalid_response: native conversation revision missing");
      return snapshot;
    } catch (error) {
      if (!["endpoint_missing", "route_unavailable", "unsupported_transport", "conversation_changed"].includes(error.operatorReason)) throw error;
      return null;
    }
  }

  #validatedContext(context, selected) {
    if (!context || context.scope?.agentId !== selected.agentId || String(context.scope?.userId) !== String(selected.userId)
      || context.scope?.sessionId !== selected.sessionId || !opaqueRevision(context.revision)
      || typeof context.capturedAt !== "string" || !Array.isArray(context.sources)
      || !context.conversation || !Array.isArray(context.conversation.messages)
      || !context.coverage || typeof context.coverage !== "object") throw adapterError("invalid_response", "Core invalid_response: context scope or source evidence mismatch");
    return pick(context, ["scope", "revision", "capturedAt", "provider", "model", "modelSource", "agent", "sources", "conversation", "coverage"]);
  }

  #validatedConsultation(value, selected = {}) {
    if (!value || typeof value.id !== "string" || !/^operator-consultation-[a-f0-9-]{36}$/u.test(value.id)
      || !validRequestId(value.requestId) || value.audience !== "operator"
      || !["queued", "running", "completed", "failed", "cancelled", "interrupted"].includes(value.status)
      || !value.scope || !opaqueRevision(value.contextRevision)
      || selected.id && value.id !== selected.id || selected.requestId && value.requestId !== selected.requestId
      || selected.scope && (value.scope.agentId !== selected.scope.agentId || String(value.scope.userId) !== String(selected.scope.userId) || value.scope.sessionId !== selected.scope.sessionId)) {
      throw adapterError("invalid_response", "Core invalid_response: private consultation binding mismatch");
    }
    agentId(value.scope.agentId); userId(value.scope.userId);
    if (typeof value.scope.sessionId !== "string" || !value.scope.sessionId || value.scope.sessionId.length > 300) throw adapterError("invalid_response", "Core invalid_response: private consultation scope");
    if (value.result !== undefined && (typeof value.result?.draft !== "string" || typeof value.result.operatorNotes !== "string"
      || !Array.isArray(value.result.missingInformation) || value.result.missingInformation.some(item => typeof item !== "string"))) throw adapterError("invalid_response", "Core invalid_response: private consultation result");
    if (value.effectsMayHaveOccurred !== undefined && typeof value.effectsMayHaveOccurred !== "boolean") throw adapterError("invalid_response", "Core invalid_response: consultation effects evidence");
    // Opaque native action data, not another executor or a duplicated action registry.
    if (value.result?.actions !== undefined && (!Array.isArray(value.result.actions) || value.result.actions.some(action =>
      !action || typeof action !== "object" || Array.isArray(action) || typeof action.type !== "string" || !action.type.trim()))) throw adapterError("invalid_response", "Core invalid_response: consultation result actions");
    return { ...pick(value, ["id", "requestId", "status", "scope", "contextRevision", "capturedAt", "provider", "model", "modelSource",
      "reasonCode", "audience", "createdAt", "updatedAt", "startedAt", "completedAt", "coverage", "previousConsultationId", "executionStopped", "expired", "effectsMayHaveOccurred"]),
      ...(value.result === undefined ? {} : { result: pick(value.result, ["draft", "operatorNotes", "missingInformation", "actions"]) }) };
  }

  async agentConsult(instance, ref, input) {
    const selected = parseConversationRef(instance, ref);
    if (!input || !validRequestId(input.requestId) || typeof input.request !== "string" || !input.request.trim()
      || input.request.length > 16000 || !opaqueRevision(input.expectedContextRevision)
      || input.contextSources !== undefined && !coreDocumentTargetSchema.array().max(8).safeParse(input.contextSources).success
      || input.previousConsultationId !== undefined && !/^operator-consultation-[a-f0-9-]{36}$/u.test(input.previousConsultationId)) throw new Error("Core invalid consultation request");
    const access = await this.#lifecycleAccess(instance, "consultationStart");
    if (access.capabilities.consultationExecution !== "native_agent") throw adapterError("operation_not_supported", "Core native_agent consultation execution operation_not_supported by this contract");
    const body = { agentId: selected.agentId, userId: Number(selected.userId), sessionId: selected.sessionId,
      requestId: input.requestId, request: input.request, expectedContextRevision: input.expectedContextRevision,
      ...(input.contextSources === undefined ? {} : { contextSources: input.contextSources }),
      ...(input.previousConsultationId === undefined ? {} : { previousConsultationId: input.previousConsultationId }) };
    const { consultation } = await this.#request(instance, "/api/operator/consultations", {}, body);
    if (consultation?.contextRevision !== input.expectedContextRevision) throw adapterError("invalid_response", "Core invalid_response: consultation context revision mismatch");
    return { instanceId: instance.id, consultation: this.#validatedConsultation(consultation, { requestId: input.requestId, scope: selected }),
      note: "The selected Core agent executes with its native runtime, provider, account and tools. Result/history return only to the operator, but tools can change files or external systems as requested. effectsMayHaveOccurred is uncertainty evidence, not proof of a completed action. Returned actions are data, never auto-executed here. Recover a lost response by reading the same requestId; do not blindly repeat work. Publish selected text separately through message_prepare." };
  }

  async consultationRead(instance, selection) {
    if (!selection || !!selection.consultationId === !!selection.requestId) throw new Error("Select exactly one consultationId or requestId");
    if (selection.consultationId && !/^operator-consultation-[a-f0-9-]{36}$/u.test(selection.consultationId)
      || selection.requestId && !validRequestId(selection.requestId)) throw new Error("Invalid consultation lookup");
    await this.#lifecycleAccess(instance, "consultationRead");
    const { consultation } = await this.#get(instance, selection.consultationId ? `/api/operator/consultations/${selection.consultationId}` : "/api/operator/consultations",
      selection.requestId ? { request_id: selection.requestId } : {});
    return { instanceId: instance.id, consultation: this.#validatedConsultation(consultation, { id: selection.consultationId, requestId: selection.requestId }),
      note: "This read does not start work or publish. Native execution may already have changed business state; inspect effectsMayHaveOccurred and the result before retrying. A missing effects flag on an older record is unknown, not false. Returned actions are data, not executed by this MCP. This MCP does not wake a closed host conversation." };
  }

  async consultationCancel(instance, consultationId) {
    if (typeof consultationId !== "string" || !/^operator-consultation-[a-f0-9-]{36}$/u.test(consultationId)) throw new Error("Invalid consultation id");
    await this.#lifecycleAccess(instance, "consultationCancel");
    const { consultation } = await this.#request(instance, `/api/operator/consultations/${consultationId}/cancel`, {}, {});
    return { instanceId: instance.id, consultation: this.#validatedConsultation(consultation, { id: consultationId }),
      note: "Only this consultation is cancelled, not the normal user turn. Native state wins a completion race. Cancellation is not rollback: files or external systems may already have changed; inspect effectsMayHaveOccurred before any retry." };
  }

  async contextRead(instance, targetId, selectedAgent) {
    let target, remote;
    if (typeof targetId === "string" && targetId.startsWith("agent.") && selectedAgent === undefined) {
      const id = agentId(targetId.slice(6));
      target = { id: targetId, scope: "agent", agentId: id };
      remote = await this.#get(instance, "/api/file", { agent: id, name: "CLAUDE.md" });
    } else if (typeof targetId === "string" && targetId.startsWith("participant.")) {
      const id = userId(targetId.slice(12));
      target = { id: targetId, scope: "participant", memberId: id, agentId: agentId(selectedAgent) };
      remote = await this.#get(instance, "/api/context", { agent: selectedAgent, user: id });
    } else throw new Error("Core context_not_supported: use agent.<id> or participant.<numeric-id> with agent_id");
    if (typeof remote.content !== "string") throw new Error("Core invalid_response: context content missing");
    return {
      instanceId: instance.id, target, content: remote.content,
      source: "dashboard_claude_md_projection", activePromptComplete: false, writable: false,
      note: "This legacy Dashboard projection is not the assembled runtime context. Missing user profiles may be represented by Dashboard placeholder text."
    };
  }

  async activityRead(instance, { view = "recent", agentId: selectedAgent, userId: selectedUser, limit: requestedLimit } = {}) {
    if (selectedAgent !== undefined) agentId(selectedAgent);
    if (selectedUser !== undefined) {
      userId(selectedUser);
      if (!selectedAgent || view !== "messages") throw new Error("Core activity user filter requires exact agent and messages view");
    }
    const count = limit(requestedLimit, 50, 200);
    if (view === "messages") return this.#recentMessages(instance, selectedAgent, selectedUser, count);
    if (view === "attention") {
      const data = await this.#get(instance, "/api/incomplete-journeys", { limit: 500, hours: 72 });
      const items = rows(data.items).filter(row => !selectedAgent || row.agentId === selectedAgent);
      return { instanceId: instance.id, view, items: items.slice(0, count), evidence: "trace_only", sourceTruncated: data.truncated === true, complete: false, note: "Signals for review, not confirmed unresolved user complaints. Fixed 72-hour window, source limited to 500 candidates." };
    }
    if (view !== "recent") throw new Error("invalid Core activity view");
    const events = activityRows(await this.#get(instance, "/api/activity", { agent: selectedAgent, limit: count }));
    return {
      instanceId: instance.id, view, complete: false,
      items: events.filter(row => !selectedAgent || row.agentId === selectedAgent).map(row => pick(row, ["id", "type", "ts", "agentId", "userId", "userName", "sessionId", "channel", "preview", "durationMs", "cronLabel", "error"]))
    };
  }

  async #recentMessages(instance, selectedAgent, selectedUser, count) {
    // REQ-OP-ACTIVITY: events discover exact scopes, never stand in for message text.
    const deadline = Date.now() + Math.min(this.timeoutMs, 12_000);
    const remaining = () => Math.max(1, deadline - Date.now());
    const events = activityRows(await this.#get(instance, "/api/activity", { agent: selectedAgent, limit: 200 }, remaining()));
    const sessions = new Map();
    for (const event of events.slice().sort((a, b) => String(b.ts).localeCompare(String(a.ts)))) {
      if (!["message", "response"].includes(event.type) || !event.channel || ["cron", "api", "unknown"].includes(event.channel)
        || selectedAgent && event.agentId !== selectedAgent || selectedUser !== undefined && String(event.userId) !== String(selectedUser)) continue;
      try { agentId(event.agentId); userId(event.userId); } catch { continue; }
      if (typeof event.sessionId !== "string" || !event.sessionId || event.sessionId.length > 300 || /[\x00-\x1f]/u.test(event.sessionId)) continue;
      const ref = conversationRef(instance, event);
      if (!sessions.has(ref)) sessions.set(ref, event);
    }
    let people = [], namesAvailable = true;
    try { people = rows(await this.#get(instance, "/api/users", {}, remaining())); } catch { namesAvailable = false; }
    const selected = [...sessions].slice(0, 10), items = [], unavailable = [];
    let cursor = 0;
    const read = async () => {
      while (cursor < selected.length) {
        const [sessionKey, event] = selected[cursor++];
        const identity = { sessionKey, ...pick(event, ["agentId", "userId", "sessionId", "channel"]) };
        const person = people.find(p => p.agentId === event.agentId && String(p.userId) === String(event.userId));
        const name = person?.displayName || event.userName;
        if (Date.now() >= deadline) { unavailable.push({ ...identity, reason: "read_budget_exhausted" }); continue; }
        try {
          // No conversation-context/bootstrap: preview only the stored transcript.
          const transcript = rows(await this.#get(instance, "/api/chat", { agent: event.agentId, user: event.userId, session: event.sessionId }, remaining()));
          transcript.forEach((message, index) => {
            if (!["user", "assistant"].includes(message.role) || typeof message.content !== "string") return;
            const rawTime = typeof message.created_at === "string" ? message.created_at : "";
            const parsed = Date.parse(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d+)?$/u.test(rawTime) ? rawTime.replace(" ", "T") + "Z" : rawTime);
            items.push({ ...identity, id: sessionKey + ":" + (Number.isSafeInteger(message.id) && message.id > 0 ? 'message-' + message.id : 'preview-' + index),
              ...(Number.isSafeInteger(message.id) && message.id > 0 ? { messageId:message.id } : {}), role: message.role,
              ...(typeof name === "string" ? { userName: name } : {}),
              ...(typeof person?.username === "string" ? { username: person.username } : {}),
              ts: Number.isFinite(parsed) ? new Date(parsed).toISOString() : null,
              preview: message.content.slice(0, 600), previewTruncated: message.content.length > 600 });
          });
        } catch (error) {
          unavailable.push({ ...identity, reason: error.operatorReason || "read_failed" });
        }
      }
    };
    await Promise.all([read(), read()]);
    items.sort((a, b) => (b.ts ? Date.parse(b.ts) : -Infinity) - (a.ts ? Date.parse(a.ts) : -Infinity));
    return { instanceId: instance.id, view: "messages", complete: false, items: items.slice(0, count),
      unavailable, coverage: { source: "recent_session_transcripts", sampledEvents: events.length,
        discoveredSessions: sessions.size, readSessions: selected.length - unavailable.length,
        sessionLimit: 10, messageLimit: count, omittedMessages: Math.max(0, items.length - count), namesAvailable },
      note: "Latest stored messages within a bounded recent-event sample, not complete external chat history or delivery confirmation. Technical/cron/API events excluded. No context bootstrap or inference." };
  }

  async automationsList(instance, selectedAgent, selectedUser) {
    const data = await this.#get(instance, "/api/user-details", { agent: agentId(selectedAgent), user: userId(selectedUser) });
    if (typeof data.remindersError !== "string" || typeof data.remindersRevision !== "string") throw new Error("Core invalid_response: reminder snapshot metadata missing");
    return {
      instanceId: instance.id, agentId: selectedAgent, userId: String(selectedUser),
      status: data.remindersError ? "error" : "observed", entries: rows(data.reminders),
      revision: data.remindersRevision, error: data.remindersError || undefined,
      executionVerified: false, source: "core_reminder_snapshot"
    };
  }
}
