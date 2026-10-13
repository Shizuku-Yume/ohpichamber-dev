import type { CompletionRequest, CompletionResult, JsonValue, ModelSelection } from '@openchamber/agent-contract';
import { CompletionRequestSchema, JsonValueSchema } from '@openchamber/agent-contract';
import { completeSimple, validateToolArguments } from '@oh-my-pi/pi-ai';
import * as NativeError from '@oh-my-pi/pi-ai/error';
import type { Context, SimpleStreamOptions, Tool } from '@oh-my-pi/pi-ai';
import { Tokenizer } from '@oh-my-pi/pi-agent-core';
import type { ModelRegistry } from '@oh-my-pi/pi-coding-agent/config/model-registry';
import { ProjectionError } from '../projection/journal.ts';
import type { CompletionOperation, CompletionResult as CompletionWireResult } from '../completion/protocol.ts';
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
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = parsed.timeoutMs === undefined ? undefined : setTimeout(() => { timedOut = true; controller.abort(); }, parsed.timeoutMs);
  try {
    let resolved: ResolvedModelSelection;
    try { resolved = await resolveSelection(parsed.selection, parsed); }
    catch (error) {
      if (timedOut) return cancelled('timeout');
      if (signal.aborted) return cancelled('requested');
      if (error instanceof ProjectionError && error.code === 'UNSUPPORTED_CAPABILITY') return failed('UNSUPPORTED_CAPABILITY', 'Selected completion controls are unsupported');
      if (error instanceof ProjectionError && error.code === 'PROVIDER_UNAVAILABLE') return failed('PROVIDER_UNAVAILABLE', 'Selected provider is unavailable', true);
      return failed('MODEL_UNAVAILABLE', 'Selected model is unavailable');
    }
    if (timedOut) return cancelled('timeout');
    if (signal.aborted) return cancelled('requested');
    const model = resolved.nativeModel;
    const effort = resolved.reasoningEffort;
    const contextWindow = model.contextWindow;
    const modelOutputLimit = model.maxTokens;
    if (contextWindow === null || modelOutputLimit === null || contextWindow <= 0 || modelOutputLimit <= 0) return failed('MODEL_UNAVAILABLE', 'Selected model has no usable token limits');
    if (parsed.format.kind === 'json' && resolved.publicModel.toolsSupported === false) return failed('UNSUPPORTED_CAPABILITY', 'Selected model does not support structured completion');
    const structuredTool: Tool = { name: 'respond', description: 'Return the requested structured completion.', parameters: parsed.format.kind === 'json' ? parsed.format.schema : {}, strict: true };
    const tokenizer = new Tokenizer(model);
    const toolTokens = parsed.format.kind === 'json' ? tokenizer.countTokens(JSON.stringify(structuredTool), 'strict') : 0;
    const systemTokens = tokenizer.countTokens(parsed.system ?? '', 'strict');
    const requestedOutput = parsed.maxOutputTokens ?? modelOutputLimit;
    if (requestedOutput > modelOutputLimit && parsed.overflow === 'reject') return failed('CONTEXT_LIMIT', 'Completion exceeds the selected model output limit');
    const outputLimit = Math.min(requestedOutput, modelOutputLimit);
    const promptBudget = contextWindow - toolTokens - systemTokens - outputLimit;
    let prompt = parsed.prompt;
    if (tokenizer.countTokens(prompt, 'strict') > promptBudget) {
      if (parsed.overflow === 'reject' || promptBudget <= 0) return failed('CONTEXT_LIMIT', 'Completion exceeds the selected model context limit');
      // Search code-point boundaries; never send a prefix ending inside a surrogate pair.
      const characters = Array.from(prompt);
      let lo = 0;
      let hi = characters.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (tokenizer.countTokens(characters.slice(0, mid).join(''), 'strict') <= promptBudget) lo = mid;
        else hi = mid - 1;
      }
      prompt = characters.slice(0, lo).join('');
      if (prompt.length === 0) return failed('CONTEXT_LIMIT', 'Completion cannot retain a prompt within the selected model context limit');
    }
    const contextTokens = systemTokens + tokenizer.countTokens(prompt, 'strict') + toolTokens;
    if (contextTokens + outputLimit > contextWindow) return failed('CONTEXT_LIMIT', 'Completion exceeds the selected model context limit');
    const context: Context = { messages: [{ role: 'user', content: prompt, timestamp: Date.now() }] };
    if (parsed.system !== undefined) context.systemPrompt = [parsed.system];
    const options: SimpleStreamOptions = {
      signal: controller.signal, maxTokens: outputLimit,
      apiKey: registry.resolver(model, resolved.nativeCredentialSessionId ?? parsed.completionId),
    };
    if (effort !== null) options.reasoning = effort;
    if (parsed.format.kind === 'json') {
      context.tools = [structuredTool];
      options.toolChoice = { type: 'function', name: 'respond' };
    }
    const message = await completeSimple(model, context, options);
    if (timedOut) return cancelled('timeout');
    if (signal.aborted) return cancelled('requested');
    if (message.stopReason === 'aborted') return cancelled('requested');
    if (message.stopReason === 'error') {
      if (NativeError.isContextOverflow(message, contextWindow)) return failed('CONTEXT_LIMIT', 'Completion exceeds the selected model context limit');
      const errorId = NativeError.classifyMessage(message);
      if (NativeError.is(errorId, NativeError.Flag.Timeout)) return cancelled('timeout');
      if (NativeError.is(errorId, NativeError.Flag.AuthFailed)) return failed('PROVIDER_UNAVAILABLE', 'Selected provider is unavailable', true);
      return failed('PROVIDER_FAILURE', 'Selected provider could not complete the request', NativeError.retriable(errorId));
    }
    const usage = message.usage;
    const inputTokens = usage.input + usage.cacheRead + usage.cacheWrite;
    const outputTokens = usage.output;
    const canonicalUsage = { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
    const finishReason = message.stopReason === 'length' ? 'output-limit' : 'complete';
    if (parsed.format.kind === 'text') {
      if (message.stopReason === 'toolUse') return failed('UNSUPPORTED_CAPABILITY', 'Text completion returned a tool request');
      const text = message.content.filter((part): part is { type: 'text'; text: string } => part.type === 'text').map(part => part.text).join('');
      return { ...identity, status: 'completed', output: { kind: 'text', text }, finishReason, usage: canonicalUsage };
    }
    const calls = message.content.filter(part => part.type === 'toolCall');
    const tool = calls[0];
    if (calls.length !== 1 || tool?.type !== 'toolCall' || tool.name !== 'respond') return failed('STRUCTURED_OUTPUT_INVALID', 'Structured completion did not return exactly one respond output');
    let value: JsonValue;
    try { value = JsonValueSchema.parse(validateToolArguments(structuredTool, tool)); }
    catch { return failed('STRUCTURED_OUTPUT_INVALID', 'Structured completion does not conform to its schema'); }
    return { ...identity, status: 'completed', output: { kind: 'json', value }, finishReason, usage: canonicalUsage };
  } catch (error) {
    if (timedOut) return cancelled('timeout');
    if (signal.aborted) return cancelled('requested');
    const errorId = NativeError.classify(error);
    if (NativeError.is(errorId, NativeError.Flag.Timeout)) return cancelled('timeout');
    if (NativeError.is(errorId, NativeError.Flag.AuthFailed)) return failed('PROVIDER_UNAVAILABLE', 'Selected provider is unavailable', true);
    if (NativeError.is(errorId, NativeError.Flag.ContextOverflow)) return failed('CONTEXT_LIMIT', 'Completion exceeds the selected model context limit');
    return failed('PROVIDER_FAILURE', 'Selected provider could not complete the request', NativeError.retriable(errorId));
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}

export class WorkerCompletion {
  private active?: { completionId: string; controller: AbortController; result: Promise<CompletionResult> };
  private readonly terminalIds = new Set<string>();
  private closed = false;
  constructor(private readonly registry: CompletionModelRegistry, private readonly workspaceId: string, private readonly resolveSelection: CompletionSelectionResolver) {}
  async operation(operation: CompletionOperation): Promise<CompletionWireResult> {
    if (this.closed) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Completion worker is closed');
    if (operation.type === 'completion.cancel') {
      if (this.terminalIds.has(operation.request.completionId)) throw new ProjectionError(409, 'INVALID_REQUEST', 'Completion has already finished');
      const current = this.active;
      if (!current || current.completionId !== operation.request.completionId) throw new ProjectionError(404, 'COMPLETION_NOT_FOUND', 'Completion is not active');
      current.controller.abort();
      const result = await current.result;
      if (result.status !== 'cancelled' || result.reason !== 'requested') throw new ProjectionError(409, 'INVALID_REQUEST', 'Completion has already finished');
      return { type: 'completion.cancelled', result: { completionId: operation.request.completionId, status: 'cancelled' } };
    }
    if (operation.request.workspaceId !== this.workspaceId) throw new ProjectionError(400, 'INVALID_REQUEST', 'Completion workspace does not match worker identity');
    if (this.active) throw new ProjectionError(409, 'COMMAND_IN_FLIGHT', 'Completion is already active');
    if (this.terminalIds.has(operation.request.completionId)) throw new ProjectionError(409, 'INVALID_REQUEST', 'Completion identity has already finished');
    const controller = new AbortController();
    const result = executeCompletion(operation.request, this.registry, controller.signal, this.resolveSelection);
    this.active = { completionId: operation.request.completionId, controller, result };
    try { return { type: 'completion.result', result: await result }; }
    finally {
      if (!this.closed) this.terminalIds.add(operation.request.completionId);
      if (this.active?.result === result) this.active = undefined;
    }
  }
  async close(): Promise<void> {
    this.closed = true;
    const current = this.active;
    if (current) { current.controller.abort(); await current.result; }
    this.terminalIds.clear();
  }
}
