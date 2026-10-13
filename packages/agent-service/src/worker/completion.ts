import type { CompletionRequest, CompletionResult } from '@openchamber/agent-contract';
import { CompletionRequestSchema, JsonValueSchema } from '@openchamber/agent-contract';
import { completeSimple, validateToolArguments } from '@oh-my-pi/pi-ai';
import type { Context, SimpleStreamOptions, Tool } from '@oh-my-pi/pi-ai';
import { Tokenizer } from '@oh-my-pi/pi-agent-core';
import type { ModelRegistry } from '@oh-my-pi/pi-coding-agent/config/model-registry';
import { ProjectionError } from '../projection/journal.ts';
import type { CompletionOperation, CompletionResult as CompletionWireResult } from '../completion/protocol.ts';
import type { ModelSelection } from '@openchamber/agent-contract';
import type { ResolvedModelSelection } from './catalog-models.ts';

export type CompletionSelectionResolver = (selection: ModelSelection, controls: Pick<CompletionRequest, 'variant' | 'reasoningEffort'>) => Promise<ResolvedModelSelection>;
export type CompletionModelRegistry = ModelRegistry;
type ErrorCode = 'MODEL_UNAVAILABLE' | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_FAILURE' | 'CONTEXT_LIMIT' | 'STRUCTURED_OUTPUT_INVALID' | 'UNSUPPORTED_CAPABILITY';

export async function executeCompletion(request: CompletionRequest, registry: CompletionModelRegistry, signal: AbortSignal, resolveSelection: CompletionSelectionResolver): Promise<CompletionResult> {
  const parsed = CompletionRequestSchema.parse(request);
  const identity = { completionId: parsed.completionId, selection: parsed.selection };
  const cancelled = (reason: 'requested' | 'timeout'): CompletionResult => ({ ...identity, status: 'cancelled', reason });
  const failed = (code: ErrorCode, detail: string, retryable = false): CompletionResult => ({ ...identity, status: 'failed', error: { code, detail, retryable } });
  if (signal.aborted) return cancelled('requested');
  let resolved: ResolvedModelSelection | undefined;
  try { resolved = resolveSelection ? await resolveSelection(parsed.selection, parsed) : undefined; }
  catch { return failed('MODEL_UNAVAILABLE', 'Selected model is unavailable'); }
  const model = resolved?.nativeModel ?? registry.find(parsed.selection.providerId, parsed.selection.modelId);
  if (!model) return failed('MODEL_UNAVAILABLE', 'Selected model is unavailable');
  const effort = resolved?.reasoningEffort;
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = parsed.timeoutMs === undefined ? undefined : setTimeout(() => { timedOut = true; controller.abort(); }, parsed.timeoutMs);
  const structuredTool: Tool = { name: 'respond', description: 'Return the requested structured completion.', parameters: parsed.format.kind === 'json' ? parsed.format.schema : {}, strict: true };
  const tokenizer = new Tokenizer(model);
  const toolTokens = parsed.format.kind === 'json' ? tokenizer.countTokens(JSON.stringify(structuredTool), 'strict') : 0;
  const systemTokens = tokenizer.countTokens(parsed.system ?? '', 'strict');
  const requestedOutput = parsed.maxOutputTokens ?? model.maxTokens;
  const promptBudget = model.contextWindow - toolTokens - systemTokens - Math.max(1, Math.min(requestedOutput, model.maxTokens));
  let prompt = parsed.prompt;
  if (tokenizer.countTokens(prompt, 'strict') > promptBudget) {
    if (parsed.overflow === 'reject' || promptBudget <= 0) return failed('CONTEXT_LIMIT', 'Completion exceeds the selected model context limit');
    let lo = 0, hi = prompt.length;
    while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (tokenizer.countTokens(prompt.slice(0, mid), 'strict') <= promptBudget) lo = mid; else hi = mid - 1; }
    prompt = prompt.slice(0, lo);
  }
  const contextTokens = systemTokens + tokenizer.countTokens(prompt, 'strict') + toolTokens;
  const outputTokens = Math.max(1, Math.min(requestedOutput, model.contextWindow - contextTokens));
  const options: SimpleStreamOptions = { signal: controller.signal, maxTokens: outputTokens, ...(effort === undefined ? {} : { reasoning: effort }) };
  const context: Context = { messages: [{ role: 'user', content: prompt, timestamp: Date.now() }], ...(parsed.system === undefined ? {} : { systemPrompt: [parsed.system] }), ...(parsed.format.kind === 'json' ? { tools: [structuredTool] } : {}) };
  try {
    const requestOptions: SimpleStreamOptions = { ...options, apiKey: registry.resolver(model, resolved?.nativeCredentialSessionId ?? parsed.completionId) };
    const message = await completeSimple(model, context, parsed.format.kind === 'json' ? { ...requestOptions, toolChoice: { type: 'function', name: 'respond' } } : requestOptions);
    if (timedOut) return cancelled('timeout');
    if (signal.aborted) return cancelled('requested');
    if (message.stopReason === 'aborted') return cancelled('requested');
    if (message.stopReason === 'error') return failed('PROVIDER_FAILURE', 'Selected provider could not complete the request', true);
    const usage = message.usage;
    const inputTokens = usage?.input ?? 0;
    const outputTokens = usage?.output ?? 0;
    const cacheTokens = (usage?.cacheRead ?? 0) + (usage?.cacheWrite ?? 0);
    const canonicalUsage = usage ? { inputTokens: inputTokens + cacheTokens, outputTokens, totalTokens: inputTokens + cacheTokens + outputTokens } : null;
    const finishReason = message.stopReason === 'length' ? 'output-limit' : 'complete';
    if (parsed.format.kind === 'text') {
      const text = message.content.filter((part): part is { type: 'text'; text: string } => part.type === 'text').map(part => part.text).join('');
      return { ...identity, status: 'completed', output: { kind: 'text', text }, finishReason, usage: canonicalUsage };
    }
    const tool = message.content.find(part => part.type === 'toolCall' && part.name === 'respond');
    if (!tool || tool.type !== 'toolCall') return failed('STRUCTURED_OUTPUT_INVALID', 'Structured completion did not return respond output');
    let value: unknown;
    try { value = JsonValueSchema.parse(validateToolArguments(structuredTool, tool)); }
    catch { return failed('STRUCTURED_OUTPUT_INVALID', 'Structured completion does not conform to its schema'); }
    return { ...identity, status: 'completed', output: { kind: 'json', value }, finishReason, usage: canonicalUsage };
  } catch (error) {
    if (timedOut) return cancelled('timeout');
    if (signal.aborted) return cancelled('requested');
    const detail = error instanceof Error ? error.message : 'Provider failed';
    const code = /context|token limit|too many tokens/i.test(detail) ? 'CONTEXT_LIMIT' : 'PROVIDER_FAILURE';
    return failed(code, code === 'CONTEXT_LIMIT' ? 'Completion exceeds the selected model context limit' : 'Selected provider could not complete the request', true);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}

export class WorkerCompletion {
  private active?: { completionId: string; controller: AbortController; result: Promise<CompletionResult> };
  private closed = false;
  constructor(private readonly registry: CompletionModelRegistry, private readonly workspaceId: string, private readonly resolveSelection: CompletionSelectionResolver) {}
  async operation(operation: CompletionOperation): Promise<CompletionWireResult> {
    if (this.closed) throw new Error('Completion worker is closed');
    if (operation.type === 'completion.cancel') {
      const current = this.active;
      if (!current || current.completionId !== operation.request.completionId) throw new ProjectionError(404, 'COMPLETION_NOT_FOUND', 'Completion is not active');
      current.controller.abort();
      const result = await current.result;
      if (result.status !== 'cancelled' || result.reason !== 'requested') throw new ProjectionError(409, 'INVALID_REQUEST', 'Completion has already finished');
      return { type: 'completion.cancelled', result: { completionId: operation.request.completionId, status: 'cancelled' } };
    }
    if (operation.request.workspaceId !== this.workspaceId) throw new ProjectionError(403, 'FORBIDDEN', 'Completion workspace does not match worker identity');
    if (this.active) throw new Error('Completion is already active');
    const controller = new AbortController();
    const result = executeCompletion(operation.request, this.registry, controller.signal, this.resolveSelection);
    this.active = { completionId: operation.request.completionId, controller, result };
    try { return { type: 'completion.result', result: await result }; }
    finally { if (this.active?.result === result) this.active = undefined; }
  }
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const current = this.active;
    if (current) { current.controller.abort(); await current.result; }
  }
}
