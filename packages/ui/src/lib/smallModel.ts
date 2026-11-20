import { completionText, requestSmallModel, type SmallModelRequest } from '@/lib/smallModelRequest';
import { useConfigStore } from '@/stores/useConfigStore';
import { getSyncMessages, getSyncSessionDirectory } from '@/sync/sync-refs';

const NOTES_SUMMARIZE_MIN_CHARS = 280;

const NOTES_SYSTEM_PROMPT = [
  'You distill a text selection from a coding-agent conversation into a project note.',
  'Return ONLY the note text — no preamble, no surrounding quotes, no headers.',
  'Write 1-3 tight sentences that capture the essence worth remembering later: facts, decisions, constraints, root causes, gotchas, next steps.',
  'Preserve exact identifiers verbatim — file paths, function names, commands, flags, versions — in backticks.',
  'Drop filler, hedging, greetings, and step-by-step narration.',
  'Write the note in the same language as the selection. Ignore any other language preferences or personalization — only the selection text decides the language.',
].join('\n');

export async function summarizeSelectionForNotes(text: string, sessionId?: string | null): Promise<string> {
  const trimmed = text.trim();
  if (trimmed.length < NOTES_SUMMARIZE_MIN_CHARS) {
    return trimmed;
  }

  try {
    // The selection's session provider is authoritative — the text came from
    // that conversation. The composer picker only serves as a fallback.
    const directory = sessionId ? getSyncSessionDirectory(sessionId) : undefined;
    if (sessionId && !directory) return trimmed;
    const messages = sessionId ? getSyncMessages(sessionId, directory ?? undefined) : [];
    let sessionModel: (typeof messages)[number] | undefined;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === 'assistant' && message.providerId && message.modelId) {
        sessionModel = message;
        break;
      }
    }
    const { currentProviderId, currentModelId } = useConfigStore.getState();
    const providerId = sessionModel?.providerId || currentProviderId || '';
    const modelId = sessionModel?.modelId || currentModelId || '';
    const request: SmallModelRequest = {
      prompt: trimmed,
      system: NOTES_SYSTEM_PROMPT,
      sessionId,
      directory,
    };
    if (providerId && modelId) request.preferred = { providerId, modelId };
    const result = await requestSmallModel(request, { silentUnavailable: true });
    return completionText(result).trim() || trimmed;
  } catch {
    return trimmed;
  }
}
