import { describe, expect, test } from 'bun:test';
import * as Catalog from './catalogs.ts';

const selection = { providerId: 'provider_1', modelId: 'model_1' };
const reasoningOption = { reasoningEffort: 'medium', label: 'Medium', budgetTokens: 2048 };
const variant = { variant: 'careful', label: 'Careful', reasoningEffort: 'medium' };
const model = {
  modelId: 'model_1', provider: 'provider_1', name: 'Model', modalities: ['text', 'image'],
  contextWindow: 8192, maxOutputTokens: 1024, reasoningEffortSupported: true,
  reasoningOptions: [reasoningOption], variants: [variant],
  pricing: { inputPerMillionTokens: 1, outputPerMillionTokens: 2, cacheReadPerMillionTokens: null, cacheWritePerMillionTokens: null },
};
const auth = { status: 'configured', credentialRef: 'credential_1', method: 'api-key', source: 'stored-credential' };
const provider = { providerId: 'provider_1', name: 'Provider', endpoint: 'https://models.example/v1', protocol: 'chat-completions', authMethods: ['api-key'], auth };
const agent = { agentId: 'agent_1', name: 'Reviewer', description: 'Reviews changes', model: selection, allowedTools: ['read'] };
const providerConfiguration = { providerId: 'provider_1', name: 'Provider', endpoint: provider.endpoint, protocol: 'chat-completions', credentialRef: 'credential_1' };
const transport = { type: 'stdio', command: 'mcp-tool', args: ['--mode', 'read'], envCredentialRefs: { API_KEY: 'credential_1' } };
const server = { serverId: 'server_1', label: 'Workspace tools', enabled: true, transport };
const config = { servers: [server] };
const tool = { serverId: 'server_1', toolId: 'tool_1', name: 'search', description: 'Search workspace', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } };
const worker = { rootSessionId: 'root_a', workspaceId: 'workspace_1', workerGeneration: 'generation_a1' };
const sibling = { rootSessionId: 'root_b', workspaceId: 'workspace_1', workerGeneration: 'generation_b1' };
const configuration = { workspaceId: 'workspace_1', persistedRevision: '2', config };
const mcpRevisions = { runtimeStatus: 'ready', appliedRevision: '2', catalogRevision: '5' };
const oldMcpRevisions = { runtimeStatus: 'ready', appliedRevision: '1', catalogRevision: '4' };
const emptyMcpRevisions = { runtimeStatus: 'unavailable', appliedRevision: null, catalogRevision: '0' };
const mcpState = { ...mcpRevisions, worker, activeServers: ['server_1'], tools: [tool] };
const mcpRead = { configuration, workerCatalog: mcpState };
const error = { code: 'MCP_APPLY_FAILED', detail: 'Runtime application failed.', retryable: true };
const mcpApplied = { worker, outcome: 'applied', revisions: mcpRevisions };
const mcpFailed = { worker: sibling, outcome: 'failed', revisions: oldMcpRevisions, error };
const retired = { worker: sibling, outcome: 'retired' };
const mcpResult = { kind: 'mcp', status: 'partial', configuration, workers: [mcpApplied, mcpFailed] };
const sources = { workspace: '2', agent: '3' };
const skill = { skillId: 'skill_1', name: 'Review', description: 'Review workflow', scope: 'workspace' };
const skillRevisions = { runtimeStatus: 'ready', persistedSources: sources, appliedSources: sources, catalogRevision: '7' };
const oldSkillRevisions = { ...skillRevisions, appliedSources: { workspace: '1', agent: '3' }, catalogRevision: '6' };
const emptySkillRevisions = { runtimeStatus: 'unavailable', persistedSources: sources, appliedSources: null, catalogRevision: '0' };
const skillState = { ...skillRevisions, worker, agentDirectoryId: 'agent_directory_1', skills: [skill] };
const skillApplied = { worker, outcome: 'applied', revisions: skillRevisions };
const skillFailed = { worker: sibling, outcome: 'failed', revisions: oldSkillRevisions, error: { ...error, code: 'SKILL_APPLY_FAILED' } };
const scope = { kind: 'workspace', workspaceId: 'workspace_1' };
const skillResult = { kind: 'skills', status: 'partial', scope, sourceRevision: '2', workers: [skillApplied, skillFailed] };
const install = { scope, sourceRevision: '2', persistence: 'committed', apply: skillResult };
const oauthConfiguration = { authorizationUrl: 'https://auth.example/authorize?audience=mcp', tokenUrl: 'https://auth.example/token', clientId: 'client_1', scopes: 'mcp:tools' };
const oauthFlow = { flowId: 'flow_1', authorizationUrl: 'https://auth.example/authorize?state=opaque&code_challenge=challenge' };
const oauthOwner = { persistedRevision: '2', workerGeneration: 'generation_a1' };
const oauthPending = { serverId: 'server_1', worker, persistedRevision: '2', status: 'pending', authenticated: false, pendingFlow: oauthFlow };

const boundaries = [
  { name: 'ModelSelection', schema: Catalog.ModelSelectionSchema, valid: selection, invalid: [{ providerId: 'provider_1' }, { ...selection, modelId: '' }] },
  { name: 'ModelReasoningOption', schema: Catalog.ModelReasoningOptionSchema, valid: reasoningOption, invalid: [{ ...reasoningOption, budgetTokens: -1 }, { ...reasoningOption, reasoningEffort: '' }] },
  { name: 'ModelVariant', schema: Catalog.ModelVariantSchema, valid: variant, invalid: [{ ...variant, variant: '' }, { ...variant, reasoningEffort: undefined }] },
  { name: 'Model', schema: Catalog.ModelSchema, valid: model, invalid: [{ ...model, maxOutputTokens: 8193 }, { ...model, reasoningEffortSupported: false }, { ...model, variants: [{ ...variant, reasoningEffort: 'unadvertised' }] }] },
  { name: 'ProviderAuthState', schema: Catalog.ProviderAuthStateSchema, valid: auth, invalid: [{ ...auth, apiKey: 'secret' }, { status: 'configured', method: 'api-key' }] },
  { name: 'Provider', schema: Catalog.ProviderSchema, valid: provider, invalid: [{ ...provider, endpoint: 'https://user:secret@models.example/v1' }, { ...provider, authMethods: ['oauth'] }, { ...provider, endpoint: 'https://models.example/v1?api_key=secret' }] },
  { name: 'ModelCatalog', schema: Catalog.ModelCatalogSchema, valid: { workspaceId: 'workspace_1', revision: '1', models: [model] }, invalid: [{ workspaceId: 'workspace_1', revision: '1', models: [model, model] }] },
  { name: 'ProviderCatalog', schema: Catalog.ProviderCatalogSchema, valid: { workspaceId: 'workspace_1', revision: '1', providers: [provider] }, invalid: [{ workspaceId: 'workspace_1', revision: '1', providers: [provider, provider] }] },
  { name: 'AgentCatalog', schema: Catalog.AgentCatalogSchema, valid: { workspaceId: 'workspace_1', revision: '1', agents: [agent] }, invalid: [{ workspaceId: 'workspace_1', revision: '1', agents: [agent, agent] }] },
  { name: 'ProviderConfiguration', schema: Catalog.ProviderConfigurationSchema, valid: providerConfiguration, invalid: [{ ...providerConfiguration, endpoint: 'file:///private/provider' }, { ...providerConfiguration, apiKey: 'secret' }] },
  { name: 'ProviderConfigureRequest', schema: Catalog.ProviderConfigureRequestSchema, valid: { expectedRevision: '1', configuration: providerConfiguration }, invalid: [{ expectedRevision: 1, configuration: providerConfiguration }] },
  { name: 'ProviderDeleteRequest', schema: Catalog.ProviderDeleteRequestSchema, valid: { expectedRevision: '1', providerId: 'provider_1' }, invalid: [{ expectedRevision: '01', providerId: 'provider_1' }] },
  { name: 'ModelConfigureRequest', schema: Catalog.ModelConfigureRequestSchema, valid: { expectedRevision: '1', model }, invalid: [{ expectedRevision: '1', model: { ...model, contextWindow: 0 } }] },
  { name: 'ModelDeleteRequest', schema: Catalog.ModelDeleteRequestSchema, valid: { expectedRevision: '1', selection }, invalid: [{ expectedRevision: '1', selection: { modelId: 'model_1' } }] },
  { name: 'ProviderCredentialWriteRequest', schema: Catalog.ProviderCredentialWriteRequestSchema, valid: { expectedRevision: '1', providerId: 'provider_1', credential: { method: 'api-key', apiKey: 'intentional-secret-write' } }, invalid: [{ expectedRevision: '1', providerId: 'provider_1', credential: { method: 'api-key', apiKey: '' } }, { expectedRevision: '1', providerId: 'provider_1', credential: { method: 'oauth', accessToken: 'token', refreshToken: 'refresh' } }] },
  { name: 'ProviderCredentialDeleteRequest', schema: Catalog.ProviderCredentialDeleteRequestSchema, valid: { expectedRevision: '1', providerId: 'provider_1', credentialRef: 'credential_1' }, invalid: [{ expectedRevision: '1', providerId: 'provider_1', credentialRef: '' }] },
  { name: 'ProviderMutationResult', schema: Catalog.ProviderMutationResultSchema, valid: { revision: '2', providerId: 'provider_1', provider }, invalid: [{ revision: '2', providerId: 'other_provider', provider }, { revision: '0', providerId: 'provider_1', provider: null }] },
  { name: 'ModelMutationResult', schema: Catalog.ModelMutationResultSchema, valid: { revision: '2', selection, model }, invalid: [{ revision: '2', selection: { ...selection, providerId: 'other_provider' }, model }] },
  { name: 'ProviderCredentialMutationResult', schema: Catalog.ProviderCredentialMutationResultSchema, valid: { revision: '2', providerId: 'provider_1', auth }, invalid: [{ revision: '2', providerId: 'provider_1', auth: { ...auth, accessToken: 'secret' } }] },
  { name: 'MCPTransport', schema: Catalog.MCPTransportSchema, valid: transport, invalid: [{ ...transport, command: '/private/host/bin/mcp' }, { type: 'http', url: 'https://user:secret@mcp.example' }, { ...transport, env: { API_KEY: 'secret' } }] },
  { name: 'MCPServerConfig', schema: Catalog.MCPServerConfigSchema, valid: server, invalid: [{ ...server, enabled: 'true' }, { ...server, serverId: '' }] },
  { name: 'MCPConfig', schema: Catalog.MCPConfigSchema, valid: config, invalid: [{ servers: [server, server] }] },
  { name: 'MCPTool', schema: Catalog.MCPToolSchema, valid: tool, invalid: [{ ...tool, inputSchema: { invalid: undefined } }, { ...tool, inputSchema: { invalid: Infinity } }] },
  { name: 'CatalogWorkerIdentity', schema: Catalog.CatalogWorkerIdentitySchema, valid: worker, invalid: [{ ...worker, workerGeneration: '' }, { ...worker, directory: '/private/workspace' }] },
  { name: 'MCPConfigurationState', schema: Catalog.MCPConfigurationStateSchema, valid: configuration, invalid: [{ ...configuration, persistedRevision: '-1' }] },
  { name: 'MCPAppliedRevisions', schema: Catalog.MCPAppliedRevisionsSchema, valid: mcpRevisions, invalid: [{ ...emptyMcpRevisions, runtimeStatus: 'ready' }, { ...mcpRevisions, catalogRevision: '0' }] },
  { name: 'MCPCatalogState', schema: Catalog.MCPCatalogStateSchema, valid: mcpState, invalid: [{ ...mcpState, activeServers: [] }, { ...mcpState, tools: [tool, tool] }, { ...mcpState, ...emptyMcpRevisions }] },
  { name: 'MCPCatalogRead', schema: Catalog.MCPCatalogReadSchema, valid: mcpRead, invalid: [{ ...mcpRead, configuration: { ...configuration, workspaceId: 'foreign_workspace' } }, { ...mcpRead, configuration: { ...configuration, persistedRevision: '1' } }] },
  { name: 'SkillSourceRevisions', schema: Catalog.SkillSourceRevisionsSchema, valid: sources, invalid: [{ workspace: '2' }, { ...sources, agent: '18446744073709551616' }] },
  { name: 'SkillEntry', schema: Catalog.SkillEntrySchema, valid: skill, invalid: [{ ...skill, scope: 'global' }, { ...skill, skillId: '' }] },
  { name: 'SkillsAppliedRevisions', schema: Catalog.SkillsAppliedRevisionsSchema, valid: skillRevisions, invalid: [{ ...emptySkillRevisions, runtimeStatus: 'ready' }, { ...skillRevisions, appliedSources: { workspace: '3', agent: '3' } }] },
  { name: 'SkillsCatalogState', schema: Catalog.SkillsCatalogStateSchema, valid: skillState, invalid: [{ ...skillState, skills: [skill, skill] }, { ...skillState, ...emptySkillRevisions }] },
  { name: 'CatalogUpdate', schema: Catalog.CatalogUpdateSchema, valid: { kind: 'mcp', state: mcpState }, invalid: [{ kind: 'skills', state: mcpState }, { kind: 'mcp', state: skillState }] },
  { name: 'CatalogOperationError', schema: Catalog.CatalogOperationErrorSchema, valid: error, invalid: [{ ...error, detail: '' }, { ...error, rawException: 'secret provider error' }] },
  { name: 'MCPWorkerApplyOutcome', schema: Catalog.MCPWorkerApplyOutcomeSchema, valid: mcpApplied, invalid: [{ ...mcpApplied, revisions: emptyMcpRevisions }, { ...retired, revisions: mcpRevisions }, { worker, outcome: 'failed', revisions: oldMcpRevisions }] },
  { name: 'SkillsWorkerApplyOutcome', schema: Catalog.SkillsWorkerApplyOutcomeSchema, valid: skillApplied, invalid: [{ ...skillApplied, revisions: oldSkillRevisions }, { ...retired, revisions: skillRevisions }, { ...skillApplied, revisions: emptySkillRevisions }] },
  { name: 'MCPApplyResult', schema: Catalog.MCPApplyResultSchema, valid: mcpResult, invalid: [{ ...mcpResult, status: 'applied' }, { ...mcpResult, configuration: { ...configuration, persistedRevision: '3' } }, { ...mcpResult, workers: [mcpApplied, mcpApplied] }] },
  { name: 'SkillSourceScope', schema: Catalog.SkillSourceScopeSchema, valid: scope, invalid: [{ kind: 'agent', agentDirectoryId: '/private/agent', workspaceId: 'workspace_1' }, { kind: 'workspace' }] },
  { name: 'SkillsApplyResult', schema: Catalog.SkillsApplyResultSchema, valid: skillResult, invalid: [{ ...skillResult, sourceRevision: '1' }, { ...skillResult, scope: { ...scope, workspaceId: 'foreign_workspace' } }, { ...skillResult, status: 'no-active-workers' }] },
  { name: 'SkillInstallResult', schema: Catalog.SkillInstallResultSchema, valid: install, invalid: [{ ...install, sourceRevision: '3' }, { ...install, scope: { kind: 'agent', agentDirectoryId: 'agent_directory_1' } }, { ...install, persistence: 'applied' }] },
  { name: 'MCPConfigureRequest', schema: Catalog.MCPConfigureRequestSchema, valid: { expectedPersistedRevision: '1', config }, invalid: [{ expectedPersistedRevision: '01', config }, { config }] },
  { name: 'MCPApplyRequest', schema: Catalog.MCPApplyRequestSchema, valid: { persistedRevision: '2' }, invalid: [{ persistedRevision: 2 }, { persistedRevision: '2', workerGeneration: 'generation_a1' }] },
  { name: 'MCPReconnectRequest', schema: Catalog.MCPReconnectRequestSchema, valid: { persistedRevision: '2', expectedCatalogRevision: '5', workerGeneration: 'generation_a1' }, invalid: [{ persistedRevision: '2', expectedCatalogRevision: '5' }, { persistedRevision: '2', expectedCatalogRevision: '-1', workerGeneration: 'generation_a1' }] },
  { name: 'MCPOAuthPublicConfiguration', schema: Catalog.MCPOAuthPublicConfigurationSchema, valid: oauthConfiguration, invalid: [{ ...oauthConfiguration, clientSecret: 'private-secret' }, { ...oauthConfiguration, fetch: 'custom-fetch' }, { ...oauthConfiguration, tokenUrl: 'https://user:secret@auth.example/token' }] },
  { name: 'MCPOAuthConfigInput', schema: Catalog.MCPOAuthConfigInputSchema, valid: { ...oauthConfiguration, clientSecret: 'intentional-secret-input' }, invalid: [{ authorizationUrl: oauthConfiguration.authorizationUrl }, { ...oauthConfiguration, callbackPort: 0 }, { ...oauthConfiguration, callbackPath: 'callback' }] },
  { name: 'MCPOAuthPendingFlow', schema: Catalog.MCPOAuthPendingFlowSchema, valid: oauthFlow, invalid: [{ ...oauthFlow, flowId: '' }, { ...oauthFlow, accessToken: 'private-token' }] },
  { name: 'MCPOAuthRequest', schema: Catalog.MCPOAuthRequestSchema, valid: { action: 'start', ...oauthOwner, oauth: oauthConfiguration }, invalid: [{ action: 'start', persistedRevision: '2' }, { action: 'cancel', ...oauthOwner }, { action: 'disconnect', ...oauthOwner, flowId: 'flow_1' }] },
  { name: 'MCPOAuthResult', schema: Catalog.MCPOAuthResultSchema, valid: oauthPending, invalid: [{ ...oauthPending, pendingFlow: undefined }, { ...oauthPending, status: 'authenticated', authenticated: false }, { serverId: 'server_1', worker, persistedRevision: '2', status: 'authenticated', authenticated: true, accessToken: 'private-token' }] },
  { name: 'SkillInstallRequest', schema: Catalog.SkillInstallRequestSchema, valid: { sourceId: 'source_1', skillId: 'skill_1', scope: 'workspace', expectedSourceRevision: '1' }, invalid: [{ sourceId: 'source_1', skillId: 'skill_1', scope: 'workspace' }, { sourceId: 'source_1', skillId: 'skill_1', scope: '/private/skills', expectedSourceRevision: '1' }] },
  { name: 'SkillsApplyRequest', schema: Catalog.SkillsApplyRequestSchema, valid: { scope: 'agent', sourceRevision: '3' }, invalid: [{ scope: 'agent', sourceRevision: '03' }, { scope: 'agent', sourceRevision: '3', workerGeneration: 'generation_a1' }] },
  { name: 'SkillExpandRequest', schema: Catalog.SkillExpandRequestSchema, valid: { skillId: 'skill_1', catalogRevision: '7', workerGeneration: 'generation_a1', arguments: 'the current diff' }, invalid: [{ skillId: 'skill_1', catalogRevision: '7', arguments: 'diff' }, { skillId: 'skill_1', catalogRevision: '7', workerGeneration: 'generation_a1', arguments: 42 }] },
  { name: 'SkillExpandResult', schema: Catalog.SkillExpandResultSchema, valid: { worker, skillId: 'skill_1', catalogRevision: '7', message: 'Apply the Review workflow to the current diff.' }, invalid: [{ worker, skillId: 'skill_1', catalogRevision: '7', message: '' }] },
];

describe('Canonical catalogs and scoped operations', () => {
  for (const boundary of boundaries) {
    test(`${boundary.name} accepts its wire shape and rejects contradictory state`, () => {
      expect(boundary.schema.parse(JSON.parse(JSON.stringify(boundary.valid)))).toEqual(boundary.valid);
      for (const invalid of boundary.invalid) expect(boundary.schema.safeParse(invalid).success).toBe(false);
    });
  }

  test('OAuth discovery and exact-flow completion remain distinct from credential observation', () => {
    expect(Catalog.MCPOAuthPublicConfigurationSchema.parse({})).toEqual({});
    expect(Catalog.MCPOAuthRequestSchema.parse({ action: 'start', ...oauthOwner }).action).toBe('start');
    for (const callbackInput of [undefined, 'http://127.0.0.1/callback?code=code&state=state']) {
      expect(Catalog.MCPOAuthRequestSchema.parse({ action: 'complete', ...oauthOwner, flowId: oauthFlow.flowId, callbackInput }).action).toBe('complete');
    }
    expect(Catalog.MCPOAuthRequestSchema.parse({ action: 'cancel', ...oauthOwner, flowId: oauthFlow.flowId }).action).toBe('cancel');
    expect(Catalog.MCPOAuthRequestSchema.parse({ action: 'disconnect', ...oauthOwner }).action).toBe('disconnect');
    const resultOwner = { serverId: 'server_1', worker, persistedRevision: '2' };
    expect(Catalog.MCPOAuthResultSchema.parse({ ...resultOwner, status: 'authenticated', authenticated: true }).status).toBe('authenticated');
    expect(Catalog.MCPOAuthResultSchema.parse({ ...resultOwner, status: 'unauthenticated', authenticated: false }).status).toBe('unauthenticated');
    expect(Catalog.MCPOAuthResultSchema.safeParse({ ...resultOwner, status: 'authenticated', authenticated: true, pendingFlow: oauthFlow }).success).toBe(false);
    for (const field of ['authorizationUrl', 'tokenUrl', 'issuerUrl', 'registrationUrl', 'resourceMetadataUrl', 'redirectUri', 'resource']) {
      for (const url of ['ftp://auth.example', 'https://user:secret@auth.example', 'https://auth.example#private']) {
        expect(Catalog.MCPOAuthPublicConfigurationSchema.safeParse({ [field]: url }).success).toBe(false);
      }
    }
  });

  test('MCP persistence, active publication and sibling failure remain independent', () => {
    const parsed = Catalog.MCPApplyResultSchema.parse(mcpResult);
    expect(parsed.configuration.persistedRevision).toBe('2');
    expect(parsed.workers.map((outcome) => outcome.outcome)).toEqual(['applied', 'failed']);
    expect(Catalog.MCPCatalogReadSchema.parse({ configuration, workerCatalog: { ...mcpState, ...oldMcpRevisions } }).workerCatalog.appliedRevision).toBe('1');
    expect(Catalog.MCPApplyResultSchema.parse({ ...mcpResult, status: 'applied', workers: [mcpApplied, retired] }).status).toBe('applied');
    expect(Catalog.MCPApplyResultSchema.parse({ ...mcpResult, status: 'failed', workers: [mcpFailed] }).status).toBe('failed');
    expect(Catalog.MCPApplyResultSchema.parse({ ...mcpResult, status: 'no-active-workers', workers: [retired] }).status).toBe('no-active-workers');
    expect(Catalog.MCPApplyResultSchema.safeParse({ ...mcpResult, status: 'applied', workers: [retired] }).success).toBe(false);
    expect(Catalog.MCPApplyResultSchema.safeParse({ ...mcpResult, status: 'no-active-workers', workers: [mcpApplied] }).success).toBe(false);
  });

  test('valid empty catalogs differ from unavailable first apply and preserve last valid unusable observations', () => {
    expect(Catalog.MCPCatalogStateSchema.parse({ ...mcpState, activeServers: [], tools: [] }).runtimeStatus).toBe('ready');
    expect(Catalog.MCPCatalogStateSchema.parse({ ...mcpState, ...emptyMcpRevisions, activeServers: [], tools: [] }).appliedRevision).toBeNull();
    expect(Catalog.MCPCatalogStateSchema.parse({ ...mcpState, runtimeStatus: 'unavailable' }).tools).toEqual([tool]);
    expect(Catalog.SkillsCatalogStateSchema.parse({ ...skillState, ...emptySkillRevisions, skills: [] }).appliedSources).toBeNull();
    expect(Catalog.SkillsCatalogStateSchema.parse({ ...skillState, runtimeStatus: 'unavailable' }).skills).toEqual([skill]);
  });

  test('global skill commits retain each root workspace source and can report committed-without-service-result', () => {
    const agentScope = { kind: 'agent', agentDirectoryId: 'agent_directory_1' };
    const foreignSources = { workspace: '19', agent: '3' };
    const foreignApplied = { worker: { ...sibling, workspaceId: 'workspace_2' }, outcome: 'applied', revisions: { ...skillRevisions, persistedSources: foreignSources, appliedSources: foreignSources } };
    const applied = { kind: 'skills', status: 'applied', scope: agentScope, sourceRevision: '3', workers: [skillApplied, foreignApplied] };
    expect(Catalog.SkillsApplyResultSchema.parse(applied).workers).toHaveLength(2);
    expect(Catalog.SkillInstallResultSchema.parse({ scope: agentScope, sourceRevision: '3', persistence: 'committed', apply: null }).apply).toBeNull();
    expect(Catalog.SkillsApplyResultSchema.safeParse({ ...applied, status: 'partial' }).success).toBe(false);
    expect(Catalog.CatalogUpdateSchema.parse({ kind: 'skills', state: skillState }).kind).toBe('skills');
  });

  test('public provider records never expose secrets; only intentional credential writes accept secret payloads', () => {
    expect(Catalog.ProviderCredentialWriteRequestSchema.parse({ expectedRevision: '1', providerId: 'provider_1', credential: { method: 'oauth', accessToken: 'private-token', refreshToken: 'private-refresh', expiresAt: 2000 } }).credential.method).toBe('oauth');
    expect(Catalog.ProviderAuthStateSchema.parse({ status: 'missing' }).status).toBe('missing');
    expect(Catalog.ProviderMutationResultSchema.parse({ revision: '2', providerId: 'provider_1', provider: null }).provider).toBeNull();
    expect(Catalog.ModelMutationResultSchema.parse({ revision: '2', selection, model: null }).model).toBeNull();
    for (const endpoint of ['https://user:secret@models.example', 'https://models.example?key=secret', 'https://models.example#secret', 'ftp://models.example']) {
      expect(Catalog.ProviderSchema.safeParse({ ...provider, endpoint }).success).toBe(false);
    }
    expect(Catalog.ProviderSchema.safeParse({ ...provider, auth: { ...auth, refreshToken: 'private-refresh' } }).success).toBe(false);
    expect(Catalog.ProviderCredentialMutationResultSchema.safeParse({ revision: '2', providerId: 'provider_1', auth, apiKey: 'private-key' }).success).toBe(false);
  });

  test('HTTP and SSE MCP retain opaque credential references without environment secrets or absolute command paths', () => {
    for (const type of ['http', 'sse']) expect(Catalog.MCPTransportSchema.parse({ type, url: 'https://mcp.example/tools', credentialRef: 'credential_1' })).toMatchObject({ type, credentialRef: 'credential_1' });
    for (const command of ['/private/bin/mcp', 'C:\\private\\mcp.exe', '\\\\host\\private\\mcp.exe']) expect(Catalog.MCPTransportSchema.safeParse({ ...transport, command }).success).toBe(false);
    expect(Catalog.MCPTransportSchema.safeParse({ type: 'sse', url: 'https://mcp.example?token=secret' }).success).toBe(false);
  });

  test('wire counters are uint64 decimal and invalid counter text never throws from revision comparison', () => {
    const high = '18446744073709551615';
    expect(Catalog.MCPCatalogReadSchema.parse({ configuration: { ...configuration, persistedRevision: high }, workerCatalog: { ...mcpState, appliedRevision: high, catalogRevision: high } }).configuration.persistedRevision).toBe(high);
    expect(Catalog.MCPCatalogReadSchema.safeParse({ ...mcpRead, workerCatalog: { ...mcpState, appliedRevision: 'not-a-counter' } }).success).toBe(false);
    expect(Catalog.SkillsAppliedRevisionsSchema.safeParse({ ...skillRevisions, appliedSources: { workspace: 'not-a-counter', agent: '3' } }).success).toBe(false);
    expect(Catalog.ModelSchema.safeParse({ ...model, pricing: { ...model.pricing, inputPerMillionTokens: Infinity } }).success).toBe(false);
    expect(Catalog.MCPToolSchema.safeParse({ ...tool, inputSchema: { execute: () => 'not-json' } }).success).toBe(false);
  });
});
