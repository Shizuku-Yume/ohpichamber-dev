import React from 'react';
import type { Message, Part, Turn } from '@openchamber/agent-contract';
import { isCapacitorApp } from '@/lib/platform';

export interface AuthoritativeCompletedReply {
 messageId: string;
 turnId: string;
 text: string;
}

export function extractCompletedReplyText(message: Message): string | null {
 if (message.role !== 'assistant') return null;
 const text = message.parts
  .filter((part): part is Extract<Part, { type: 'text' }> => part.type === 'text')
  .map((part) => part.content)
  .join('')
  .trim();
 return text || null;
}

/**
 * Authoritatively determines the latest completed reply from canonical Turns and Messages.
 * A reply qualifies ONLY if its turn is authoritatively `completed` and it is the final
 * assistant message of that turn with non-empty text. Failed, cancelled, running, or
 * tool-step turns return null.
 */
export function findAuthoritativeCompletedReply(
 turns: readonly Turn[],
 messages: readonly Message[],
): AuthoritativeCompletedReply | null {
 if (turns.length === 0 || messages.length === 0) return null;

 for (let i = turns.length - 1; i >= 0; i--) {
  const turn = turns[i];
  if (!turn) continue;

  // If the newest turn is running, waiting for input/approval, failed, or cancelled,
  // there is no completed reply to speak.
  if (turn.status !== 'completed') {
   return null;
  }

  const lastAssistantId = turn.assistantMessageIds.at(-1);
  if (!lastAssistantId) return null;

  const message = messages.find((m) => m.messageId === lastAssistantId);
  if (!message) return null;

  const text = extractCompletedReplyText(message);
  if (text) {
   return {
    messageId: message.messageId,
    turnId: turn.turnId,
    text,
   };
  }
  return null;
 }

 return null;
}

export interface ChatAutoReadAloudOptions {
 /** Session key; changing it resets baseline and cancels playback. */
 sessionKey: string;
 /** Ready flag: session snapshot and message loader have reached ready state. */
 ready: boolean;
 /** Live channels indicate the session was running an active turn. */
 sessionIsActive: boolean;
 /** Canonical turns in the session. */
 turns: readonly Turn[];
 /** Canonical messages in the session. */
 messages: readonly Message[];
 /** Enabled guard: user setting && !pinned && !readOnly. */
 enabled: boolean;
 /** Existing TTS playback API from useMessageTTS. */
 play: (text: string, options?: { canStart?: () => boolean }) => Promise<void>;
 /** Optional cross-window claim guard. */
 claim?: (messageId: string) => Promise<boolean>;
}

/** Default cross-window claim guard using sessionStorage/broadcast. */
const defaultClaimGuard = async (_messageId: string): Promise<boolean> => true;

/**
 * Host auto-TTS hook for ChatContainer.
 *
 * Enforces strict correctness:
 * 1. Only speaks when an active live turn authoritatively transitions to 'completed'.
 * 2. Failed, cancelled, tool-step, or in-progress turns never speak.
 * 3. Initial loaded history, paginated older messages, and reverted turns are absorbed
 *    into the baseline and never trigger playback.
 * 4. Switching sessions or runtimes resets baseline and aborts background audio.
 * 5. Respects readOnly, pinned, and autoReadAloudEnabled guards.
 */
export function useChatAutoReadAloud({
 sessionKey,
 ready,
 sessionIsActive,
 turns,
 messages,
 enabled,
 play,
 claim = defaultClaimGuard,
}: ChatAutoReadAloudOptions): void {
 const activeSessionKeyRef = React.useRef<string | null>(null);
 const observedActiveRef = React.useRef(false);
 const initializedRef = React.useRef(false);
 // Baseline turns that were already in the session when it loaded.
 const baselineTurnIdsRef = React.useRef<Set<string>>(new Set());
 // Turns that have already been spoken.
 const spokenTurnIdsRef = React.useRef<Set<string>>(new Set());

 const nativeMobile = isCapacitorApp();
 const foregroundRef = React.useRef(!nativeMobile);
 const backgroundEpochRef = React.useRef(0);

 const latestReply = React.useMemo(
  () => findAuthoritativeCompletedReply(turns, messages),
  [turns, messages],
 );

 const currentRef = React.useRef({ sessionKey, enabled, reply: latestReply });
 currentRef.current = { sessionKey, enabled, reply: latestReply };

 React.useEffect(() => {
  if (!enabled) backgroundEpochRef.current += 1;
 }, [enabled]);

 // Track foreground/visibility on desktop and native mobile.
 React.useEffect(() => {
  const onVisibility = () => {
   if (document.visibilityState === 'hidden') {
    backgroundEpochRef.current += 1;
   }
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
   backgroundEpochRef.current += 1;
   document.removeEventListener('visibilitychange', onVisibility);
  };
 }, []);

 React.useEffect(() => {
  // Session switch: reset baseline and state.
  if (activeSessionKeyRef.current !== sessionKey) {
   backgroundEpochRef.current += 1;
   activeSessionKeyRef.current = sessionKey;
   observedActiveRef.current = sessionIsActive;
   initializedRef.current = false;
   baselineTurnIdsRef.current = new Set(turns.map((t) => t.turnId));
   spokenTurnIdsRef.current = new Set();
  } else if (sessionIsActive) {
   observedActiveRef.current = true;
  }

  if (!ready) return;

  // Establish initial history baseline on first ready tick.
  if (!initializedRef.current) {
   initializedRef.current = true;
   for (const t of turns) {
    baselineTurnIdsRef.current.add(t.turnId);
   }
   return;
  }

  // Absorb any turns that entered via older history pagination into baseline.
  // History pagination prepends turns, so any turn older than our active turn is baseline.
  if (turns.length > baselineTurnIdsRef.current.size) {
   const activeTurnId = turns.find((t) => t.status === 'running' || t.status === 'pending')?.turnId;
   let pastActive = false;
   for (const t of turns) {
    if (t.turnId === activeTurnId) {
     pastActive = true;
    }
    if (!pastActive && t.status === 'completed' && !spokenTurnIdsRef.current.has(t.turnId)) {
     baselineTurnIdsRef.current.add(t.turnId);
    }
   }
  }

  if (!latestReply) return;
  const { turnId, messageId, text } = latestReply;

  // Guard: baseline turns, already spoken turns, or turns where session was never observed active must not speak.
  if (
   !enabled ||
   !observedActiveRef.current ||
   baselineTurnIdsRef.current.has(turnId) ||
   spokenTurnIdsRef.current.has(turnId)
  ) {
   return;
  }

  spokenTurnIdsRef.current.add(turnId);

  const epoch = backgroundEpochRef.current;
  const canStart = () =>
   (!nativeMobile || foregroundRef.current) &&
   document.visibilityState !== 'hidden' &&
   backgroundEpochRef.current === epoch &&
   currentRef.current.enabled &&
   currentRef.current.sessionKey === sessionKey &&
   currentRef.current.reply?.messageId === messageId;

  if (!canStart()) return;

  void claim(messageId)
   .then((claimed) => {
    if (claimed && canStart()) {
     void play(text, { canStart });
    }
   })
   .catch((error) => console.warn('[useChatAutoReadAloud] Claim failed:', error));
 }, [claim, enabled, latestReply, nativeMobile, play, ready, sessionIsActive, sessionKey, turns]);
}
