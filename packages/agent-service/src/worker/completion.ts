import type { CompletionRequest, CompletionResult } from '@openchamber/agent-contract';
import { CompletionRequestSchema, JsonValueSchema } from '@openchamber/agent-contract';
import { completeSimple } from '@oh-my-pi/pi-ai';
import type { Context, Effort, SimpleStreamOptions, Tool } from '@oh-my-pi/pi-ai';
import type { createAgentSession } from '@oh-my-pi/pi-coding-agent/sdk';
function toEffort(value: string): Effort | undefined {
  switch (value) {
    case 'minimal': return 'minimal' as Effort;
    case 'low': return 'low' as Effort;
    case 'medium': return 'medium' as Effort;
    case 'high': return 'high' as Effort;
    case 'xhigh': return 'xhigh' as Effort;
    case 'max': return 'max' as Effort;
    default: return undefined;
  }
}

export type CompletionModelRegistry = Awaited<ReturnType<typeof createAgentSession>>['session']['modelRegistry'];

type ErrorCode = 'MODEL_UNAVAILABLE' | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_FAILURE' | 'CONTEXT_LIMIT' | 'STRUCTURED_OUTPUT_INVALID' | 'UNSUPPORTED_CAPABILITY';

export async function executeCompletion(request: CompletionRequest, registry: CompletionModelRegistry, signal: AbortSignal): Promise<CompletionResult> {
  const parsed = CompletionRequestSchema.parse(request);
  const identity = { completionId: parsed.completionId, selection: parsed.selection };
  const cancelled = (reason: 'requested' | 'timeout'): CompletionResult => ({ ...identity, status: 'cancelled', reason });
  const failed = (code: ErrorCode, detail: string, retryable = false): CompletionResult => ({ ...identity, status: 'failed', error: { code, detail, retryable } });
  if (signal.aborted) return cancelled('requested');
  const model = registry.find(parsed.selection.providerId, parsed.selection.modelId);
  if (!model) return failed('MODEL_UNAVAILABLE', 'Selected model is unavailable');
  if (parsed.variant !== null && parsed.reasoningEffort !== null && parsed.variant !== parsed.reasoningEffort) return failed('UNSUPPORTED_CAPABILITY', 'Variant and reasoning effort disagree');
  const requestedEffort = parsed.reasoningEffort ?? parsed.variant;
  const effort = requestedEffort === null ? undefined : toEffort(requestedEffort);
  if (requestedEffort !== null && effort === undefined) return failed('UNSUPPORTED_CAPABILITY', 'Requested reasoning effort is unsupported');
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = parsed.timeoutMs === undefined ? undefined : setTimeout(() => { timedOut = true; controller.abort(); }, parsed.timeoutMs);
  const options: SimpleStreamOptions = { signal: controller.signal, ...(parsed.maxOutputTokens === undefined ? {} : { maxTokens: parsed.maxOutputTokens }), ...(effort === undefined ? {} : { reasoning: effort }) };
  const structuredTool: Tool = {
    name: 'respond', description: 'Return the requested structured completion.', parameters: parsed.format.kind === 'json' ? parsed.format.schema : {}, strict: true,
  };
  const context: Context = {
    messages: [{ role: 'user', content: parsed.prompt, timestamp: Date.now() }],
    ...(parsed.system === undefined ? {} : { systemPrompt: [parsed.system] }),
    ...(parsed.format.kind === 'json' ? { tools: [structuredTool] } : {}),
  };
  try {
    const apiKey = await registry.getApiKey(model);
    const requestOptions = { ...options, apiKey };
    const message = await completeSimple(model, context, parsed.format.kind === 'json' ? { ...requestOptions, toolChoice: { type: 'function', name: 'respond' } } : requestOptions);
    if (timedOut) return cancelled('timeout');
    if (signal.aborted) return cancelled('requested');
    const usage = message.usage;
    const inputTokens = usage?.input ?? 0;
    const outputTokens = usage?.output ?? 0;
    const canonicalUsage = usage ? { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens } : null;
    const finishReason = message.stopReason === 'length' ? 'output-limit' : 'complete';
    if (parsed.format.kind === 'text') {
      const text = message.content.filter((part): part is { type: 'text'; text: string } => part.type === 'text').map(part => part.text).join('');
      return { ...identity, status: 'completed', output: { kind: 'text', text }, finishReason, usage: canonicalUsage };
    }
    const tool = message.content.find(part => part.type === 'toolCall' && part.name === 'respond');
    if (!tool || tool.type !== 'toolCall') return failed('STRUCTURED_OUTPUT_INVALID', 'Structured completion did not return respond output');
    let value: unknown;
    try { value = typeof tool.arguments === 'string' ? JSON.parse(tool.arguments) : tool.arguments; } catch { return failed('STRUCTURED_OUTPUT_INVALID', 'Structured completion returned invalid JSON'); }
    const checked = JsonValueSchema.safeParse(value);
    if (!checked.success) return failed('STRUCTURED_OUTPUT_INVALID', 'Structured completion returned a non-JSON value');
    return { ...identity, status: 'completed', output: { kind: 'json', value: checked.data }, finishReason, usage: canonicalUsage };
  } catch (error) {
    if (timedOut) return cancelled('timeout');
    if (signal.aborted) return cancelled('requested');
    const detail = error instanceof Error ? error.message : 'Provider failed';
    return failed(/context|token limit|too many tokens/i.test(detail) && parsed.overflow === 'reject' ? 'CONTEXT_LIMIT' : 'PROVIDER_FAILURE', detail, true);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
