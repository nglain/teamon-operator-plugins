import { callControlRpc } from "./control-rpc.mjs";
import { ChannelMcpPool } from "./channel-mcp.mjs";
import { digest } from "./digest.mjs";
import { OperationStore } from "./operations.mjs";
import { CoreDashboard, CORE_CAPABILITIES } from "./adapters/core.mjs";
import { StaffAdapter } from "./adapters/staff.mjs";

function summary(instance) {
  if (instance.runtime === "core") return {
    instanceId: instance.id, label: instance.label, runtime: "core",
    desired: null, capabilities: CORE_CAPABILITIES
  };
  const release = instance.desired.release || {};
  return {
    instanceId: instance.id, label: instance.label, runtime: "staff", hubId: instance.hubId,
    desired: {
      revision: instance.desired.revision, application: release.application,
      version: release.version, releaseDigest: release.releaseDigest, target: instance.desired.target
    }
  };
}

function assertOperationProposal(operation, operationId, proposalDigest) {
  // Reconstruct the exact existing create() input; status and receipts are not
  // proposal fields. A stored digest string alone does not bind altered bytes.
  const { schemaVersion, status, createdAt, updatedAt, proposalDigest: storedDigest, result, error, ...proposal } = operation;
  if (operation.operationId !== operationId || storedDigest !== proposalDigest || digest(proposal) !== proposalDigest) {
    throw new Error("proposal digest mismatch; prepare the exact operation again");
  }
}

export class OperatorService {
  constructor(config, dependencies = {}) {
    this.config = config;
    this.channels = dependencies.channels || new ChannelMcpPool();
    this.controlCall = dependencies.controlCall || callControlRpc;
    this.operations = dependencies.operations || new OperationStore(config.stateRoot);
    // Two explicit native implementations, not a dynamic plugin or version registry.
    this.adapters = {
      core: dependencies.core || new CoreDashboard({ operator: config.operator, operations: this.operations }),
      staff: new StaffAdapter({ operator: config.operator, operations: this.operations,
        channels: this.channels, controlCall: this.controlCall })
    };
  }

  instance(instanceId) {
    const instance = this.config.instances.find(({ id }) => id === instanceId);
    if (!instance) throw new Error(`unknown instance: ${instanceId}`);
    return instance;
  }

  #method(instance, name) {
    const runtime = instance.runtime || "staff";
    const adapter = this.adapters[runtime];
    if (!adapter) throw new Error(`unsupported runtime: ${runtime}`);
    if (typeof adapter[name] !== "function") {
      if (runtime === "core") throw new Error(`Core operation_not_supported: ${name} is not implemented in this adapter. Core agent authority is unchanged.`);
      throw new Error(`Staff operation_not_supported: ${name} inspection is currently supported only for Core instances`);
    }
    return adapter[name].bind(adapter, instance);
  }

  async #call(instanceId, name, ...args) {
    return await this.#method(this.instance(instanceId), name)(...args);
  }

  fleetList() {
    return { operator: this.config.operator, hubs: this.config.hubs, instances: this.config.instances.map(summary) };
  }

  async instanceInspect(instanceId) {
    const instance = this.instance(instanceId);
    return { ...summary(instance), observed: await this.#method(instance, "instanceInspect")() };
  }

  async conversationsList(instanceId, filters = {}) {
    if (filters.userId !== undefined && this.instance(instanceId).runtime !== "core") throw new Error("Staff operation_not_supported: exact Core user filter must not become unfiltered discovery");
    return await this.#call(instanceId, "conversationsList", filters);
  }

  async conversationRead(instanceId, sessionKey, limit = 20, selection) {
    return await this.#call(instanceId, "conversationRead", sessionKey, limit, selection);
  }

  async messagePrepare(instanceId, sessionKey, text, reason, basis) {
    return await this.#call(instanceId, "messagePrepare", sessionKey, text, reason, basis);
  }

  async agentConsult(instanceId, sessionKey, input) {
    return await this.#call(instanceId, "agentConsult", sessionKey, input);
  }

  async consultationRead(instanceId, selection) {
    return await this.#call(instanceId, "consultationRead", selection);
  }

  async consultationCancel(instanceId, consultationId) {
    return await this.#call(instanceId, "consultationCancel", consultationId);
  }

  async contextRead(instanceId, targetId, agentId) {
    return await this.#call(instanceId, "contextRead", targetId, agentId);
  }

  async contextPrepare(instanceId, targetId, expectedRevision, content, agentId) {
    return await this.#call(instanceId, "contextPrepare", targetId, expectedRevision, content, agentId);
  }

  async memberPrepare(instanceId, params) {
    return await this.#call(instanceId, "memberPrepare", params);
  }

  async agentInspect(instanceId, agentId) {
    return await this.#call(instanceId, "agentInspect", agentId);
  }

  async agentConfigurationRead(instanceId, agentId) {
    return await this.#call(instanceId, "agentConfigurationRead", agentId);
  }

  async agentDocumentRead(instanceId, agentId, target) {
    return await this.#call(instanceId, "agentDocumentRead", agentId, target);
  }

  async agentDocumentsList(instanceId, agentId, selection) {
    return await this.#call(instanceId, "agentDocumentsList", agentId, selection);
  }

  async remindersRead(instanceId, agentId, userId) {
    return await this.#call(instanceId, "remindersRead", agentId, userId);
  }

  async providerAuthRead(instanceId) { return await this.#call(instanceId, "providerAuthRead"); }
  async providerAuthStart(instanceId) { return await this.#call(instanceId, "providerAuthStart"); }
  async connectorCredentialRead(instanceId, selection) { return await this.#call(instanceId, "connectorCredentialRead", selection); }

  async agentChangePrepare(instanceId, agentId, expectedRevision, change, reason) {
    return await this.#call(instanceId, "agentChangePrepare", agentId, expectedRevision, change, reason);
  }

  async activityRead(instanceId, filters) {
    return await this.#call(instanceId, "activityRead", filters);
  }

  async automationsList(instanceId, agentId, userId) {
    return await this.#call(instanceId, "automationsList", agentId, userId);
  }

  async operationCommit(operationId, proposalDigest) {
    return await this.operations.withCommitLock(operationId, async () => {
      const pending = await this.operations.read(operationId);
      assertOperationProposal(pending, operationId, proposalDigest);
      const instance = this.instance(pending.instanceId);
      const execute = this.#method(instance, "executeOperation");
      const binding = this.#method(instance, "binding")();
      if (pending.instanceBinding !== binding) throw new Error("instance binding changed; prepare the operation again");
      // Core owns the send fence and can resolve a lost HTTP reply. Never create
      // another send or retry an ambiguous native receipt. Staff semantics stay intact.
      if (instance.runtime === "core" && ["executing", "unknown"].includes(pending.status)) {
        const receipt = await this.#method(instance, "operationInspect")(pending);
        if (receipt.status === "delivered" || pending.type === "agent_change" && receipt.status === "applied") return await this.operations.update(operationId, current => {
          const complete = { ...current, status: "complete", result: receipt }; delete complete.error; return complete;
        });
        if (receipt.status !== "prepared") throw new Error(`Core operation ${receipt.status}; no repeat effect is permitted without a known result`);
        await this.operations.update(operationId, current => ({ ...current, status: "prepared" }));
      }
      const claim = await this.operations.claim(operationId, proposalDigest, binding);
      assertOperationProposal(claim.operation, operationId, proposalDigest);
      if (!claim.claimed) return claim.operation;
      try {
        const result = await execute(claim.operation);
        return await this.operations.update(operationId, current => {
          const complete = { ...current, status: "complete", result };
          delete complete.error;
          return complete;
        });
      } catch (error) {
        await this.operations.update(operationId, current => ({
          ...current, status: "unknown", error: error instanceof Error ? error.message : String(error)
        }));
        throw error;
      }
    });
  }

  async operationInspect(operationId) {
    const operation = await this.operations.read(operationId);
    assertOperationProposal(operation, operationId, operation.proposalDigest);
    const instance = this.instance(operation.instanceId);
    if (operation.instanceBinding !== this.#method(instance, "binding")()) throw new Error("instance binding changed; receipt belongs to the previous target");
    return { operation, ...(instance.runtime === "core" ? { nativeReceipt: await this.#method(instance, "operationInspect")(operation) } : {}) };
  }

  async close() {
    await this.channels.close?.();
  }
}
