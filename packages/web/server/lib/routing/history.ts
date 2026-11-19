/**
 * The conversation Jev sees next to the new request: the last settled turns,
 * read the same way session assist reads them (text parts only, attached
 * quotes included, tool payloads and files never), then cut down per message.
 * A user message keeps its head, where the task usually sits; an answer keeps
 * head and tail, where the finding and the outcome sit. The new request itself
 * is never cut.
 */
import { HISTORY_LIMITS } from './defaults.js';

export const excerptHead = (text, limit) => (text.length <= limit ? text : `${text.slice(0, limit).trimEnd()} […]`);

export const excerptHeadTail = (text, head, tail) =>
  (text.length <= head + tail ? text : `${text.slice(0, head).trimEnd()} […] ${text.slice(-tail).trimStart()}`);

export const turnsToHistory = (turns, limits = HISTORY_LIMITS) => {
  const history = [];
  for (const turn of turns.slice(-limits.turns)) {
    if (turn.user?.text) history.push({ role: 'user', text: excerptHead(turn.user.text, limits.user) });
    if (turn.assistant?.text) history.push({ role: 'assistant', text: excerptHeadTail(turn.assistant.text, limits.answerHead, limits.answerTail) });
  }
  return history;
};
