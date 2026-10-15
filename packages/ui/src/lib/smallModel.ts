import { completionText, requestSmallModel, type SmallModelRequest } from '@/lib/smallModelRequest';
import { useConfigStore } from '@/stores/useConfigStore';
import { getSyncMessages, getSyncSessionDirectory } from '@/sync/sync-refs';

// Selections shorter than this are already note-sized — summarizing them
// would only add latency and risk losing the exact wording.
const NOTES_SUMMARIZE_MIN_CHARS = 280;

const NOTES_SYSTEM_PROMPT = [
  'You distill a text selection from a coding-agent conversation into a project note.',
  'Return ONLY the note text — no preamble, no surrounding quotes, no headers.',
  'Write 1-3 tight sentences that capture the essence worth remembering later: facts, decisions, constraints, root causes, gotchas, next steps.',
  'Preserve exact identifiers verbatim — file paths, function names, commands, flags, versions — in backticks.',
  'Drop filler, hedging, greetings, and step-by-step narration.',
  'Write the note in the same language as the selection. Ignore any other language preferences or personalization — only the selection text decides the language.',
].join('\n');

/**
 * Distills a chat selection into a compact note via the small model. Falls
 * back to the original text on any failure or when no small model is
 * available within the session's provider. Explicit profile picks are honored
 * by the canonical generation owner.
 */
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

// Goal objectives are capped at 5000 chars for the auditor. Oversized ones
// (huge plans, pasted specs, long assignments) get distilled into completion
// criteria — the working agent received the full prompt in chat anyway,
// only the audit needs the "what counts as done" essence.
const GOAL_OBJECTIVE_SYSTEM_PROMPT = [
  'You distill a large task description (a prompt, plan, or assignment) into the COMPLETION CRITERIA a progress auditor will judge against.',
  'Return ONLY the criteria text — no preamble, no headers, no markdown fences.',
  'Capture: the end goals, what must exist and work when the task is fully done, and how each major part is verified. Omit implementation steps and how-to details.',
  'Preserve verbatim any file paths, commands, and identifiers that define the task — especially ones from the opening lines.',
  'Stay under 4000 characters.',
  'Write in the same language as the task text. Ignore any other language preferences or personalization — only the task text decides the language.',
].join('\n');

/**
 * Distills an oversized goal objective into audit-sized completion criteria
 * via the small model. Returns null on any failure — callers fall back to a
 * head+tail excerpt.
 */
export async function distillGoalObjective(planContent: string, scope: Pick<SmallModelRequest, 'workspaceId' | 'directory' | 'sessionId' | 'preferred' | 'signal'> = {}): Promise<string | null> {
  try {
    const { currentProviderId, currentModelId } = useConfigStore.getState();
    const result = await requestSmallModel({
      ...scope,
      prompt: planContent,
      system: GOAL_OBJECTIVE_SYSTEM_PROMPT,
      preferred: scope.preferred ?? (currentProviderId && currentModelId ? { providerId: currentProviderId, modelId: currentModelId } : undefined),
    });
    return completionText(result).trim() || null;
  } catch {
    scope.signal?.throwIfAborted();
    return null;
  }
}
