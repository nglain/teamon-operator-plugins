import { digest } from "../digest.mjs";
import { adapterError, compatibilityReport, probeFailure } from "../compatibility.mjs";

function contextSelection(targetId, agentId) {
  if (agentId === undefined) return { targetId };
  const stableId = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/u;
  if (typeof agentId !== "string" || !stableId.test(agentId)) throw new Error("agentId must be a stable lowercase id");
  if (typeof targetId !== "string" || !targetId.startsWith("participant.") || !stableId.test(targetId.slice("participant.".length))) {
    throw new Error("agentId is only supported for an exact participant context target");
  }
  return { targetId, agentId };
}

function assertContextTarget(remote, selection, { optional = false } = {}) {
  const target = remote?.target;
  if (optional && target === undefined && selection.agentId === undefined) return;
  if (!target || target.id !== selection.targetId) throw new Error("remote context target mismatch");
  if (selection.targetId.startsWith("participant.")) {
    if (target.scope !== "participant" || target.memberId !== selection.targetId.slice("participant.".length) || target.agentId !== selection.agentId) {
      throw new Error("remote participant context pair mismatch");
    }
  }
}

export class StaffAdapter {
  constructor({ operator, operations, channels, controlCall }) {
    this.operator = operator;
    this.operations = operations;
    this.channels = channels;
    this.controlCall = controlCall;
  }

  binding(instance) {
    // Preserve the exact existing Staff proposal binding, including pre-split receipts.
    return digest({ instanceId: instance.id, hubId: instance.hubId, desired: instance.desired,
      channelMcp: instance.channelMcp, controlRpc: instance.controlRpc });
  }

  async instanceInspect(instance) {
    const [product, native] = await Promise.allSettled([
      this.controlCall(instance, "teamon.staff.inspect", {}).then(value => {
        if (!value || typeof value !== "object" || Array.isArray(value)) throw adapterError("invalid_response", "invalid Staff inspect result");
        return value;
      }),
      this.channels.discover ? this.channels.discover(instance) : Promise.resolve(null)
    ]);
    let discovered = native.status === "fulfilled" ? native.value : null;
    const invalid = discovered && (!Array.isArray(discovered.tools) || discovered.tools.some(name => typeof name !== "string") || typeof discovered.complete !== "boolean");
    let unavailable;
    if (native.status === "rejected") unavailable = probeFailure(native.reason);
    else if (invalid) { unavailable = { status: "error", reason: "invalid_response" }; discovered = null; }
    const advertised = (...names) => {
      if (unavailable) return unavailable;
      if (!discovered) return { status: "not_checked", reason: "discovery_not_configured" };
      if (names.every(name => discovered.tools.includes(name))) return { status: "advertised", evidence: "native_mcp_tools_list" };
      return discovered.complete ? { status: "unavailable", reason: "native_tool_missing" }
        : { status: "not_checked", reason: "native_tool_list_incomplete" };
    };
    return {
      ...(product.status === "fulfilled" ? product.value : { inspectError: probeFailure(product.reason) }),
      compatibility: compatibilityReport("staff", {
        instance_inspect: product.status === "fulfilled" ? { status: "observed", evidence: "staff_product_inspect" } : probeFailure(product.reason),
        conversations_list: advertised("conversations_list"),
        conversation_read: advertised("messages_read"),
        message_prepare: advertised("conversation_get", "messages_send")
      })
    };
  }

  async conversationsList(instance, filters = {}) {
    if (filters.agentId !== undefined) throw new Error("agent_id filtering is currently supported only for Core");
    const result = await this.channels.call(instance, "conversations_list", filters);
    return { instanceId: instance.id, conversations: result.conversations || [] };
  }

  async conversationRead(instance, sessionKey, limit = 20) {
    const result = await this.channels.call(instance, "messages_read", { session_key: sessionKey, limit });
    return { instanceId: instance.id, sessionKey, messages: result.messages || [] };
  }

  async messagePrepare(instance, sessionKey, text) {
    const instanceId = instance.id;
    const route = await this.channels.call(instance, "conversation_get", { session_key: sessionKey });
    if (!route.conversation) throw new Error(`conversation not found: ${sessionKey}`);
    const operation = await this.operations.create({
      type: "message_send", retrySafe: false, actorId: this.operator.id, instanceId,
      instanceBinding: this.binding(instance), sessionKey, text,
      target: { channel: route.conversation.channel, accountId: route.conversation.accountId,
        title: route.conversation.title || route.conversation.displayName || sessionKey }
    });
    return {
      operationId: operation.operationId, proposalDigest: operation.proposalDigest,
      status: operation.status, instanceId, target: operation.target, text,
      warning: "Внешняя отправка. После unknown нельзя повторять commit вслепую."
    };
  }

  async contextRead(instance, targetId, agentId) {
    const selection = contextSelection(targetId, agentId);
    const remote = await this.controlCall(instance, "teamon.staff.context.read", selection);
    assertContextTarget(remote, selection);
    return { ...remote, instanceId: instance.id };
  }

  async contextPrepare(instance, targetId, expectedRevision, content, agentId) {
    const instanceId = instance.id;
    const selection = contextSelection(targetId, agentId);
    if (typeof content !== "string" || (agentId === undefined && !content.trim())) throw new Error("content is required for common context");
    const remote = await this.controlCall(instance, "teamon.staff.context.prepare", { ...selection, expectedRevision, content });
    assertContextTarget(remote, selection);
    const operation = await this.operations.create({
      type: "context_write", retrySafe: true, actorId: this.operator.id, instanceId,
      instanceBinding: this.binding(instance), ...selection, expectedRevision, content,
      remoteProposalDigest: remote.proposalDigest, target: remote.target, afterRevision: remote.afterRevision
    });
    return {
      operationId: operation.operationId, proposalDigest: operation.proposalDigest,
      status: operation.status, instanceId, target: operation.target,
      beforeRevision: expectedRevision, afterRevision: operation.afterRevision, contentBytes: remote.contentBytes
    };
  }

  async memberPrepare(instance, params) {
    const instanceId = instance.id;
    const remote = await this.controlCall(instance, "teamon.staff.member.prepare", params);
    const operation = await this.operations.create({
      type: "member_change", retrySafe: true, actorId: this.operator.id, instanceId,
      instanceBinding: this.binding(instance), params, remoteProposalDigest: remote.proposalDigest,
      target: { memberId: remote.change.memberId, action: remote.change.action }
    });
    return {
      operationId: operation.operationId, proposalDigest: operation.proposalDigest,
      status: operation.status, instanceId, target: operation.target,
      before: remote.before, change: remote.change, nativeAccess: "unchanged"
    };
  }

  async executeOperation(instance, executing) {
    if (executing.type === "message_send") {
      return await this.channels.call(instance, "messages_send", { session_key: executing.sessionKey, text: executing.text });
    }
    if (executing.type === "context_write") {
      const selection = contextSelection(executing.targetId, executing.agentId);
      assertContextTarget({ target: executing.target }, selection);
      const result = await this.controlCall(instance, "teamon.staff.context.commit", {
        ...selection, expectedRevision: executing.expectedRevision,
        proposalDigest: executing.remoteProposalDigest, content: executing.content
      });
      assertContextTarget(result, selection, { optional: true });
      return result;
    }
    if (executing.type === "member_change") {
      return await this.controlCall(instance, "teamon.staff.member.commit", { ...executing.params, proposalDigest: executing.remoteProposalDigest });
    }
    throw new Error(`unsupported operation type: ${executing.type}`);
  }
}
