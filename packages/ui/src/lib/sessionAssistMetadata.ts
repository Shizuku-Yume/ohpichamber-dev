import type { Session } from '@openchamber/agent-contract';
import { hostTurnEndedAt } from './sessionSourceClock';

export interface SessionAssistPayload {
  recap: string;
  suggestion: string;
  forMessageID: string;
  generatedAt: number;
}

function getSessionAssist(session: Session | null | undefined): SessionAssistPayload | null {
  const assist = session?.metadata?.openchamber?.assist;
  if (!assist) return null;
  const recap = assist.recap.trim();
  const suggestion = assist.suggestion.trim();
  if (!assist.forMessageID || (!recap && !suggestion)) return null;
  return { recap, suggestion, forMessageID: assist.forMessageID, generatedAt: assist.generatedAt };
}

export function getCurrentSessionAssist(session: Session | null | undefined): SessionAssistPayload | null {
  const assist = getSessionAssist(session);
  if (!assist || !session) return null;
  const endedAt = hostTurnEndedAt(session);
  if (endedAt === undefined) return assist;
  return assist.generatedAt >= endedAt ? assist : null;
}
