import { useEffect, useRef } from 'react';
import type { Turn } from '@openchamber/agent-contract';

import { claimReplyForAutoRead } from '@/lib/messages/autoReadClaims';
<<<<<<< HEAD
import type { LatestReply } from '@/lib/messages/latestReply';
=======
import { findCompletedReplyIds, type LatestReply, type LatestReplyRecord } from '@/lib/messages/latestReply';
>>>>>>> bc50ba56a
import { isCapacitorApp } from '@/lib/platform';
import type { PlayMessageTTSOptions } from './useMessageTTS';

export interface AutoReadAloudOptions {
<<<<<<< HEAD
 /** Identity of the session on screen; a switch starts a new baseline. */
 sessionKey: string;
 /** The session's message history is loaded for this session. */
 ready: boolean;
 /** The session is running a turn. */
 sessionIsActive: boolean;
 /** The answer to the session's newest prompt, or null when there is none. */
 reply: LatestReply | null;
 /** The session's turns: the newest one is the prompt whose answer may be read. */
 turns: readonly Turn[];
 enabled: boolean;
 play: (text: string, options?: PlayMessageTTSOptions) => Promise<void>;
 /** Claims a reply across windows so only one of them reads it. */
 claim?: (messageId: string) => Promise<boolean>;
}

/**
 * Reads the answer to the newest prompt after a turn this surface watched run.
 *
 * The newest canonical turn decides. Only its own open status counts as
 * watched, so a session flag that lags behind, history that arrives finished,
 * a page of older turns, or an answer that becomes newest again after a revert
 * never starts speech. One observed id plus one handled id is the whole state.
 */
export const useAutoReadAloud = ({
 sessionKey,
 ready,
 sessionIsActive,
 reply,
 turns,
 enabled,
 play,
 claim = claimReplyForAutoRead,
}: AutoReadAloudOptions): void => {
 const activeSessionKeyRef = useRef<string | null>(null);
 const observedLiveTurnIdRef = useRef<string | null>(null);
 const handledTurnIdRef = useRef<string | null>(null);
 const nativeMobile = isCapacitorApp();
 const foregroundRef = useRef(!nativeMobile);
 const backgroundEpochRef = useRef(0);
 const currentRef = useRef({ sessionKey, enabled, reply, turns });
 currentRef.current = { sessionKey, enabled, reply, turns };

 useEffect(() => {
  if (!enabled) backgroundEpochRef.current += 1;
 }, [enabled]);
=======
    /** Identity of the session on screen; a switch starts a new baseline. */
    sessionKey: string;
    /** The session's message history is loaded for this session. */
    ready: boolean;
    /** The session is running a turn, permission prompts included. */
    sessionIsActive: boolean;
    /** Newest completed answer in the session, or null when there is none. */
    reply: LatestReply | null;
    /** Loaded session history; every finished answer in it belongs to the baseline. */
    history: readonly LatestReplyRecord[];
    /** Completed answers fetched through older-history pagination. */
    olderCompletedReplyIds: ReadonlySet<string>;
    enabled: boolean;
    play: (text: string, options?: PlayMessageTTSOptions) => Promise<void>;
    /** Claims a reply across windows so only one of them reads it. */
    claim?: (messageId: string) => Promise<boolean>;
}

/**
 * Reads the newest completed answer after a turn that this surface watched
 * run. Every finished answer present when a session opens is recorded as the
 * baseline, so opening a conversation never starts playback and trimming back
 * to an older answer does not read it for the first time.
 */
export const useAutoReadAloud = ({
    sessionKey,
    ready,
    sessionIsActive,
    reply,
    history,
    olderCompletedReplyIds,
    enabled,
    play,
    claim = claimReplyForAutoRead,
}: AutoReadAloudOptions): void => {
    const activeSessionKeyRef = useRef<string | null>(null);
    const observedActiveRef = useRef(false);
    const initializedRef = useRef(false);
    const latestReplyIdRef = useRef<string | null>(null);
    // Every id this surface has already read, plus every answer present at
    // the baseline. Reverting or trimming a turn makes an older answer the
    // latest reply again, and it must not be read as if it just finished.
    const heardReplyIdsRef = useRef<Set<string>>(new Set());
    const nativeMobile = isCapacitorApp();
    const foregroundRef = useRef(!nativeMobile);
    const backgroundEpochRef = useRef(0);
    const currentRef = useRef({ sessionKey, enabled, reply });
    currentRef.current = { sessionKey, enabled, reply };

    useEffect(() => {
        if (!enabled) backgroundEpochRef.current += 1;
    }, [enabled]);

    useEffect(() => {
        let disposed = false;
        let removeNativeListener: (() => void) | undefined;
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') backgroundEpochRef.current += 1;
        };
        if (nativeMobile) {
            document.addEventListener('visibilitychange', onVisibility);
            void import('@capacitor/app').then(async ({ App }) => {
                let stateChanged = false;
                const listener = await App.addListener('appStateChange', ({ isActive }) => {
                    stateChanged = true;
                    foregroundRef.current = isActive;
                    if (!isActive) backgroundEpochRef.current += 1;
                });
                if (disposed) {
                    void listener.remove();
                    return;
                }
                removeNativeListener = () => void listener.remove();
                const state = await App.getState();
                if (!disposed && !stateChanged) foregroundRef.current = state.isActive;
            }).catch(() => {
                // Unknown native state must not authorize automatic speech.
                foregroundRef.current = false;
            });
        }
        return () => {
            disposed = true;
            backgroundEpochRef.current += 1;
            if (nativeMobile) document.removeEventListener('visibilitychange', onVisibility);
            removeNativeListener?.();
        };
    }, [nativeMobile]);

    useEffect(() => {
        if (activeSessionKeyRef.current !== sessionKey) {
            backgroundEpochRef.current += 1;
            activeSessionKeyRef.current = sessionKey;
            observedActiveRef.current = sessionIsActive;
            initializedRef.current = false;
            latestReplyIdRef.current = null;
            heardReplyIdsRef.current = new Set();
        } else if (sessionIsActive) {
            observedActiveRef.current = true;
        }
>>>>>>> bc50ba56a

 useEffect(() => {
  let disposed = false;
  let removeNativeListener: (() => void) | undefined;
  const onVisibility = () => {
   if (document.visibilityState === 'hidden') backgroundEpochRef.current += 1;
  };
  if (nativeMobile) {
   document.addEventListener('visibilitychange', onVisibility);
   void import('@capacitor/app').then(async ({ App }) => {
    let stateChanged = false;
    const listener = await App.addListener('appStateChange', ({ isActive }) => {
     stateChanged = true;
     foregroundRef.current = isActive;
     if (!isActive) backgroundEpochRef.current += 1;
    });
    if (disposed) {
     void listener.remove();
     return;
    }
    removeNativeListener = () => void listener.remove();
    const state = await App.getState();
    if (!disposed && !stateChanged) foregroundRef.current = state.isActive;
   }).catch(() => {
    // Unknown native state must not authorize automatic speech.
    foregroundRef.current = false;
   });
  }
  return () => {
   disposed = true;
   backgroundEpochRef.current += 1;
   if (nativeMobile) document.removeEventListener('visibilitychange', onVisibility);
   removeNativeListener?.();
  };
 }, [nativeMobile]);

<<<<<<< HEAD
 useEffect(() => {
  if (activeSessionKeyRef.current !== sessionKey) {
   backgroundEpochRef.current += 1;
   activeSessionKeyRef.current = sessionKey;
   observedLiveTurnIdRef.current = null;
   handledTurnIdRef.current = null;
  }
=======
        if (!initializedRef.current) {
            initializedRef.current = true;
            latestReplyIdRef.current = reply?.messageId ?? null;
            heardReplyIdsRef.current = new Set(findCompletedReplyIds(history));
            if (reply) heardReplyIdsRef.current.add(reply.messageId);
            return;
        }
>>>>>>> bc50ba56a

  const newestTurn = turns.at(-1);
  const newestTurnId = newestTurn?.turnId ?? null;
  // A guard that outlived the surface's readiness would let history this
  // surface never watched count as watched, so it is dropped whenever watching
  // stops for any reason other than the turn still being open.
  const watching = enabled && ready;
  if (!watching) {
   observedLiveTurnIdRef.current = null;
   return;
  }

<<<<<<< HEAD
  // The turn's own status, not the session's, says whether anything is still
  // open: a session flag can lag behind the arrival of the newest turn.
  const newestTurnIsOpen = newestTurn !== undefined
   && (newestTurn.status === 'running' || newestTurn.status === 'pending'
    || newestTurn.status === 'awaiting_approval' || newestTurn.status === 'awaiting_input');
  if (newestTurnIsOpen && newestTurnId) {
   observedLiveTurnIdRef.current = newestTurnId;
   return;
  }

  if (!newestTurn) return;
  const replyTurnId = reply ? newestTurn.turnId : null;
  if (!reply || !replyTurnId) return;
  // The turn itself has the final word: a failed or cancelled run can hand a
  // caller partial text, and that must never be spoken.
  if (newestTurn.status !== 'completed') return;
  if (observedLiveTurnIdRef.current !== replyTurnId) return;
  if (handledTurnIdRef.current === replyTurnId) return;

  handledTurnIdRef.current = replyTurnId;
  const epoch = backgroundEpochRef.current;
  const { messageId, text } = reply;
  const canStart = () => (!nativeMobile || (foregroundRef.current && document.visibilityState !== 'hidden'))
   && backgroundEpochRef.current === epoch
   && currentRef.current.enabled
   && currentRef.current.sessionKey === sessionKey
   && currentRef.current.reply?.messageId === messageId;
  if (!canStart()) return;
  void claim(messageId).then((claimed) => {
   if (claimed && canStart()) void play(text, { canStart });
  }).catch((error) => console.warn('[useAutoReadAloud] Claim failed:', error));
 }, [claim, enabled, nativeMobile, play, ready, reply, sessionIsActive, sessionKey, turns]);
=======
        latestReplyIdRef.current = reply.messageId;
        if (!enabled || !observedActiveRef.current || heardReplyIdsRef.current.has(reply.messageId) || olderCompletedReplyIds.has(reply.messageId)) {
            return;
        }

        heardReplyIdsRef.current.add(reply.messageId);
        const { messageId, text } = reply;
        const epoch = backgroundEpochRef.current;
        const canStart = () => (!nativeMobile || (foregroundRef.current && document.visibilityState !== 'hidden'))
            && backgroundEpochRef.current === epoch
            && currentRef.current.enabled
            && currentRef.current.sessionKey === sessionKey
            && currentRef.current.reply?.messageId === messageId;
        if (!canStart()) return;
        void claim(messageId).then((claimed) => {
            if (claimed && canStart()) void play(text, { canStart });
        }).catch((error) => console.warn('[useAutoReadAloud] Claim failed:', error));
    }, [claim, enabled, history, olderCompletedReplyIds, nativeMobile, play, ready, reply, sessionIsActive, sessionKey]);
>>>>>>> bc50ba56a
};
