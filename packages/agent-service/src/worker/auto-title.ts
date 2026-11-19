import { formatModelString } from '@oh-my-pi/pi-coding-agent/config/model-resolver';
import { cfgModelRoles } from '@oh-my-pi/pi-coding-agent/config/model-settings';
import { cfgRetryModelFallback } from '@oh-my-pi/pi-coding-agent/session/settings';
import { buildReplanTitleContext, titleContextWordCount } from '@oh-my-pi/pi-coding-agent/session/messages';
import { isLowSignalTitleInput } from '@oh-my-pi/pi-coding-agent/tiny/text';
import type { AgentMessage } from '@oh-my-pi/pi-agent-core';
import type { AgentSession } from '@oh-my-pi/pi-coding-agent/session/agent-session';
import type { Settings } from '@oh-my-pi/pi-coding-agent/config/settings';

type AutoTitleSession = Pick<AgentSession, 'model' | 'generateTitle'>;

/**
 * Run OMP's title generator with one candidate: the session's selected model.
 *
 * OMP's default title candidates include the `tiny`, `commit` and `smol` roles
 * plus their fallback chains, which may point at another connected provider.
 * The Host authorizes provider use per credential release; a title must never
 * leave the selected provider, so this scopes those roles to the selected model
 * and disables model fallback for the request. The caller authorizes that model
 * before this function releases any credential.
 */
export async function generateSelectedModelTitle(input: {
 session: AutoTitleSession;
 settings: Settings;
 firstMessage: string;
 authorize: (model: NonNullable<AutoTitleSession['model']>) => Promise<void>;
 signal?: AbortSignal;
 /** Replaces OMP's default title prompt for this request only. */
 customSystemPrompt?: string;
}): Promise<string | null> {
 const model = input.session.model;
 if (!model) return null;
 const selector = formatModelString(model);
 const previousRoles = { ...cfgModelRoles.get(input.settings) };
 const rolesProvenance = input.settings.getProvenance(cfgModelRoles);
 const previousFallback = cfgRetryModelFallback.get(input.settings);
 const fallbackProvenance = input.settings.getProvenance(cfgRetryModelFallback);
 cfgModelRoles.override(input.settings, {
  ...previousRoles,
  tiny: selector,
  commit: selector,
  smol: selector,
 });
 cfgRetryModelFallback.override(input.settings, false);
 try {
  await input.authorize(model);
  const title = await input.session.generateTitle(input.firstMessage, input.customSystemPrompt, input.signal);
  return title?.trim() || null;
 } finally {
  if (rolesProvenance === 'runtime') cfgModelRoles.override(input.settings, previousRoles);
  else cfgModelRoles.clearOverride(input.settings);
  if (fallbackProvenance === 'runtime') cfgRetryModelFallback.override(input.settings, previousFallback);
  else cfgRetryModelFallback.clearOverride(input.settings);
 }
}

/**
 * The conversation-context retry OMP calls `#advanceDeferredTitle`. It applies
 * whenever the opening prompt could not name this session: a greeting, or any
 * first prompt whose title attempt came back null. Once the reply is settled the
 * title is built from the exchange instead. OMP's
 * `formatTitleConversationContext` supplies the
 * `<chat><user>…</user><assistant>…</assistant></chat>` envelope with its own
 * per-turn cleaning and truncation, so reply text cannot inject scaffolding.
 *
 * Returns null when nothing should be retried: a session that already has a
 * name, or a first turn whose assistant reply never completed successfully.
 * A short reply is still a reply — that is the only context a greeting will
 * ever produce.
 */
export function deferredTitleContext(input: {
 messages: readonly AgentMessage[];
 sessionName: string | undefined;
}): string | null {
 if (input.sessionName) return null;
 if (!hasSettledAssistantReply(input.messages)) return null;
 const context = buildReplanTitleContext([...input.messages]);
 if (!context || isLowSignalTitleInput(context)) return null;
 return context;
}

/** True when the newest assistant message finished without abort or error. */
const hasSettledAssistantReply = (messages: readonly AgentMessage[]): boolean => {
 for (let index = messages.length - 1; index >= 0; index -= 1) {
  const message = messages[index];
  if (message?.role !== 'assistant') continue;
  return titleContextWordCount(message) > 0;
 }
 return false;
};

/** Extract plain text fragments from a user message's content. */
function userContentTexts(content: Extract<AgentMessage, { role: 'user' }>['content']): string[] {
 if (!Array.isArray(content)) return [content];
 const parts: string[] = [];
 for (const part of content) {
  if (part.type === 'text') parts.push(part.text);
 }
 return parts;
}

/** Extract plain text from the session's first user message. */
export function firstUserMessageText(messages: readonly AgentMessage[]): string | undefined {
 for (const message of messages) {
  if (message?.role !== 'user') continue;
  const text = userContentTexts(message.content).map(p => p.trim()).filter(Boolean).join(' ').trim();
  if (text) return text;
 }
 return undefined;
}

/**
 * Title prompt for the deferred retry only.
 *
 * OMP's default prompt answers `<title/>` for greetings and acknowledgements,
 * which is right while a task may still arrive but leaves a greeting-only
 * session permanently `Untitled` — the exact live failure. This prompt keeps
 * OMP's output contract (`<title>…</title>`, 3-6 words, user's own words) and
 * asks for the subject of the exchange that already happened instead of a
 * decline. It never invents a task and never narrows the provider: the caller
 * still pins the selected model and disables fallback.
 */
export const DEFERRED_TITLE_SYSTEM_PROMPT = [
 'You name coding-agent sessions. Write a 3-6 word title for the session so far.',
 '',
 'Output exactly one line: the title inside `<title>` tags.',
 '',
 'Rules:',
 "- Name the subject of the conversation in the user's own key words (the feature, component, error, or request they named).",
 '- A `<chat>` block summarizes the session: its first `<user>` turn is the opening request and later turns are the assistant replies.',
 '- The session may not have a task yet. When the exchange is only a greeting, an acknowledgement, or a short courtesy answer, title what the exchange is (for example a greeting exchange or an empty workspace) instead of declining.',
 '- Never answer an empty `<title/>` for a conversation that has already happened, and never invent a task the user did not mention.',
 '- No quotes, trailing punctuation, or explanations.',
].join('\n');
