import { z } from 'zod';
import { EntityIdSchema, TimestampSchema } from './primitives.ts';

const CountSchema = z.number().int().nonnegative();
const AmountSchema = z.number().finite().nonnegative();
const TimezoneSchema = z.string().min(1).refine((timezone) => {
  if (/^[+-]/.test(timezone) || timezone !== timezone.trim()) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); return true; } catch { return false; }
}, { message: 'Expected an IANA viewer timezone' });
const UsageIdentitySchema = EntityIdSchema.refine(
  (id) => !id.includes('/') && !id.includes('\\') && id !== '.' && id !== '..',
  { message: 'Expected an opaque canonical identity, never a filesystem path' },
);

export const UsageQuerySchema = z.strictObject({
  from: TimestampSchema.optional(),
  to: TimestampSchema.positive().default(() => Date.now()),
  timezone: TimezoneSchema,
  workspaceId: UsageIdentitySchema.optional(),
  projectId: UsageIdentitySchema.optional(),
}).refine((query) => query.from === undefined || query.from < query.to, {
  message: 'Expected an inclusive start before the exclusive end',
  path: ['from'],
});
export type UsageQuery = z.input<typeof UsageQuerySchema>;
export type UsageQueryResult = z.output<typeof UsageQuerySchema>;
export const UsageToolsQuerySchema = UsageQuerySchema;
export type UsageToolsQuery = UsageQuery;
export const UsageTokensSchema = z.strictObject({
  input: CountSchema, output: CountSchema, reasoning: CountSchema.nullable(),
  cacheRead: CountSchema, cacheWrite: CountSchema, total: CountSchema,
});
export type UsageTokens = z.infer<typeof UsageTokensSchema>;
export const UsageModelSchema = z.strictObject({
  providerId: EntityIdSchema, modelId: EntityIdSchema, variant: z.string().nullable(),
  steps: CountSchema, tokens: UsageTokensSchema, cost: AmountSchema,
});
export type UsageModel = z.infer<typeof UsageModelSchema>;
export const UsageToolTotalsSchema = z.strictObject({
  calls: CountSchema, succeeded: CountSchema, failed: CountSchema, unfinished: CountSchema,
}).refine((totals) => totals.calls === totals.succeeded + totals.failed + totals.unfinished, {
  message: 'Tool outcomes must account for every call',
});
export type UsageToolTotals = z.infer<typeof UsageToolTotalsSchema>;
export const UsageToolUsageSchema = z.strictObject({
  name: z.string().min(1), calls: CountSchema, succeeded: CountSchema, failed: CountSchema,
  unfinished: CountSchema, durationP50: AmountSchema.nullable(),
}).refine((tool) => tool.calls === tool.succeeded + tool.failed + tool.unfinished, {
  message: 'Tool outcomes must account for every call',
});
export type UsageToolUsage = z.infer<typeof UsageToolUsageSchema>;
export const UsageToolsSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('none') }),
  z.strictObject({ mode: z.literal('summary'), totals: UsageToolTotalsSchema }),
  z.strictObject({ mode: z.literal('detail'), totals: UsageToolTotalsSchema, usage: z.array(UsageToolUsageSchema) }),
]);
export type UsageTools = z.infer<typeof UsageToolsSchema>;
const FailureShape = {
  partial: z.boolean(),
  errors: z.record(UsageIdentitySchema, z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/)).optional(),
};
export const UsageToolsResponseSchema = z.strictObject({
  totals: UsageToolTotalsSchema, usage: z.array(UsageToolUsageSchema), ...FailureShape,
});
export type UsageToolsResponse = z.infer<typeof UsageToolsResponseSchema>;
export const UsageStatsSchema = z.strictObject({
  range: z.strictObject({ from: TimestampSchema, to: TimestampSchema }).refine((range) => range.from < range.to),
  sessions: CountSchema, subagents: CountSchema, prompts: CountSchema, steps: CountSchema,
  tokens: UsageTokensSchema, cost: AmountSchema, tools: UsageToolsSchema,
  activeDays: CountSchema, streak: CountSchema,
  activity: z.array(z.strictObject({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), steps: CountSchema })),
  models: z.array(UsageModelSchema), ...FailureShape,
});
export type UsageStats = z.infer<typeof UsageStatsSchema>;
