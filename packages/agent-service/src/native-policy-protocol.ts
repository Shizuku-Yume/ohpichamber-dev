import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { EntityIdSchema, JsonObjectSchema, JsonValueSchema, ProblemCodeSchema, MCPServerConfigSchema } from '@openchamber/agent-contract';

const PrivatePathSchema = z.string().min(1).refine(isAbsolute);
export const HostNativePolicySnapshotSchema = z.strictObject({
  projectId: EntityIdSchema, workspaceId: EntityIdSchema, agentDirectoryId: EntityIdSchema,
  cwd: PrivatePathSchema, agentDirectory: PrivatePathSchema,
  providers: z.array(z.strictObject({ providerId: EntityIdSchema, modelId: EntityIdSchema, endpoint: z.string().url().optional() })),
  mcpServers: z.array(MCPServerConfigSchema), agentIds: z.array(EntityIdSchema), permissionPresetIds: z.array(EntityIdSchema),
});
export type HostNativePolicySnapshot = z.infer<typeof HostNativePolicySnapshotSchema>;
export const NativePolicyContextSchema = z.strictObject({
  editMode: z.enum(['apply_patch', 'hashline', 'patch', 'replace', 'sloppy']),
  providerId: EntityIdSchema.optional(), modelId: EntityIdSchema.optional(), endpoint: z.string().url().optional(),
});
export type NativePolicyContext = z.infer<typeof NativePolicyContextSchema>;
export const NativeApprovalGrantSchema = z.strictObject({ approvalId: EntityIdSchema, toolCallId: EntityIdSchema, rootSessionId: EntityIdSchema, workerGeneration: EntityIdSchema, epoch: EntityIdSchema, command: z.string().min(1) });
export type NativeApprovalGrant = z.infer<typeof NativeApprovalGrantSchema>;
export const NativeOperationDescriptorSchema = z.strictObject({
  toolName: z.string().min(1), effectiveMode: NativePolicyContextSchema.shape.editMode.optional(),
  sourcePaths: z.array(PrivatePathSchema), destinationPaths: z.array(PrivatePathSchema),
  fileOps: z.array(z.strictObject({ kind: z.string().min(1), path: PrivatePathSchema, to: PrivatePathSchema.optional() })),
  command: z.string().optional(), providerId: EntityIdSchema.optional(), modelId: EntityIdSchema.optional(), endpoint: z.string().url().optional(),
  approvalGrant: NativeApprovalGrantSchema.optional(),
});
export type NativeOperationDescriptor = z.infer<typeof NativeOperationDescriptorSchema>;
export const HostToolActions = {
  openchamber: ['projects.list', 'models.list', 'session.list', 'session.create', 'session.send', 'session.fork', 'session.status', 'session.messages', 'session.link', 'schedule.list', 'schedule.create', 'schedule.update', 'schedule.run', 'schedule.delete', 'schedule.toggle', 'file.open'],
  web: ['browser.open', 'browser.snapshot', 'browser.click', 'browser.type', 'browser.scroll', 'browser.back', 'browser.forward', 'browser.inspect', 'browser.capture', 'browser.resize'],
  memory: ['memory.read', 'memory.list', 'memory.save', 'memory.delete'],
  notify: ['notify.send'],
} as const;
export const HostActionRequestSchema = z.discriminatedUnion('toolName', [
  z.strictObject({ toolName: z.literal('openchamber'), action: z.enum(HostToolActions.openchamber), input: JsonObjectSchema, sessionId: EntityIdSchema }),
  z.strictObject({ toolName: z.literal('web'), action: z.enum(HostToolActions.web), input: JsonObjectSchema, sessionId: EntityIdSchema }),
  z.strictObject({ toolName: z.literal('memory'), action: z.enum(HostToolActions.memory), input: JsonObjectSchema, sessionId: EntityIdSchema }),
  z.strictObject({ toolName: z.literal('notify'), action: z.enum(HostToolActions.notify), input: JsonObjectSchema, sessionId: EntityIdSchema }),
]);
export type HostActionRequest = z.infer<typeof HostActionRequestSchema>;
export const HostActionResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), value: JsonValueSchema }),
  z.strictObject({ ok: z.literal(false), code: ProblemCodeSchema, status: z.number().int().min(400).max(599) }),
]);
export type HostActionResult = z.infer<typeof HostActionResultSchema>;
