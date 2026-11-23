import { z } from 'zod';
import { EntityIdSchema, JsonObjectSchema } from './primitives.ts';

export const OMP_PROVIDER_APIS = [
  'openai-completions',
  'openai-responses',
  'openai-codex-responses',
  'azure-openai-responses',
  'anthropic-messages',
  'bedrock-converse-stream',
  'google-generative-ai',
  'google-gemini-cli',
  'google-vertex',
  'openrouter-decisions',
  'openai-decisions',
  'google-decisions',
  'workers-ai-systemone',
  'liquid-systemone',
  'nace-systemone',
  'typesafe',
] as const;

export const OmpProviderApiSchema = z.enum(OMP_PROVIDER_APIS);
export type OmpProviderApi = z.infer<typeof OmpProviderApiSchema>;

export const OMP_RUNNER_APIS = [
  'openai-images',
  'openrouter-images',
  'openai-speech',
  'xai-tts',
  'openai-transcriptions',
  'openai-embeddings',
  'openrouter-rerank',
  'openrouter-video',
] as const;

export const OmpRunnerApiSchema = z.enum(OMP_RUNNER_APIS);
export type OmpRunnerApi = z.infer<typeof OmpRunnerApiSchema>;

export const OMP_MODEL_APIS = [...OMP_PROVIDER_APIS, ...OMP_RUNNER_APIS] as const;
export const OmpModelApiSchema = z.enum(OMP_MODEL_APIS);
export type OmpModelApi = z.infer<typeof OmpModelApiSchema>;

export const OMP_MODEL_KINDS = ['chat', 'tiny', 'image', 'tts', 'stt', 'embedding', 'rerank', 'video', 'judge'] as const;
export const OmpModelKindSchema = z.enum(OMP_MODEL_KINDS);
export type OmpModelKind = z.infer<typeof OmpModelKindSchema>;

export const OMP_THINKING_MODES = ['effort', 'budget', 'google-level', 'anthropic-adaptive', 'anthropic-budget-effort'] as const;
export const OmpThinkingModeSchema = z.enum(OMP_THINKING_MODES);
export type OmpThinkingMode = z.infer<typeof OmpThinkingModeSchema>;

export const OMP_THINKING_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export const OmpThinkingEffortSchema = z.enum(OMP_THINKING_EFFORTS);
export type OmpThinkingEffort = z.infer<typeof OmpThinkingEffortSchema>;

export const OMP_MODEL_TOKENIZERS = [
  'claude-v3',
  'claude-v47',
  'claude-v5',
  'claude-v5-sonnet',
  'qwen3',
  'deepseek-v3',
  'kimi-k2',
  'glm5',
  'cl100k',
  'o200k',
] as const;
export const OmpModelTokenizerSchema = z.enum(OMP_MODEL_TOKENIZERS);
export type OmpModelTokenizer = z.infer<typeof OmpModelTokenizerSchema>;

export const OMP_PROVIDER_AUTH_MODES = ['apiKey', 'none', 'oauth'] as const;
export const OmpProviderAuthModeSchema = z.enum(OMP_PROVIDER_AUTH_MODES);
export type OmpProviderAuthMode = z.infer<typeof OmpProviderAuthModeSchema>;

export const OMP_DISCOVERY_TYPES = [
  'ollama',
  'llama.cpp',
  'lm-studio',
  'openai-models-list',
  'proxy',
  'litellm',
  'apple-foundation-models',
] as const;
export const OmpDiscoveryTypeSchema = z.enum(OMP_DISCOVERY_TYPES);
export type OmpDiscoveryType = z.infer<typeof OmpDiscoveryTypeSchema>;
export const OMP_BEDROCK_GUARDRAIL_TRACES = ['enabled', 'disabled', 'enabled_full'] as const;
export const OmpBedrockGuardrailTraceSchema = z.enum(OMP_BEDROCK_GUARDRAIL_TRACES);
export type OmpBedrockGuardrailTrace = z.infer<typeof OmpBedrockGuardrailTraceSchema>;

export const PublicEndpointSchema = z.url({ protocol: /^https?$/ }).refine((endpoint) => {
  const url = new URL(endpoint);
  return url.username === '' && url.password === '' && url.hash === '';
}, 'Public endpoints contain no embedded credentials or fragments');

export const HeaderNameSchema = z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/);
export const ProviderHeaderWriteSchema = z.record(HeaderNameSchema, z.string().refine(value => !/[\r\n]/.test(value)));

export const OmpHeadersPatchSchema = z.strictObject({
  set: ProviderHeaderWriteSchema.optional(),
  remove: z.array(HeaderNameSchema).optional(),
});
export type OmpHeadersPatch = z.infer<typeof OmpHeadersPatchSchema>;

export const OmpThinkingEffortMapSchema = z.strictObject({
  minimal: z.string().min(1).optional(),
  low: z.string().min(1).optional(),
  medium: z.string().min(1).optional(),
  high: z.string().min(1).optional(),
  xhigh: z.string().min(1).optional(),
  max: z.string().min(1).optional(),
});

export const OmpThinkingConfigSchema = z.strictObject({
  mode: OmpThinkingModeSchema,
  efforts: z.array(OmpThinkingEffortSchema),
  defaultLevel: OmpThinkingEffortSchema.optional(),
  effortMap: OmpThinkingEffortMapSchema.optional(),
  supportsDisplay: z.boolean().optional(),
  requiresEffort: z.boolean().optional(),
});
export type OmpThinkingConfig = z.infer<typeof OmpThinkingConfigSchema>;

export const OmpModelCostSchema = z.strictObject({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
  cacheWrite: z.number().nonnegative(),
});
export type OmpModelCost = z.infer<typeof OmpModelCostSchema>;

export const OmpModelCostOverrideSchema = z.strictObject({
  input: z.number().nonnegative().optional(),
  output: z.number().nonnegative().optional(),
  cacheRead: z.number().nonnegative().optional(),
  cacheWrite: z.number().nonnegative().optional(),
});
export type OmpModelCostOverride = z.infer<typeof OmpModelCostOverrideSchema>;

export const OmpPromptCacheSchema = z.strictObject({
  short: z.number().nonnegative().optional(),
  long: z.number().nonnegative().optional(),
});
export type OmpPromptCache = z.infer<typeof OmpPromptCacheSchema>;

export const OmpRemoteCompactionSchema = z.strictObject({
  enabled: z.boolean().optional(),
  api: z.string().min(1).optional(),
  endpoint: PublicEndpointSchema.optional(),
  model: z.string().min(1).optional(),
  v2StreamingEnabled: z.boolean().optional(),
  v2Endpoint: PublicEndpointSchema.optional(),
  streamingEndpoint: PublicEndpointSchema.optional(),
});
export type OmpRemoteCompaction = z.infer<typeof OmpRemoteCompactionSchema>;

export const OmpProviderDiscoverySchema = z.strictObject({
  type: OmpDiscoveryTypeSchema,
  timeoutMs: z.number().positive().optional(),
  injectV1: z.boolean().optional(),
  advertisedReasoning: z.boolean().optional(),
}).superRefine((value, context) => {
  if (value.injectV1 !== undefined && value.type !== 'openai-models-list') {
    context.addIssue({
      code: 'custom',
      path: ['injectV1'],
      message: 'injectV1 is only valid for openai-models-list discovery',
    });
  }
  if (
    value.advertisedReasoning !== undefined
    && value.type !== 'openai-models-list'
    && value.type !== 'lm-studio'
    && value.type !== 'proxy'
  ) {
    context.addIssue({
      code: 'custom',
      path: ['advertisedReasoning'],
      message: 'advertisedReasoning is only valid for openai-models-list, lm-studio, or proxy discovery',
    });
  }
});
export type OmpProviderDiscovery = z.infer<typeof OmpProviderDiscoverySchema>;

export const OmpConfigApiKeyStatusSchema = z.union([
  z.strictObject({ configured: z.literal(false) }),
  z.strictObject({ configured: z.literal(true), source: z.literal('env'), envVar: z.string().min(1) }),
  z.strictObject({ configured: z.literal(true), source: z.literal('command') }),
  z.strictObject({ configured: z.literal(true), source: z.literal('literal') }),
]);
export type OmpConfigApiKeyStatus = z.infer<typeof OmpConfigApiKeyStatusSchema>;

const ModelCommonFields = {
  name: z.string().min(1).optional(),
  api: OmpModelApiSchema.optional(),
  kind: OmpModelKindSchema.optional(),
  reasoning: z.boolean().optional(),
  thinking: OmpThinkingConfigSchema.optional(),
  input: z.array(z.enum(['text', 'image'])).min(1).optional(),
  imageInputDecoder: z.literal('stb').optional(),
  imageCountBudget: z.number().int().positive().optional(),
  tokenizer: OmpModelTokenizerSchema.optional(),
  supportsTools: z.boolean().optional(),
  promptCache: OmpPromptCacheSchema.optional(),
  premiumMultiplier: z.number().nonnegative().optional(),
  contextWindow: z.number().int().positive().optional(),
  maxContextWindow: z.number().int().positive().optional(),
  maxTokens: z.number().int().positive().optional(),
  omitMaxOutputTokens: z.boolean().optional(),
  preferWebsockets: z.boolean().optional(),
  compat: JsonObjectSchema.optional(),
  contextPromotionTarget: z.string().min(1).optional(),
  compactionModel: z.string().min(1).optional(),
  remoteCompaction: OmpRemoteCompactionSchema.optional(),
};

function validContextBounds(value: { contextWindow?: number; maxContextWindow?: number }): boolean {
  return value.contextWindow === undefined || value.maxContextWindow === undefined || value.maxContextWindow >= value.contextWindow;
}

const CONTEXT_BOUNDS_MESSAGE = 'maxContextWindow cannot be smaller than contextWindow';

export const OmpModelDefinitionReadSchema = z.strictObject({
  id: EntityIdSchema,
  baseUrl: PublicEndpointSchema.optional(),
  cost: OmpModelCostSchema.optional(),
  headerNames: z.array(z.string().min(1)).default([]),
  ...ModelCommonFields,
}).refine(validContextBounds, { path: ['maxContextWindow'], message: CONTEXT_BOUNDS_MESSAGE });
export type OmpModelDefinitionRead = z.infer<typeof OmpModelDefinitionReadSchema>;

export const OmpModelDefinitionWriteSchema = z.strictObject({
  id: EntityIdSchema,
  baseUrl: PublicEndpointSchema.optional(),
  cost: OmpModelCostSchema.optional(),
  headers: ProviderHeaderWriteSchema.optional(),
  headersPatch: OmpHeadersPatchSchema.optional(),
  ...ModelCommonFields,
}).refine(validContextBounds, { path: ['maxContextWindow'], message: CONTEXT_BOUNDS_MESSAGE });
export type OmpModelDefinitionWrite = z.infer<typeof OmpModelDefinitionWriteSchema>;

export const OmpModelOverrideReadSchema = z.strictObject({
  cost: OmpModelCostOverrideSchema.optional(),
  headerNames: z.array(z.string().min(1)).default([]),
  ...ModelCommonFields,
}).refine(validContextBounds, { path: ['maxContextWindow'], message: CONTEXT_BOUNDS_MESSAGE });
export type OmpModelOverrideRead = z.infer<typeof OmpModelOverrideReadSchema>;

export const OmpModelOverrideWriteSchema = z.strictObject({
  cost: OmpModelCostOverrideSchema.optional(),
  headers: ProviderHeaderWriteSchema.optional(),
  headersPatch: OmpHeadersPatchSchema.optional(),
  ...ModelCommonFields,
}).refine(validContextBounds, { path: ['maxContextWindow'], message: CONTEXT_BOUNDS_MESSAGE });
export type OmpModelOverrideWrite = z.infer<typeof OmpModelOverrideWriteSchema>;

export const OmpProviderConfigReadSchema = z.strictObject({
  providerId: EntityIdSchema,
  name: z.string().min(1).optional(),
  isBuiltIn: z.boolean(),
  hasNativeEntry: z.boolean(),
  effectiveBaseUrl: PublicEndpointSchema.optional(),
  effectiveApi: z.string().min(1).optional(),
  baseUrl: PublicEndpointSchema.optional(),
  api: OmpProviderApiSchema.optional(),
  auth: OmpProviderAuthModeSchema.optional(),
  authHeader: z.boolean().optional(),
  configApiKey: OmpConfigApiKeyStatusSchema,
  headerNames: z.array(z.string().min(1)),
  discovery: OmpProviderDiscoverySchema.optional(),
  compat: JsonObjectSchema.optional(),
  disableStrictTools: z.boolean().optional(),
  remoteCompaction: OmpRemoteCompactionSchema.optional(),
  guardrailIdentifier: z.string().min(1).optional(),
  guardrailVersion: z.string().min(1).optional(),
  guardrailTrace: OmpBedrockGuardrailTraceSchema.optional(),
  requestMetadata: z.record(z.string().min(1), z.string()).optional(),
  transport: z.literal('pi-native').optional(),
  models: z.array(OmpModelDefinitionReadSchema),
  modelOverrides: z.record(z.string().min(1), OmpModelOverrideReadSchema),
});
export type OmpProviderConfigRead = z.infer<typeof OmpProviderConfigReadSchema>;

export const OmpProviderConfigWriteSchema = z.strictObject({
  providerId: EntityIdSchema,
  name: z.string().min(1).optional(),
  baseUrl: PublicEndpointSchema.nullable().optional(),
  api: OmpProviderApiSchema.nullable().optional(),
  auth: OmpProviderAuthModeSchema.nullable().optional(),
  authHeader: z.boolean().nullable().optional(),
  configApiKey: z.string().min(1).nullable().optional(),
  headers: ProviderHeaderWriteSchema.optional(),
  headersPatch: OmpHeadersPatchSchema.optional(),
  discovery: OmpProviderDiscoverySchema.nullable().optional(),
  compat: JsonObjectSchema.nullable().optional(),
  disableStrictTools: z.boolean().nullable().optional(),
  remoteCompaction: OmpRemoteCompactionSchema.nullable().optional(),
  guardrailIdentifier: z.string().min(1).nullable().optional(),
  guardrailVersion: z.string().min(1).nullable().optional(),
  guardrailTrace: OmpBedrockGuardrailTraceSchema.nullable().optional(),
  requestMetadata: z.record(z.string().min(1), z.string()).nullable().optional(),
  transport: z.literal('pi-native').nullable().optional(),
  models: z.array(OmpModelDefinitionWriteSchema).optional(),
  modelOverrides: z.record(z.string().min(1), OmpModelOverrideWriteSchema).optional(),
}).refine(
  (value) => value.models === undefined || new Set(value.models.map(model => model.id)).size === value.models.length,
  'Provider models must have unique model ids',
);
export type OmpProviderConfigWrite = z.infer<typeof OmpProviderConfigWriteSchema>;
