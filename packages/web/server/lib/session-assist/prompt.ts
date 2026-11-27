import { excerpt } from './context.js';
import type { AssistTargets, AssistTurn } from './contracts.js';

const MAX_PROMPT_CHARS = 32_000;

export interface BuiltAssistPrompt {
  text: string;
  language: string;
}

function renderTurn(
  turn: AssistTurn,
  index: number,
  userText = turn.user.text,
  answerText = turn.assistant?.text ?? '',
): string {
  return [
    `Turn ${index + 1}${turn.complete ? '' : ' (interrupted before a final response)'}`,
    'User message with attached context:', userText,
    turn.complete ? 'Assistant final response:' : 'Assistant progress before interruption:', answerText,
  ].join('\n');
}

export function buildAssistPrompt(turns: AssistTurn[], targets: AssistTargets, charBudget: number): BuiltAssistPrompt | null {
  const budget = Math.min(MAX_PROMPT_CHARS, Math.floor(charBudget));
  if (!Number.isFinite(budget) || budget < 1_000 || !turns.length) return null;
  const languageBudget = Math.min(3_600, Math.floor(budget / 5));
  const language = excerpt(turns.map((turn) => excerpt(turn.user.authored, 1_200)).filter(Boolean).join('\n'), languageBudget);
  const header = 'Recent conversation turns, oldest first. Older turns may be omitted.\n\n';
  const requested = [targets.recap ? 'a reminder of the recent substantive work in recap' : '', targets.suggestion ? 'an optional current next step in suggestion' : ''].filter(Boolean).join(', and ');
  const footer = `\n\n--- End of conversation evidence ---\n\nRecent user-authored communication, excluding attached quotes, oldest first:\n\n${language}\n\nReturn ${requested}.`;
  const available = budget - header.length - footer.length;
  const kept = turns.slice();
  let body = kept.map((turn, i) => renderTurn(turn, i)).join('\n\n---\n\n');
  while (body.length > available && kept.length > 1) {
    kept.shift();
    body = kept.map((turn, i) => renderTurn(turn, i)).join('\n\n---\n\n');
  }
  if (body.length > available) {
    const turn = kept[0];
    if (!turn) return null;
    const textBudget = available - renderTurn(turn, 0, '', '').length;
    if (textBudget < 128) return null;
    const answer = turn.assistant?.text ?? '';
    const userBudget = Math.min(turn.user.text.length, Math.max(Math.floor(textBudget / 3), textBudget - answer.length));
    body = renderTurn(turn, 0, excerpt(turn.user.text, userBudget), excerpt(answer, textBudget - userBudget));
  }
  return { text: header + body + footer, language };
}
