import { z } from 'zod';
import { CounterSchema, EntityIdSchema, EpochSchema, TimestampSchema } from './primitives.ts';

export const ShellScopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('session'), sessionId: EntityIdSchema }),
  z.strictObject({ kind: z.literal('workspace'), workspaceId: EntityIdSchema }),
  z.strictObject({ kind: z.literal('project'), projectId: EntityIdSchema }),
  z.strictObject({ kind: z.literal('global') }),
]);
export type ShellScope = z.infer<typeof ShellScopeSchema>;

const ShellJobIdentityFields = {
  jobId: EntityIdSchema,
  sessionId: EntityIdSchema,
  epoch: EpochSchema,
  workerGeneration: EntityIdSchema,
};
export const ShellJobIdentitySchema = z.strictObject(ShellJobIdentityFields);
export type ShellJobIdentity = z.infer<typeof ShellJobIdentitySchema>;

export const ShellTerminationSchema = z.discriminatedUnion('reason', [
  z.strictObject({ reason: z.literal('exit'), exitCode: z.number().int() }),
  z.strictObject({ reason: z.literal('stopped'), exitCode: z.number().int().nullable() }),
  z.strictObject({ reason: z.literal('timeout'), exitCode: z.number().int().nullable() }),
  z.strictObject({ reason: z.literal('signal'), exitCode: z.number().int().nullable() }),
  z.strictObject({ reason: z.literal('worker-lost'), exitCode: z.null() }),
]);
export type ShellTermination = z.infer<typeof ShellTerminationSchema>;

const ShellObservationFields = {
  ...ShellJobIdentityFields,
  workspaceId: EntityIdSchema,
  projectId: EntityIdSchema,
  command: z.string().min(1),
  background: z.boolean(),
  startedAt: TimestampSchema,
  outputCursor: CounterSchema,
};
export const RunningShellSchema = z.strictObject({ ...ShellObservationFields, status: z.literal('running') });
const EndedShellSchema = z.strictObject({
  ...ShellObservationFields,
  status: z.literal('ended'),
  endedAt: TimestampSchema,
  termination: ShellTerminationSchema,
}).refine((job) => job.endedAt >= job.startedAt, 'Shell termination follows its start');

export const ShellJobSchema = z.discriminatedUnion('status', [RunningShellSchema, EndedShellSchema]);
export type ShellJob = z.infer<typeof ShellJobSchema>;

export const ShellSnapshotSchema = z.strictObject({
  scope: ShellScopeSchema,
  epoch: EpochSchema,
  revision: CounterSchema,
  running: z.array(RunningShellSchema),
  ended: z.array(EndedShellSchema).max(200),
  recovery: z.strictObject({ priorEpochs: z.literal('invalidated') }),
}).superRefine((snapshot, context) => {
  const jobs = [...snapshot.running, ...snapshot.ended];
  if (new Set(jobs.map((job) => JSON.stringify([job.sessionId, job.workerGeneration, job.jobId]))).size !== jobs.length) {
    context.addIssue({ code: 'custom', message: 'Scoped Shell observations contain each job once' });
  }
  if (jobs.some((job) => job.epoch !== snapshot.epoch
    || (snapshot.scope.kind === 'workspace' && job.workspaceId !== snapshot.scope.workspaceId)
    || (snapshot.scope.kind === 'project' && job.projectId !== snapshot.scope.projectId))) {
    context.addIssue({ code: 'custom', message: 'Jobs belong to the authorized scope and current observation epoch' });
  }
  if (snapshot.ended.some((job, index) => index > 0 && job.endedAt < snapshot.ended[index - 1].endedAt)) {
    context.addIssue({ code: 'custom', path: ['ended'], message: 'Newest-200 ended history is ordered oldest end first' });
  }
});
export type ShellSnapshot = z.infer<typeof ShellSnapshotSchema>;

export const ShellStartRequestSchema = z.strictObject({
  command: z.string().min(1),
  background: z.boolean(),
  timeoutMs: z.number().int().positive().optional(),
});
export type ShellStartRequest = z.infer<typeof ShellStartRequestSchema>;

export const ShellOutputRequestSchema = z.strictObject({
  job: ShellJobIdentitySchema,
  cursor: CounterSchema,
  tailBytes: z.number().int().positive().max(65536),
});
export type ShellOutputRequest = z.infer<typeof ShellOutputRequestSchema>;

export const ShellOutputSchema = z.strictObject({
  job: ShellJobIdentitySchema,
  requestedCursor: CounterSchema,
  startCursor: CounterSchema,
  cursor: CounterSchema,
  skippedBytes: CounterSchema,
  output: z.string().refine((output) => new TextEncoder().encode(output).byteLength <= 65536, 'Shell output is at most 64 KiB of UTF-8'),
  ended: z.boolean(),
}).refine((output) => {
  // Zod string constraints can report issues without stopping object refinements.
  try {
    const requested = BigInt(output.requestedCursor);
    const start = BigInt(output.startCursor);
    const end = BigInt(output.cursor);
    return start === requested + BigInt(output.skippedBytes)
      && end === start + BigInt(new TextEncoder().encode(output.output).byteLength);
  } catch {
    return false;
  }
}, 'Output byte range and skipped-byte count match the emitted UTF-8 stream');
export type ShellOutput = z.infer<typeof ShellOutputSchema>;

export const ShellStopRequestSchema = z.strictObject({ job: ShellJobIdentitySchema });
export type ShellStopRequest = z.infer<typeof ShellStopRequestSchema>;

export const ShellStopResultSchema = z.strictObject({ job: EndedShellSchema }).refine(
  (result) => result.job.termination.reason === 'stopped', 'A successful stop acknowledges actual terminal cancellation',
);
export type ShellStopResult = z.infer<typeof ShellStopResultSchema>;
