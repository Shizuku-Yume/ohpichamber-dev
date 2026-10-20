import { randomUUID } from 'node:crypto';
import { getProviderDefinition, getOAuthProvider, getOAuthProviders, type OAuthCredentials, type OAuthController } from '@oh-my-pi/pi-ai';
import type { AuthStorage } from '@oh-my-pi/pi-coding-agent/session/auth-storage';
import { ProviderOAuthMethodsSchema, ProviderOAuthRequestSchema, ProviderOAuthResultSchema, type ProviderOAuthMethods, type ProviderOAuthRequest, type ProviderOAuthResult } from '@openchamber/agent-contract';
import { ProjectionError } from '../projection/journal.ts';

type Flow = {
  flowId: string; generation: string; methodId: string; providerId: string; expectedRevision: string;
  status: ProviderOAuthResult['status']; controller: AbortController; task?: Promise<void>;
  authorizationUrl?: string; instructions?: string; prompt?: string;
  browserCookieNames?: string[];
  input?: { resolve(value: string): void; reject(error: Error): void; dispose(): void };
  tokens?: OAuthCredentials | string;
  lease?: NodeJS.Timeout;
};

/** Grants stay process-private until the coordinator authorizes a CAS commit. */
export class NativeProviderOAuth {
  private readonly flows = new Map<string, Flow>();
  private closed = false;
  constructor(private readonly authStorage: AuthStorage, private readonly generation: string) {}

  methods(): ProviderOAuthMethods {
    return ProviderOAuthMethodsSchema.parse({ methods: getOAuthProviders().filter(method => method.available).map(method => ({
      methodId: method.id, providerId: method.storeCredentialsAs ?? method.id,
      name: method.name, storeCredentialsAs: method.storeCredentialsAs ?? method.id,
    })) });
  }

  async execute(methodId: string, input: ProviderOAuthRequest, revision: string): Promise<ProviderOAuthResult> {
    const request = ProviderOAuthRequestSchema.parse(input);
    if (this.closed) throw new ProjectionError(409, 'WORKER_GENERATION_CONFLICT', 'Provider login worker is no longer active');
    if (request.action === 'start') {
      if (request.expectedRevision !== revision) throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Provider catalog changed');
      const method = this.methods().methods.find(candidate => candidate.methodId === methodId);
      const definition = getProviderDefinition(methodId) ?? getOAuthProvider(methodId);
      if (!method || !definition?.login) throw new ProjectionError(422, 'PROVIDER_UNAVAILABLE', 'Native provider login method is unavailable');
      for (const flow of this.flows.values()) if (flow.methodId === methodId) {
        this.dispose(flow); this.flows.delete(flow.flowId);
      }
      const login = definition.login;
      const flow: Flow = { flowId: randomUUID(), generation: this.generation, methodId, providerId: method.storeCredentialsAs,
        expectedRevision: request.expectedRevision, status: 'pending', controller: new AbortController() };
      this.flows.set(flow.flowId, flow);
      const callbacks: OAuthController & { onAuth: NonNullable<OAuthController['onAuth']>; onPrompt: NonNullable<OAuthController['onPrompt']> } = {
        signal: flow.controller.signal,
        onAuth: info => {
          if (flow.controller.signal.aborted) return;
          const parsed = new URL(info.url);
          if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Invalid provider authorization URL');
          flow.authorizationUrl = info.url; flow.instructions = info.instructions;
        },
        onPrompt: prompt => this.waitInput(flow, prompt.message),
        onManualCodeInput: signal => this.waitInput(flow, undefined, signal),
        onBrowserSession: (request, signal) => {
          const parsed = new URL(request.url);
          if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Invalid provider authorization URL');
          flow.authorizationUrl = request.url;
          flow.browserCookieNames = [...request.cookieNames];
          return this.waitInput(flow, undefined, signal);
        },
      };
      flow.task = Promise.resolve().then(() => login(callbacks)).then(tokens => {
        if (flow.controller.signal.aborted || this.closed) return;
        if (typeof tokens === 'string' && !tokens) throw new Error('Login returned no credential');
        flow.tokens = tokens; flow.status = 'ready'; this.clearInput(flow);
      }).catch(() => {
        flow.tokens = undefined;
        if (flow.status !== 'cancelled') flow.status = 'failed';
        this.clearInput(flow);
      });
      // Let synchronous native prompts become visible without awaiting network login.
      await Promise.resolve();
      return this.result(flow, revision);
    }
    const flow = this.flows.get(request.flowId);
    if (!flow || flow.methodId !== methodId || request.generation !== this.generation || flow.generation !== request.generation)
      throw new ProjectionError(409, 'WORKER_GENERATION_CONFLICT', 'Provider login flow is no longer active');
    if (request.action === 'cancel') {
      this.dispose(flow); return this.result(flow, revision);
    }
    if (request.action === 'input') {
      if (flow.status !== 'pending' || !flow.input) throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Provider login is not awaiting input');
      const waiting = flow.input; flow.input = undefined; waiting.dispose(); waiting.resolve(request.input);
      await Promise.resolve();
    }
    if (request.action === 'commit') {
      // The enclosing coordinator has already serialized and CAS-checked this mutation.
      if (BigInt(revision) !== BigInt(request.expectedRevision) + 1n || request.expectedRevision !== flow.expectedRevision)
        throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Provider catalog changed during login');
      if (flow.status !== 'ready' || flow.tokens === undefined) throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Provider login has no completed grant');
      try {
        await this.authStorage.credentials.upsert(flow.providerId, typeof flow.tokens === 'string'
          ? { type: 'api_key', key: flow.tokens, source: 'login' }
          : { type: 'oauth', ...flow.tokens, authorizedAt: Date.now() });
        await this.authStorage.credentials.reload();
      } catch { throw new ProjectionError(503, 'CREDENTIAL_WRITE_FAILED', 'Provider login could not be saved'); }
      flow.tokens = undefined; flow.status = 'authenticated'; flow.controller.abort(); this.clearInput(flow);
    }
    return this.result(flow, revision);
  }

  private result(flow: Flow, revision: string): ProviderOAuthResult {
    // A lost response or departed browser cannot strand native callback resources/grants.
    // Active clients renew this lease through the status/input lifecycle.
    clearTimeout(flow.lease);
    if (flow.status === 'pending' || flow.status === 'ready') {
      flow.lease = setTimeout(() => {
        this.dispose(flow); this.flows.delete(flow.flowId);
      }, 60_000);
      flow.lease.unref();
    }
    return ProviderOAuthResultSchema.parse({ flowId: flow.flowId, generation: flow.generation, providerId: flow.providerId,
      revision, status: flow.status, ...(flow.status === 'pending' ? { authorizationUrl: flow.authorizationUrl,
        instructions: flow.instructions, prompt: flow.prompt, browserCookieNames: flow.browserCookieNames } : {}), manualInput: flow.input !== undefined,
      ...(flow.status === 'failed' ? { error: 'OAUTH_FAILED' } : {}) });
  }
  private waitInput(flow: Flow, prompt?: string, signal?: AbortSignal): Promise<string> {
    if (flow.controller.signal.aborted || signal?.aborted) return Promise.reject(new Error('Login cancelled'));
    if (flow.input) return Promise.reject(new Error('Provider requested concurrent input'));
    flow.prompt = prompt;
    const { promise, resolve, reject } = Promise.withResolvers<string>();
    const abort = () => { this.clearInput(flow); reject(new Error('Login cancelled')); };
    const dispose = () => { flow.controller.signal.removeEventListener('abort', abort); signal?.removeEventListener('abort', abort); };
    flow.input = { resolve, reject, dispose };
    flow.controller.signal.addEventListener('abort', abort, { once: true }); signal?.addEventListener('abort', abort, { once: true });
    return promise;
  }
  private clearInput(flow: Flow): void {
    const input = flow.input; flow.input = undefined; flow.prompt = undefined;
    if (input) { input.dispose(); input.reject(new Error('Login input closed')); }
  }
  private dispose(flow: Flow): void {
    clearTimeout(flow.lease);
    flow.status = 'cancelled'; flow.tokens = undefined; flow.controller.abort(); this.clearInput(flow);
  }
  cancelProvider(providerId: string): void {
    for (const flow of this.flows.values()) if (flow.providerId === providerId) this.dispose(flow);
  }
  async close(): Promise<void> {
    this.closed = true;
    for (const flow of this.flows.values()) this.dispose(flow);
    await Promise.allSettled([...this.flows.values()].map(flow => flow.task)); this.flows.clear();
  }
}
