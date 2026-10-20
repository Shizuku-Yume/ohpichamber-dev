import { z } from 'zod';
import { CounterSchema, EntityIdSchema, JsonObjectSchema, PositiveCounterSchema, TimestampSchema } from './primitives.ts';
import { AgentSchema } from './session.ts';

const PublicEndpointSchema = z.url({ protocol: /^https?$/ }).refine((endpoint) => {
  const url = new URL(endpoint);
  return url.username === '' && url.password === '' && url.search === '' && url.hash === '';
}, 'Public endpoints contain no embedded credentials, query parameters or fragments');
const RelativeCommandSchema = z.string().min(1).refine(
  (command) => !command.startsWith('/') && !command.startsWith('\\\\') && !/^[A-Za-z]:[\\/]/.test(command),
  'Public command references are not absolute Host paths',
);

function counterAtMost(value: string, ceiling: string) {
  return value.length < ceiling.length || (value.length === ceiling.length && value <= ceiling);
}

export const ModelSelectionSchema = z.strictObject({
  providerId: EntityIdSchema,
  modelId: EntityIdSchema,
});
export type ModelSelection = z.infer<typeof ModelSelectionSchema>;

export const ModelReasoningOptionSchema = z.strictObject({
  reasoningEffort: z.string().min(1),
  label: z.string().min(1),
  budgetTokens: z.number().int().nonnegative().nullable(),
});
export type ModelReasoningOption = z.infer<typeof ModelReasoningOptionSchema>;

export const ModelVariantSchema = z.strictObject({
  variant: z.string().min(1),
  label: z.string().min(1),
  reasoningEffort: z.string().min(1).nullable(),
});
export type ModelVariant = z.infer<typeof ModelVariantSchema>;

export const ModelSchema = z.strictObject({
  modelId: EntityIdSchema,
  provider: EntityIdSchema,
  name: z.string().min(1),
  modalities: z.array(z.enum(['text', 'image', 'audio', 'embedding'])).min(1),
  contextWindow: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
  reasoningEffortSupported: z.boolean(),
  reasoningOptions: z.array(ModelReasoningOptionSchema),
  variants: z.array(ModelVariantSchema),
  toolsSupported: z.boolean().optional(),
  enabled: z.boolean().optional(),
  status: z.enum(['active', 'alpha', 'beta', 'deprecated']).optional(),
  pricing: z.strictObject({
    inputPerMillionTokens: z.number().nonnegative(),
    outputPerMillionTokens: z.number().nonnegative(),
    cacheReadPerMillionTokens: z.number().nonnegative().nullable(),
    cacheWritePerMillionTokens: z.number().nonnegative().nullable(),
  }).nullable(),
}).superRefine((model, context) => {
  if (model.maxOutputTokens > model.contextWindow) {
    context.addIssue({ code: 'custom', path: ['maxOutputTokens'], message: 'Output limit exceeds the context window' });
  }
  const efforts = new Set(model.reasoningOptions.map((option) => option.reasoningEffort));
  if (efforts.size !== model.reasoningOptions.length || new Set(model.variants.map((variant) => variant.variant)).size !== model.variants.length) {
    context.addIssue({ code: 'custom', message: 'Model reasoning options and variants have unique identities' });
  }
  if (!model.reasoningEffortSupported && (model.reasoningOptions.length > 0 || model.variants.some((variant) => variant.reasoningEffort !== null))) {
    context.addIssue({ code: 'custom', message: 'Non-reasoning models do not advertise reasoning selections' });
  }
  if (model.variants.some((variant) => variant.reasoningEffort !== null && !efforts.has(variant.reasoningEffort))) {
    context.addIssue({ code: 'custom', path: ['variants'], message: 'Variant reasoning selections are advertised options' });
  }
});
export type Model = z.infer<typeof ModelSchema>;

export const ProviderAuthStateSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('missing') }),
  z.strictObject({
    status: z.literal('configured'),
    credentialRef: EntityIdSchema,
    method: z.enum(['api-key', 'oauth']),
    source: z.enum(['stored-credential', 'managed-environment', 'external-environment']),
  }),
]);
export type ProviderAuthState = z.infer<typeof ProviderAuthStateSchema>;

export const ProviderSchema = z.strictObject({
  providerId: EntityIdSchema,
  name: z.string().min(1),
  endpoint: PublicEndpointSchema.nullable(),
  protocol: z.enum(['chat-completions', 'responses', 'messages', 'generate-content']).nullable(),
  authMethods: z.array(z.enum(['api-key', 'oauth'])),
  auth: ProviderAuthStateSchema,
}).refine(
  (provider) => provider.auth.status === 'missing' || provider.authMethods.includes(provider.auth.method),
  'Configured authentication is supported by this provider',
);
export type Provider = z.infer<typeof ProviderSchema>;

export const ModelCatalogSchema = z.strictObject({
  workspaceId: EntityIdSchema,
  revision: CounterSchema,
  models: z.array(ModelSchema).refine(
    (models) => new Set(models.map((model) => JSON.stringify([model.provider, model.modelId]))).size === models.length,
    'Model identities are unique within a provider',
  ),
});
export type ModelCatalog = z.infer<typeof ModelCatalogSchema>;

export const ProviderCatalogSchema = z.strictObject({
  workspaceId: EntityIdSchema,
  revision: CounterSchema,
  providers: z.array(ProviderSchema).refine(
    (providers) => new Set(providers.map((provider) => provider.providerId)).size === providers.length,
    'Provider identities are unique',
  ),
});
export type ProviderCatalog = z.infer<typeof ProviderCatalogSchema>;

export const AgentCatalogSchema = z.strictObject({
  workspaceId: EntityIdSchema,
  revision: CounterSchema,
  agents: z.array(AgentSchema).refine(
    (agents) => new Set(agents.map((agent) => agent.agentId)).size === agents.length,
    'Agent identities are unique',
  ),
});
export type AgentCatalog = z.infer<typeof AgentCatalogSchema>;

export const ProviderConfigurationSchema = z.strictObject({
  providerId: EntityIdSchema,
  name: z.string().min(1),
  endpoint: PublicEndpointSchema,
  protocol: z.enum(['chat-completions', 'responses', 'messages', 'generate-content']),
  credentialRef: EntityIdSchema.nullable(),
});
export type ProviderConfiguration = z.infer<typeof ProviderConfigurationSchema>;

export const ProviderConfigureRequestSchema = z.strictObject({
  expectedRevision: CounterSchema,
  configuration: ProviderConfigurationSchema,
  headers: z.record(z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/), z.string().regex(/^[^\r\n]*$/)).optional(),
  models: z.array(ModelSchema).optional(),
}).refine(request => request.models === undefined || (request.models.every(model => model.provider === request.configuration.providerId)
  && new Set(request.models.map(model => model.modelId)).size === request.models.length), 'Provider models have unique matching identities');
export type ProviderConfigureRequest = z.infer<typeof ProviderConfigureRequestSchema>;

export const ProviderDeleteRequestSchema = z.strictObject({
  expectedRevision: CounterSchema,
  providerId: EntityIdSchema,
});
export type ProviderDeleteRequest = z.infer<typeof ProviderDeleteRequestSchema>;

export const ModelConfigureRequestSchema = z.strictObject({
  expectedRevision: CounterSchema,
  model: ModelSchema,
});
export type ModelConfigureRequest = z.infer<typeof ModelConfigureRequestSchema>;

export const ModelDeleteRequestSchema = z.strictObject({
  expectedRevision: CounterSchema,
  selection: ModelSelectionSchema,
});
export type ModelDeleteRequest = z.infer<typeof ModelDeleteRequestSchema>;

// Secrets belong only in explicit authenticated writes, never in catalogs or results.
export const ProviderCredentialWriteRequestSchema = z.strictObject({
  expectedRevision: CounterSchema,
  providerId: EntityIdSchema,
  credential: z.discriminatedUnion('method', [
    z.strictObject({ method: z.literal('api-key'), apiKey: z.string().min(1) }),
    z.strictObject({
      method: z.literal('oauth'),
      accessToken: z.string().min(1),
      refreshToken: z.string().min(1),
      expiresAt: TimestampSchema,
    }),
  ]),
});
export type ProviderCredentialWriteRequest = z.infer<typeof ProviderCredentialWriteRequestSchema>;

export const ProviderCredentialDeleteRequestSchema = z.strictObject({
  expectedRevision: CounterSchema,
  providerId: EntityIdSchema,
  credentialRef: EntityIdSchema,
});
export type ProviderCredentialDeleteRequest = z.infer<typeof ProviderCredentialDeleteRequestSchema>;

export const ProviderMutationResultSchema = z.strictObject({
  revision: PositiveCounterSchema,
  providerId: EntityIdSchema,
  provider: ProviderSchema.nullable(),
}).refine(
  (result) => result.provider === null || result.provider.providerId === result.providerId,
  'Provider mutation result identifies the committed provider',
);
export type ProviderMutationResult = z.infer<typeof ProviderMutationResultSchema>;

export const ModelMutationResultSchema = z.strictObject({
  revision: PositiveCounterSchema,
  selection: ModelSelectionSchema,
  model: ModelSchema.nullable(),
}).refine(
  (result) => result.model === null || (result.model.modelId === result.selection.modelId && result.model.provider === result.selection.providerId),
  'Model mutation result identifies the committed model selection',
);
export type ModelMutationResult = z.infer<typeof ModelMutationResultSchema>;

export const ProviderCredentialMutationResultSchema = z.strictObject({
  revision: PositiveCounterSchema,
  providerId: EntityIdSchema,
  auth: ProviderAuthStateSchema,
});
export type ProviderCredentialMutationResult = z.infer<typeof ProviderCredentialMutationResultSchema>;

export const MCPTransportSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('stdio'),
    command: RelativeCommandSchema,
    args: z.array(z.string()),
    envCredentialRefs: z.record(z.string().min(1), EntityIdSchema).optional(),
  }),
  z.strictObject({ type: z.literal('http'), url: PublicEndpointSchema, credentialRef: EntityIdSchema.optional(), headerCredentialRefs: z.record(z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/), EntityIdSchema).optional() }),
  z.strictObject({ type: z.literal('sse'), url: PublicEndpointSchema, credentialRef: EntityIdSchema.optional(), headerCredentialRefs: z.record(z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/), EntityIdSchema).optional() }),
]);
export type MCPTransport = z.infer<typeof MCPTransportSchema>;

export const MCPServerConfigSchema = z.strictObject({
  serverId: EntityIdSchema,
  label: z.string().min(1),
  enabled: z.boolean(),
  transport: MCPTransportSchema,
});
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;

export const MCPConfigSchema = z.strictObject({
  servers: z.array(MCPServerConfigSchema).refine(
    (servers) => new Set(servers.map((server) => server.serverId)).size === servers.length,
    'MCP server identities are unique',
  ),
});
export type MCPConfig = z.infer<typeof MCPConfigSchema>;

export const MCPToolSchema = z.strictObject({
  serverId: EntityIdSchema,
  toolId: EntityIdSchema,
  name: z.string().min(1),
  description: z.string(),
  inputSchema: JsonObjectSchema,
});
export type MCPTool = z.infer<typeof MCPToolSchema>;

export const CatalogWorkerIdentitySchema = z.strictObject({
  rootSessionId: EntityIdSchema,
  workspaceId: EntityIdSchema,
  workerGeneration: EntityIdSchema,
});
export type CatalogWorkerIdentity = z.infer<typeof CatalogWorkerIdentitySchema>;

export const MCPConfigurationStateSchema = z.strictObject({
  workspaceId: EntityIdSchema,
  persistedRevision: CounterSchema,
  config: MCPConfigSchema,
});
export type MCPConfigurationState = z.infer<typeof MCPConfigurationStateSchema>;

const MCPAppliedFields = {
  runtimeStatus: z.enum(['ready', 'unavailable']),
  appliedRevision: CounterSchema.nullable(),
  catalogRevision: CounterSchema,
};
function validMCPRevisions(revisions: { runtimeStatus: string; appliedRevision: string | null; catalogRevision: string }) {
  return revisions.appliedRevision === null
    ? revisions.runtimeStatus === 'unavailable' && revisions.catalogRevision === '0'
    : revisions.catalogRevision !== '0';
}
export const MCPAppliedRevisionsSchema = z.strictObject(MCPAppliedFields).refine(
  validMCPRevisions, 'Ready MCP runtimes have a published applied revision; first-apply failure is unavailable',
);
export type MCPAppliedRevisions = z.infer<typeof MCPAppliedRevisionsSchema>;

export const MCPCatalogStateSchema = z.strictObject({
  ...MCPAppliedFields,
  worker: CatalogWorkerIdentitySchema,
  activeServers: z.array(EntityIdSchema),
  tools: z.array(MCPToolSchema),
}).refine(validMCPRevisions, 'MCP runtime readiness matches its applied publication').superRefine((state, context) => {
  const active = new Set(state.activeServers);
  if (active.size !== state.activeServers.length || state.tools.some((tool) => !active.has(tool.serverId))) {
    context.addIssue({ code: 'custom', message: 'MCP tools belong to unique active servers' });
  }
  if (new Set(state.tools.map((tool) => JSON.stringify([tool.serverId, tool.toolId]))).size !== state.tools.length) {
    context.addIssue({ code: 'custom', path: ['tools'], message: 'MCP tool identities are unique within a server' });
  }
  if (state.appliedRevision === null && (state.tools.length > 0 || state.activeServers.length > 0)) {
    context.addIssue({ code: 'custom', message: 'A never-applied worker has no published MCP catalog' });
  }
});
export type MCPCatalogState = z.infer<typeof MCPCatalogStateSchema>;

export const MCPCatalogReadSchema = z.strictObject({
  configuration: MCPConfigurationStateSchema,
  workerCatalog: MCPCatalogStateSchema,
}).refine(
  (read) => read.configuration.workspaceId === read.workerCatalog.worker.workspaceId
    && (read.workerCatalog.appliedRevision === null || counterAtMost(read.workerCatalog.appliedRevision, read.configuration.persistedRevision)),
  'A worker catalog belongs to the workspace and cannot apply a future configuration revision',
);
export type MCPCatalogRead = z.infer<typeof MCPCatalogReadSchema>;

export const SkillSourceRevisionsSchema = z.strictObject({ workspace: CounterSchema, agent: CounterSchema });
export type SkillSourceRevisions = z.infer<typeof SkillSourceRevisionsSchema>;

export const SkillEntrySchema = z.strictObject({
  skillId: EntityIdSchema,
  name: z.string().min(1),
  description: z.string(),
  scope: z.enum(['workspace', 'agent']),
});
export type SkillEntry = z.infer<typeof SkillEntrySchema>;

const SkillsAppliedFields = {
  runtimeStatus: z.enum(['ready', 'unavailable']),
  persistedSources: SkillSourceRevisionsSchema,
  appliedSources: SkillSourceRevisionsSchema.nullable(),
  catalogRevision: CounterSchema,
};
function validSkillRevisions(revisions: {
  runtimeStatus: string;
  persistedSources: SkillSourceRevisions;
  appliedSources: SkillSourceRevisions | null;
  catalogRevision: string;
}) {
  return revisions.appliedSources === null
    ? revisions.runtimeStatus === 'unavailable' && revisions.catalogRevision === '0'
    : revisions.catalogRevision !== '0'
      && counterAtMost(revisions.appliedSources.workspace, revisions.persistedSources.workspace)
      && counterAtMost(revisions.appliedSources.agent, revisions.persistedSources.agent);
}
export const SkillsAppliedRevisionsSchema = z.strictObject(SkillsAppliedFields).refine(
  validSkillRevisions, 'Applied skill sources are published captured revisions, not future or empty-success sources',
);
export type SkillsAppliedRevisions = z.infer<typeof SkillsAppliedRevisionsSchema>;

export const SkillsCatalogStateSchema = z.strictObject({
  ...SkillsAppliedFields,
  worker: CatalogWorkerIdentitySchema,
  agentDirectoryId: EntityIdSchema,
  skills: z.array(SkillEntrySchema),
}).refine(validSkillRevisions, 'Skill runtime readiness matches its source publication').refine(
  (state) => (state.appliedSources !== null || state.skills.length === 0)
    && new Set(state.skills.map((skill) => skill.skillId)).size === state.skills.length,
  'Only applied skill catalogs contain unique published skills',
);
export type SkillsCatalogState = z.infer<typeof SkillsCatalogStateSchema>;

export const CatalogUpdateSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('mcp'), state: MCPCatalogStateSchema }),
  z.strictObject({ kind: z.literal('skills'), state: SkillsCatalogStateSchema }),
]);
export type CatalogUpdate = z.infer<typeof CatalogUpdateSchema>;

export const CatalogOperationErrorSchema = z.strictObject({
  code: z.string().min(1), detail: z.string().min(1), retryable: z.boolean(),
});
export type CatalogOperationError = z.infer<typeof CatalogOperationErrorSchema>;

export const MCPWorkerApplyOutcomeSchema = z.discriminatedUnion('outcome', [
  z.strictObject({ worker: CatalogWorkerIdentitySchema, outcome: z.literal('applied'), revisions: MCPAppliedRevisionsSchema }).refine(
    (outcome) => outcome.revisions.runtimeStatus === 'ready', 'Applied workers have usable runtimes',
  ),
  z.strictObject({ worker: CatalogWorkerIdentitySchema, outcome: z.literal('failed'), revisions: MCPAppliedRevisionsSchema, error: CatalogOperationErrorSchema }),
  z.strictObject({ worker: CatalogWorkerIdentitySchema, outcome: z.literal('retired') }),
]);
export type MCPWorkerApplyOutcome = z.infer<typeof MCPWorkerApplyOutcomeSchema>;

export const SkillsWorkerApplyOutcomeSchema = z.discriminatedUnion('outcome', [
  z.strictObject({ worker: CatalogWorkerIdentitySchema, outcome: z.literal('applied'), revisions: SkillsAppliedRevisionsSchema }).refine(
    (outcome) => outcome.revisions.runtimeStatus === 'ready'
      && outcome.revisions.appliedSources !== null
      && outcome.revisions.appliedSources.workspace === outcome.revisions.persistedSources.workspace
      && outcome.revisions.appliedSources.agent === outcome.revisions.persistedSources.agent,
    'Applied workers published their complete captured source pair',
  ),
  z.strictObject({ worker: CatalogWorkerIdentitySchema, outcome: z.literal('failed'), revisions: SkillsAppliedRevisionsSchema, error: CatalogOperationErrorSchema }),
  z.strictObject({ worker: CatalogWorkerIdentitySchema, outcome: z.literal('retired') }),
]);
export type SkillsWorkerApplyOutcome = z.infer<typeof SkillsWorkerApplyOutcomeSchema>;

const ApplyStatusSchema = z.enum(['applied', 'partial', 'failed', 'no-active-workers']);
function validAggregate(result: {
  status: z.infer<typeof ApplyStatusSchema>;
  workers: Array<{ worker: CatalogWorkerIdentity; outcome: 'applied' | 'failed' | 'retired' }>;
}) {
  const applied = result.workers.filter((worker) => worker.outcome === 'applied').length;
  const failed = result.workers.filter((worker) => worker.outcome === 'failed').length;
  const status = applied > 0 ? (failed > 0 ? 'partial' : 'applied') : (failed > 0 ? 'failed' : 'no-active-workers');
  return result.status === status
    && new Set(result.workers.map(({ worker }) => JSON.stringify([worker.rootSessionId, worker.workerGeneration]))).size === result.workers.length;
}

export const MCPApplyResultSchema = z.strictObject({
  kind: z.literal('mcp'),
  status: ApplyStatusSchema,
  configuration: MCPConfigurationStateSchema,
  workers: z.array(MCPWorkerApplyOutcomeSchema),
}).refine(validAggregate, 'Aggregate status reflects every unique captured live worker outcome').refine(
  (result) => result.workers.every((outcome) => outcome.worker.workspaceId === result.configuration.workspaceId
    && (outcome.outcome === 'retired' || (outcome.revisions.appliedRevision === null
      || counterAtMost(outcome.revisions.appliedRevision, result.configuration.persistedRevision)))
    && (outcome.outcome !== 'applied' || outcome.revisions.appliedRevision === result.configuration.persistedRevision)),
  'Workspace apply outcomes retain their real applied revision under the committed configuration',
);
export type MCPApplyResult = z.infer<typeof MCPApplyResultSchema>;

export const SkillSourceScopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('workspace'), workspaceId: EntityIdSchema }),
  z.strictObject({ kind: z.literal('agent'), agentDirectoryId: EntityIdSchema }),
]);
export type SkillSourceScope = z.infer<typeof SkillSourceScopeSchema>;

export const SkillsApplyResultSchema = z.strictObject({
  kind: z.literal('skills'),
  status: ApplyStatusSchema,
  scope: SkillSourceScopeSchema,
  sourceRevision: CounterSchema,
  workers: z.array(SkillsWorkerApplyOutcomeSchema),
}).refine(validAggregate, 'Aggregate status reflects every unique captured live worker outcome').refine(
  (result) => result.workers.every((outcome) =>
    (result.scope.kind !== 'workspace' || outcome.worker.workspaceId === result.scope.workspaceId)
    && (outcome.outcome === 'retired' || outcome.revisions.persistedSources[result.scope.kind] === result.sourceRevision)),
  'Worker source pairs retain their own other source component and the selected committed revision',
);
export type SkillsApplyResult = z.infer<typeof SkillsApplyResultSchema>;

export const SkillInstallResultSchema = z.strictObject({
  scope: SkillSourceScopeSchema,
  sourceRevision: CounterSchema,
  persistence: z.literal('committed'),
  apply: SkillsApplyResultSchema.nullable(),
}).refine(
  (result) => result.apply === null || (result.sourceRevision === result.apply.sourceRevision
    && JSON.stringify(result.scope) === JSON.stringify(result.apply.scope)),
  'Installation source commit and subsequent apply refer to the same source and revision',
);
export type SkillInstallResult = z.infer<typeof SkillInstallResultSchema>;

export const MCPConfigureRequestSchema = z.strictObject({ expectedPersistedRevision: CounterSchema, config: MCPConfigSchema });
export type MCPConfigureRequest = z.infer<typeof MCPConfigureRequestSchema>;
export const MCPApplyRequestSchema = z.strictObject({ persistedRevision: CounterSchema });
export type MCPApplyRequest = z.infer<typeof MCPApplyRequestSchema>;
export const MCPReconnectRequestSchema = z.strictObject({
  persistedRevision: CounterSchema, expectedCatalogRevision: CounterSchema, workerGeneration: EntityIdSchema,
});
export type MCPReconnectRequest = z.infer<typeof MCPReconnectRequestSchema>;

export const MCPConnectionTestRequestSchema = MCPApplyRequestSchema;
export type MCPConnectionTestRequest = z.infer<typeof MCPConnectionTestRequestSchema>;
export const MCPConnectionTestResultSchema = z.discriminatedUnion('status', [
  z.strictObject({ workspaceId: EntityIdSchema, serverId: EntityIdSchema, persistedRevision: CounterSchema, status: z.literal('connected'), toolCount: z.number().int().nonnegative() }),
  z.strictObject({ workspaceId: EntityIdSchema, serverId: EntityIdSchema, persistedRevision: CounterSchema, status: z.literal('failed'), error: CatalogOperationErrorSchema }),
]);
export type MCPConnectionTestResult = z.infer<typeof MCPConnectionTestResultSchema>;
export const MCPWorkspaceReconnectRequestSchema = MCPApplyRequestSchema;
export type MCPWorkspaceReconnectRequest = z.infer<typeof MCPWorkspaceReconnectRequestSchema>;
export const MCPWorkspaceReconnectResultSchema = z.strictObject({
  workspaceId: EntityIdSchema, serverId: EntityIdSchema, persistedRevision: CounterSchema,
  status: ApplyStatusSchema, workers: z.array(MCPWorkerApplyOutcomeSchema), probe: MCPConnectionTestResultSchema.optional(),
}).refine(validAggregate, 'Reconnect status reflects every captured worker').refine(
  result => (result.status === 'no-active-workers') === (result.probe !== undefined)
    && (!result.probe || (result.probe.workspaceId === result.workspaceId && result.probe.serverId === result.serverId && result.probe.persistedRevision === result.persistedRevision))
    && result.workers.every(outcome => outcome.worker.workspaceId === result.workspaceId
      && (outcome.outcome === 'retired' || outcome.revisions.appliedRevision === null || counterAtMost(outcome.revisions.appliedRevision, result.persistedRevision))
      && (outcome.outcome !== 'applied' || outcome.revisions.appliedRevision === result.persistedRevision)),
  'A no-worker reconnect reports its separate probe, never a runtime apply',
);
export type MCPWorkspaceReconnectResult = z.infer<typeof MCPWorkspaceReconnectResultSchema>;
/** Secret material exists only in authenticated write input, never configuration or result. */
export const MCPSecretWriteRequestSchema = z.strictObject({ persistedRevision: CounterSchema, value: z.string().min(1) });
export type MCPSecretWriteRequest = z.infer<typeof MCPSecretWriteRequestSchema>;
export const MCPSecretWriteResultSchema = z.strictObject({ workspaceId: EntityIdSchema, serverId: EntityIdSchema, persistedRevision: CounterSchema, credentialRef: EntityIdSchema });
export type MCPSecretWriteResult = z.infer<typeof MCPSecretWriteResultSchema>;

const MCPOAuthUrlSchema = z.url({ protocol: /^https?$/ }).refine(endpoint => {
  const url = new URL(endpoint);
  return url.username === '' && url.password === '' && url.hash === '';
}, 'OAuth URLs contain no embedded credentials or fragments');

/** Public configuration used by Host authorization; token material never crosses this boundary. */
export const MCPOAuthPublicConfigurationSchema = z.strictObject({
  authorizationUrl: MCPOAuthUrlSchema.optional(),
  tokenUrl: MCPOAuthUrlSchema.optional(),
  issuerUrl: MCPOAuthUrlSchema.optional(),
  registrationUrl: MCPOAuthUrlSchema.optional(),
  resourceMetadataUrl: MCPOAuthUrlSchema.optional(),
  clientId: z.string().min(1).optional(),
  scopes: z.string().optional(),
  prompt: z.string().optional(),
  redirectUri: MCPOAuthUrlSchema.optional(),
  callbackPort: z.number().int().min(1).max(65_535).optional(),
  callbackPath: z.string().startsWith('/').optional(),
  resource: MCPOAuthUrlSchema.optional(),
  stripSameOriginResource: z.boolean().optional(),
});
export type MCPOAuthPublicConfiguration = z.infer<typeof MCPOAuthPublicConfigurationSchema>;

export const MCPOAuthConfigInputSchema = MCPOAuthPublicConfigurationSchema.extend({
  clientSecretRef: EntityIdSchema.optional(),
}).refine(input => (input.authorizationUrl === undefined) === (input.tokenUrl === undefined),
  'OAuth authorization and token endpoints are supplied together or discovered together');
export type MCPOAuthConfigInput = z.infer<typeof MCPOAuthConfigInputSchema>;

export const MCPOAuthPendingFlowSchema = z.strictObject({
  flowId: EntityIdSchema,
  authorizationUrl: MCPOAuthUrlSchema,
  launchUrl: MCPOAuthUrlSchema.optional(),
  instructions: z.string().optional(),
});
export type MCPOAuthPendingFlow = z.infer<typeof MCPOAuthPendingFlowSchema>;

const MCPOAuthOwnerFields = { persistedRevision: CounterSchema, workerGeneration: EntityIdSchema };
export const MCPOAuthRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('start'), ...MCPOAuthOwnerFields, oauth: MCPOAuthConfigInputSchema.optional() }),
  z.strictObject({ action: z.literal('complete'), ...MCPOAuthOwnerFields, flowId: EntityIdSchema, callbackInput: z.string().min(1).optional() }),
  z.strictObject({ action: z.literal('cancel'), ...MCPOAuthOwnerFields, flowId: EntityIdSchema }),
  z.strictObject({ action: z.literal('disconnect'), ...MCPOAuthOwnerFields }),
]);
export type MCPOAuthRequest = z.infer<typeof MCPOAuthRequestSchema>;

const MCPOAuthResultOwnerFields = {
  serverId: EntityIdSchema, worker: CatalogWorkerIdentitySchema, persistedRevision: CounterSchema,
};
export const MCPOAuthResultSchema = z.discriminatedUnion('status', [
  z.strictObject({ ...MCPOAuthResultOwnerFields, status: z.literal('pending'), authenticated: z.boolean(), pendingFlow: MCPOAuthPendingFlowSchema }),
  z.strictObject({ ...MCPOAuthResultOwnerFields, status: z.literal('authenticated'), authenticated: z.literal(true) }),
  z.strictObject({ ...MCPOAuthResultOwnerFields, status: z.literal('unauthenticated'), authenticated: z.literal(false) }),
]);
export type MCPOAuthResult = z.infer<typeof MCPOAuthResultSchema>;

export const SkillInstallRequestSchema = z.strictObject({
  sourceId: EntityIdSchema, skillId: EntityIdSchema, scope: z.enum(['workspace', 'agent']), expectedSourceRevision: CounterSchema,
});
export type SkillInstallRequest = z.infer<typeof SkillInstallRequestSchema>;
export const SkillsApplyRequestSchema = z.strictObject({ scope: z.enum(['workspace', 'agent']), sourceRevision: CounterSchema });
export type SkillsApplyRequest = z.infer<typeof SkillsApplyRequestSchema>;
export const SkillExpandRequestSchema = z.strictObject({
  skillId: EntityIdSchema, catalogRevision: CounterSchema, workerGeneration: EntityIdSchema, arguments: z.string(),
});
export type SkillExpandRequest = z.infer<typeof SkillExpandRequestSchema>;
export const SkillExpandResultSchema = z.strictObject({
  worker: CatalogWorkerIdentitySchema, skillId: EntityIdSchema, catalogRevision: CounterSchema, message: z.string().min(1),
});
export type SkillExpandResult = z.infer<typeof SkillExpandResultSchema>;
