import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { EntityIdSchema, JsonObjectSchema, JsonValueSchema, ProblemCodeSchema, MCPServerConfigSchema, ApprovalGrantSchema, type ApprovalGrant } from '@openchamber/agent-contract';

const PrivatePathSchema = z.string().min(1).refine(isAbsolute);
/** OMP internal URL schemes the Host passes to the SDK instead of resolving. */
export const OMP_INTERNAL_URL_SCHEMES = ['agent', 'history', 'local', 'proc', 'skill', 'xd', 'mcp', 'omp', 'issue', 'pr'] as const;
const OMP_INTERNAL_URL_SCHEME_SET: Record<string, true> = Object.fromEntries(OMP_INTERNAL_URL_SCHEMES.map(scheme => [scheme, true]));
const OmpInternalUrlSchema = z.string().min(1).refine((value) => {
  if (value.includes('\0')) return false;
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//.exec(value);
  return match !== null && OMP_INTERNAL_URL_SCHEME_SET[match[1]!.toLowerCase()] === true;
});
/**
 * The only internal scheme a native tool may write. `local://` is OMP's
 * session artifact sandbox, where an approved Plan-mode plan file lives; every
 * other scheme is a read source, a device transport or a remote owner.
 */
const OMP_WRITABLE_INTERNAL_SCHEME = 'local';
const OmpWritableInternalUrlSchema = z.string().min(1).refine((value) => {
  if (value.includes('\0')) return false;
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//.exec(value);
  return match !== null && match[1]!.toLowerCase() === OMP_WRITABLE_INTERNAL_SCHEME;
});
export const HostNativePolicySnapshotSchema = z.strictObject({
  projectId: EntityIdSchema, workspaceId: EntityIdSchema, agentDirectoryId: EntityIdSchema,
  cwd: PrivatePathSchema, agentDirectory: PrivatePathSchema,
  providers: z.array(z.strictObject({ providerId: EntityIdSchema, modelId: EntityIdSchema, endpoint: z.string().url().optional() })),
  mcpServers: z.array(MCPServerConfigSchema), agentIds: z.array(EntityIdSchema),
});
export type HostNativePolicySnapshot = z.infer<typeof HostNativePolicySnapshotSchema>;
const NativeEditModeSchema = z.enum(['apply_patch', 'hashline', 'none', 'patch', 'replace', 'sloppy']);
/** Capability tier the tool declares for itself; the Host classifies unknown tools by it. */
const NativeToolTierSchema = z.enum(['read', 'write', 'exec']);
export type NativeToolTier = z.infer<typeof NativeToolTierSchema>;
export const NativePolicyContextSchema = z.strictObject({
  editMode: NativeEditModeSchema,
  declaredTier: NativeToolTierSchema,
  providerId: EntityIdSchema.optional(), modelId: EntityIdSchema.optional(), endpoint: z.string().url().optional(),
});
export type NativePolicyContext = z.infer<typeof NativePolicyContextSchema>;
const NativeApprovalGrantSchema = ApprovalGrantSchema;
export type NativeApprovalGrant = ApprovalGrant;
export const NativeLspActionSchema = z.enum([
  'diagnostics',
  'definition',
  'type_definition',
  'implementation',
  'references',
  'hover',
  'symbols',
  'status',
  'capabilities',
  'code_actions',
  'rename',
  'rename_file',
  'reload',
  'request',
  'format',
]);
export type NativeLspAction = z.infer<typeof NativeLspActionSchema>;
export const NativeOperationDescriptorSchema = z.strictObject({
  toolName: z.string().min(1), effectiveMode: NativeEditModeSchema.optional(),
  sourcePaths: z.array(PrivatePathSchema), destinationPaths: z.array(PrivatePathSchema),
  /** Read targets OMP resolves itself; never filesystem paths. */
  internalReadUrls: z.array(OmpInternalUrlSchema).optional(),
  /** `local://` write targets OMP resolves itself, e.g. a Plan-mode plan file. */
  internalWriteUrls: z.array(OmpWritableInternalUrlSchema).optional(),
  fileOps: z.array(z.strictObject({ kind: z.string().min(1), path: PrivatePathSchema, to: PrivatePathSchema.optional() })),
  command: z.string().optional(), declaredTier: NativeToolTierSchema.optional(), providerId: EntityIdSchema.optional(), modelId: EntityIdSchema.optional(), endpoint: z.string().url().optional(),
  approvalGrant: NativeApprovalGrantSchema.optional(),
  lspAction: z.string().min(1).optional(),
  lspMethod: z.string().min(1).optional(),
});
export type NativeOperationDescriptor = z.infer<typeof NativeOperationDescriptorSchema>;
const HostToolActions = {
  openchamber: ['projects.list', 'models.list', 'session.list', 'session.track', 'session.markDone', 'session.create', 'session.send', 'session.fork', 'session.status', 'session.messages', 'session.link', 'pr.watch', 'pr.unwatch', 'wait.list', 'wait.start', 'wait.stop', 'schedule.list', 'schedule.create', 'schedule.update', 'schedule.run', 'schedule.delete', 'schedule.toggle', 'file.open'],
  web: ['browser.open', 'browser.snapshot', 'browser.click', 'browser.type', 'browser.scroll', 'browser.back', 'browser.forward', 'browser.inspect', 'browser.capture', 'browser.resize'],
  openchamber_knowledge: ['knowledge.list', 'knowledge.save', 'knowledge.delete', 'knowledge.show'],
  notify: ['notify.send'],
  openchamber_usage: ['usage.read'],
  openchamber_render: ['render.page'],
  openchamber_secret: ['secret.run', 'secret.forget', 'secret.request'],
  openchamber_workflow: ['workflow.check', 'workflow.run', 'workflow.status', 'workflow.result', 'workflow.stop', 'workflow.resume', 'workflow.save', 'workflow.list', 'workflow.answer'],
} as const;
export const HostActionRequestSchema = z.discriminatedUnion('toolName', [
  z.strictObject({ toolName: z.literal('openchamber'), action: z.enum(HostToolActions.openchamber), input: JsonObjectSchema, sessionId: EntityIdSchema }),
  z.strictObject({ toolName: z.literal('web'), action: z.enum(HostToolActions.web), input: JsonObjectSchema, sessionId: EntityIdSchema }),
  z.strictObject({ toolName: z.literal('openchamber_knowledge'), action: z.enum(HostToolActions.openchamber_knowledge), input: JsonObjectSchema, sessionId: EntityIdSchema }),
  z.strictObject({ toolName: z.literal('notify'), action: z.enum(HostToolActions.notify), input: JsonObjectSchema, sessionId: EntityIdSchema }),
  z.strictObject({ toolName: z.literal('openchamber_usage'), action: z.enum(HostToolActions.openchamber_usage), input: JsonObjectSchema, sessionId: EntityIdSchema }),
  // A page that waits for the user's answer is resolved by its own call, so
  // the call's identity travels with the request.
  z.strictObject({ toolName: z.literal('openchamber_render'), action: z.enum(HostToolActions.openchamber_render), input: JsonObjectSchema, sessionId: EntityIdSchema, toolCallId: EntityIdSchema.optional() }),
  z.strictObject({ toolName: z.literal('openchamber_secret'), action: z.enum(HostToolActions.openchamber_secret), input: JsonObjectSchema, sessionId: EntityIdSchema, toolCallId: EntityIdSchema }),
  z.strictObject({ toolName: z.literal('openchamber_workflow'), action: z.enum(HostToolActions.openchamber_workflow), input: JsonObjectSchema, sessionId: EntityIdSchema }),
]);
export type HostActionRequest = z.infer<typeof HostActionRequestSchema>;
export const HostActionResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), value: JsonValueSchema }),
  z.strictObject({ ok: z.literal(false), code: ProblemCodeSchema, status: z.number().int().min(400).max(599), detail: z.string().optional() }),
]);
export type HostActionResult = z.infer<typeof HostActionResultSchema>;
