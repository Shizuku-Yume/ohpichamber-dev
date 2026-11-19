import type { AgentMessage } from '@oh-my-pi/pi-agent-core';
import { completeSimple, type AssistantMessage, type Context, type Model } from '@oh-my-pi/pi-ai';
import { register } from '@oh-my-pi/pi-coding-agent/config/registry';
import { parseComposerPrediction, parseComposerPredictions } from '@oh-my-pi/pi-coding-agent/modes/controllers/composer-prediction-controller';
import composerPredictionPrompt from '@oh-my-pi/pi-coding-agent/prompts/system/composer-prediction-user' with { type: 'text' };
import type { AgentSession, EphemeralTurnOptions, EphemeralTurnResult } from '@oh-my-pi/pi-coding-agent/session/agent-session';
import { isAdvisorCard } from '@oh-my-pi/pi-coding-agent/session/queued-messages';
import { logger, prompt } from '@oh-my-pi/pi-utils';
import type { ProjectionInput } from '../projection/protocol.ts';

const SUGGESTION_GENERATOR_VALUES = ['session', 'small', 'off'] as const;
export type SuggestionGenerator = (typeof SUGGESTION_GENERATOR_VALUES)[number];

export const cfgSuggestionGenerator = register({
  id: 'suggestion.generator',
  type: 'enum',
  values: SUGGESTION_GENERATOR_VALUES,
  default: 'session',
  ui: {
    tab: 'tasks',
    group: 'Modes',
    label: 'Suggestion Generator',
    description: 'Generates next-prompt suggestions at turn end from the session model, the small model, or off.',
    options: [
      { value: 'session', label: 'Session model', description: 'Run ephemeral turn on the session model' },
      { value: 'small', label: 'Small model', description: 'Run suggestion on the configured small model' },
      { value: 'off', label: 'Off', description: 'Do not generate next-prompt suggestions' },
    ],
  },
});

export const USAGE_PURPOSE = 'composer-prediction';
const PREDICTION_MAX_TOKENS = 1024;
const PREDICTION_DEADLINE_MS = 15_000;
const SKIP_REPLY = 'NO_PREDICTION';
/**
 * Alternatives requested per prediction. OMP's own controller asks for a single
 * message unless `composer.predictionAlternatives` is on, and models that are
 * reluctant to guess answer that single-message prompt with the skip reply far
 * more often than they decline an explicitly plural one: on the acceptance
 * provider `claude-haiku-5-5` a single request returned the skip 5 times out of
 * 5, while the plural prompt returned a usable first line 10 times out of 12.
 * One request either way, a few more output tokens, and the chip shows the
 * most likely line as OMP's ghost text does.
 */
const PREDICTION_CHOICES = 3;

/**
 * Message a prediction is keyed on: the newest message that is not an advisor card.
 */
export function predictionAnchor(session: Pick<AgentSession, 'messages'>): AgentMessage | undefined {
  const messages = session.messages;
  for (let i = messages.length - 1; i >= 0; i--) {
    const candidate = messages[i];
    if (candidate && !isAdvisorCard(candidate)) return candidate;
  }
  return undefined;
}

export interface SuggestionDriverOptions {
  session: AgentSession;
  emit: (events: ProjectionInput[]) => void;
  getGenerator?: () => SuggestionGenerator;
  hasDraft?: () => boolean;
  isAborted?: () => boolean;
  authorize?: (model: Model) => Promise<void>;
  runEphemeralTurn?: (options: EphemeralTurnOptions) => Promise<EphemeralTurnResult>;
  callSmallModel?: (options: { promptText: string; signal: AbortSignal }) => Promise<{ replyText: string; assistantMessage?: AssistantMessage }>;
}

export class SuggestionDriver {
  readonly session: AgentSession;
  private readonly emit: (events: ProjectionInput[]) => void;
  private readonly getGeneratorOverride?: () => SuggestionGenerator;
  private readonly hasDraftOverride?: () => boolean;
  private readonly isAbortedOverride?: () => boolean;
  private readonly authorize?: (model: Model) => Promise<void>;
  private readonly runEphemeralTurnOverride?: (options: EphemeralTurnOptions) => Promise<EphemeralTurnResult>;
  private readonly callSmallModelOverride?: (options: { promptText: string; signal: AbortSignal }) => Promise<{ replyText: string; assistantMessage?: AssistantMessage }>;
  private currentAbort?: AbortController;

  constructor(options: SuggestionDriverOptions) {
    this.session = options.session;
    this.emit = options.emit;
    this.getGeneratorOverride = options.getGenerator;
    this.hasDraftOverride = options.hasDraft;
    this.isAbortedOverride = options.isAborted;
    this.authorize = options.authorize;
    this.runEphemeralTurnOverride = options.runEphemeralTurn;
    this.callSmallModelOverride = options.callSmallModel;
  }

  get generator(): SuggestionGenerator {
    if (this.getGeneratorOverride) return this.getGeneratorOverride();
    return cfgSuggestionGenerator.get(this.session.settings);
  }

  hasDraft(): boolean {
    return this.hasDraftOverride ? this.hasDraftOverride() : false;
  }

  isAborted(): boolean {
    return this.isAbortedOverride ? this.isAbortedOverride() : false;
  }

  cancel(): void {
    if (this.currentAbort) {
      this.currentAbort.abort();
      this.currentAbort = undefined;
    }
  }

  async handleAgentEnd(event: {
    type: 'agent_end';
    messages?: AgentMessage[];
  }): Promise<void> {
    const generator = this.generator;
    if (generator === 'off') return;

    if (this.session.isRunActive) return;

    // Skip rule 2: Aborted runs
    if (this.isAborted()) return;
    const last = event.messages?.findLast?.((message: AgentMessage): message is AssistantMessage => message.role === 'assistant');
    if (!last || last.stopReason === 'aborted' || last.stopReason === 'error') return;

    // Skip rule 3: Streaming
    if (this.session.isStreaming) return;

    // Skip rule 4: Compaction
    if (this.session.isCompacting) return;

    // Skip rule 5: Drafts
    if (this.hasDraft()) return;

    // Model check
    if (!this.session.model) return;

    this.cancel();

    const abort = new AbortController();
    this.currentAbort = abort;
    const anchor = predictionAnchor(this.session);
    const deadline = AbortSignal.timeout(PREDICTION_DEADLINE_MS);
    const signal = AbortSignal.any([abort.signal, deadline]);

    const renderedPrompt = prompt.render(composerPredictionPrompt, {
      skip: SKIP_REPLY,
      choices: PREDICTION_CHOICES,
    });

    try {
      let replyText = '';
      let assistantMessage: AssistantMessage | undefined;

      if (generator === 'session') {
        const result = this.runEphemeralTurnOverride
          ? await this.runEphemeralTurnOverride({
            promptText: renderedPrompt,
            maxTokens: this.session.ephemeralMaxTokensPreservesRequest?.() ? PREDICTION_MAX_TOKENS : undefined,
            minimizeEffort: true,
            signal,
          })
          : await this.session.runEphemeralTurn({
            promptText: renderedPrompt,
            maxTokens: this.session.ephemeralMaxTokensPreservesRequest?.() ? PREDICTION_MAX_TOKENS : undefined,
            minimizeEffort: true,
            signal,
          });
        replyText = result.replyText;
        assistantMessage = result.assistantMessage;
      } else if (generator === 'small') {
        const result = this.callSmallModelOverride
          ? await this.callSmallModelOverride({ promptText: renderedPrompt, signal })
          : await this.executeSmallModelCall({ promptText: renderedPrompt, signal });
        replyText = result.replyText;
        assistantMessage = result.assistantMessage;
      }

      this.recordUsage(assistantMessage);

      if (abort.signal.aborted || signal.aborted) return;
      if (predictionAnchor(this.session) !== anchor) return;

      // The plural prompt answers one message per line, most likely first; the
      // chip shows that first line as OMP's ghost text does. A reply that skips
      // or carries nothing usable yields no suggestion, exactly like the single
      // form, so a declining model still stays quiet.
      const suggestion = parseComposerPredictions(replyText, PREDICTION_CHOICES)?.[0]
        ?? parseComposerPrediction(replyText);
      if (suggestion) {
        this.emit([
          {
            timestamp: Date.now(),
            transient: true,
            event: {
              type: 'session.suggestion',
              suggestion,
              createdAt: Date.now(),
            },
          },
        ]);
      }
    } catch (error) {
      if (!abort.signal.aborted && !deadline.aborted) {
        logger.debug('Next-prompt suggestion failed', { error: String(error) });
      }
    } finally {
      if (this.currentAbort === abort) {
        this.currentAbort = undefined;
      }
    }
  }

  private async executeSmallModelCall(options: {
    promptText: string;
    signal: AbortSignal;
  }): Promise<{ replyText: string; assistantMessage?: AssistantMessage }> {
    let targetModel: Model | undefined;
    for (const role of ['smol', 'tiny'] as const) {
      const roleResult = this.session.resolveRoleModelWithThinking?.(role);
      if (roleResult?.model) {
        targetModel = roleResult.model;
        break;
      }
    }
    if (!targetModel) {
      targetModel = this.session.model;
    }
    if (!targetModel) {
      return { replyText: '' };
    }

    if (this.authorize) {
      await this.authorize(targetModel);
    }
    const userPromptMessage: AgentMessage = {
      role: 'user',
      content: [{ type: 'text', text: options.promptText }],
      timestamp: Date.now(),
    };
    const snapshot = [...this.session.messages, userPromptMessage];
    const llmMessages = await this.session.convertMessagesToLlm(snapshot, options.signal, targetModel);

    const context: Context = {
      messages: llmMessages,
    };
    if (this.session.systemPrompt) {
      context.systemPrompt = Array.isArray(this.session.systemPrompt)
        ? this.session.systemPrompt
        : [this.session.systemPrompt];
    }

    const apiKey = await this.session.modelRegistry?.getApiKey?.(targetModel);
    const assistantMessage = await completeSimple(
      targetModel,
      context,
      {
        maxTokens: 256,
        signal: options.signal,
        apiKey,
      },
    );

    let replyText = '';
    if (Array.isArray(assistantMessage.content)) {
      for (const part of assistantMessage.content) {
        if (part && typeof part === 'object' && 'type' in part && part.type === 'text' && typeof part.text === 'string') {
          replyText += part.text;
        }
      }
    }

    return { replyText, assistantMessage };
  }

  private recordUsage(message?: AssistantMessage): void {
    if (!message) return;
    try {
      this.session.sessionManager.appendModelUsage(
        {
          purpose: USAGE_PURPOSE,
          api: message.api,
          provider: message.provider,
          model: message.model,
          usage: message.usage,
          stopReason: message.stopReason,
        },
        {
          sessionId: this.session.sessionManager.getSessionId(),
          parentId: this.session.sessionManager.getLeafId(),
        },
      );
    } catch {
      // Usage recording is best-effort
    }
  }
}
