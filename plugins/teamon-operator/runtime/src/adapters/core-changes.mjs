import { z } from "zod";

// Wire schemas for Core's semantic writers, not an arbitrary file/HTTP API.
export const coreRevisionSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const coreAgentIdSchema = z.string().max(200).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9_.-]*)?$/u);
const documentRevision = z.union([coreRevisionSchema, z.literal("absent")]);
const sourcePath = z.string().min(1).max(240).refine(value => !value.startsWith("/") && !value.includes("\\")
  && value.split("/").every(part => part && part !== "." && part !== "..") && !/[\x00-\x1f]/u.test(value), "Use a relative document name, not a filesystem path");
const editableTarget = z.discriminatedUnion("scope", [
  z.strictObject({ scope: z.literal("company_context"), path: sourcePath }),
  z.strictObject({ scope: z.literal("agent_context"), path: sourcePath }),
  z.strictObject({ scope: z.literal("agent_skill"), path: sourcePath }),
  z.strictObject({ scope: z.literal("user_context"), path: sourcePath.refine(value => value.startsWith("context/"), "User documents use context/<name>.md, not personal memory files"), userId: z.number().int().safe().refine(value => value !== 0) })
]);
export const coreDocumentTargetSchema = z.union([
  z.strictObject({ scope: z.literal("costume"), path: z.enum(["CLAUDE.md", "AGENTS.md"]) }), editableTarget
]);
const provider = z.enum(["claude", "chatgpt", "opencode"]);
const name = z.string().min(1).max(128);
export const coreDocumentInventorySchema = z.discriminatedUnion("scope", [
  ...["company_context", "agent_context", "agent_skill"].map(scope => z.strictObject({ scope: z.literal(scope), limit: z.number().int().min(1).max(100).optional() })),
  z.strictObject({ scope: z.literal("user_context"), userId: z.number().int().safe().refine(value => value !== 0), limit: z.number().int().min(1).max(100).optional() })
]);
export const coreReminderRevisionSchema = z.string().regex(/^[a-f0-9]{24}$/u);
const reminderFields = {
  label: z.string().min(1).max(200), prompt: z.string().min(1).max(32000), enabled: z.boolean().optional(),
  run_at: z.string().min(1).max(100).optional(), schedule: z.string().min(1).max(100).optional(),
  timezone: z.string().min(1).max(100).optional(), overlap_policy: z.enum(["catch_up", "next_tick"]).optional(),
  delivery: z.strictObject({ channel: z.enum(["telegram", "bitrix"]), target: z.string().min(1).max(300) }), silent: z.boolean().optional()
};
const reminderEntry = z.strictObject(reminderFields);
const reminderMutation = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("add"), entry: reminderEntry }),
  z.strictObject({ action: z.literal("update"), id: z.string().min(1).max(200), patch: reminderEntry.partial().refine(value => Object.keys(value).length > 0, "Provide at least one reminder field") }),
  z.strictObject({ action: z.literal("delete"), id: z.string().min(1).max(200) })
]);
export const coreChangeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("settings.update"), patch: z.strictObject({
    name: z.string().min(1).max(128).optional(), description: z.string().max(4000).optional(),
    role: z.string().min(1).max(128).optional(), language: z.string().min(1).max(100).optional(),
    model: z.strictObject({ primary: z.string().min(1).max(200).nullable() }).optional()
  }).refine(value => Object.keys(value).length > 0, "Provide at least one setting") }),
  z.strictObject({ kind: z.literal("costume.patch"), file: z.enum(["CLAUDE.md", "AGENTS.md"]),
    expectedDocumentRevision: coreRevisionSchema, oldText: z.string().min(1).max(131072), newText: z.string().max(131072) }),
  z.strictObject({ kind: z.literal("document.update"), target: editableTarget, expectedDocumentRevision: documentRevision,
    content: z.string().max(131072) }),
  z.strictObject({ kind: z.literal("skill.assignment"), name, action: z.enum(["assign", "unassign", "enable", "disable"]) }),
  z.strictObject({ kind: z.literal("connector.assignment"), name, assigned: z.boolean() }),
  z.strictObject({ kind: z.literal("provider.assign"), provider, providerPool: z.array(provider).min(1).max(3) }),
  z.strictObject({ kind: z.literal("reminder.change"), userId: z.number().int().safe().refine(value => value !== 0), expectedReminderRevision: coreReminderRevisionSchema, mutation: reminderMutation })
]);
export const CORE_CHANGE_KINDS = coreChangeSchema.options.map(schema => schema.shape.kind.value);
export const CORE_ADMIN_CAPABILITIES = ["agentState", "agentDocument", "agentChangePrepare", "agentChangeCommit", "agentChangeStatus"];
// Optional extensions must not disable existing administration on older Core.
export const CORE_LIFECYCLE_CAPABILITIES = ["documentInventory", "reminders", "providerAuth", "connectorCredential"];
export const coreCredentialSelectionSchema = z.strictObject({
  connector: z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/u),
  agentId: coreAgentIdSchema.optional(), userId: z.number().int().safe().positive().optional()
}).refine(value => value.userId === undefined || value.agentId !== undefined, "User credentials require an exact agent");
export const coreCredentialEntriesSchema = z.record(z.string().regex(/^[A-Z_][A-Z0-9_]{0,127}$/u), z.string().min(1).max(32000).refine(value => !/[\r\n\0]/u.test(value), "Use a single-line native credential value"))
  .refine(value => Object.keys(value).length > 0 && Object.keys(value).length <= 64, "Provide 1–64 named values")
  .refine(value => Buffer.byteLength(JSON.stringify(value), "utf8") <= 128 * 1024, "Credential input exceeds 128 KiB");
