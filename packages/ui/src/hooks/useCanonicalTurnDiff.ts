import React from 'react';
import type { TurnDiff, TurnDiffState } from '@openchamber/agent-contract';

import { canonicalClient } from '@/api/canonicalClient';
import { getRuntimeKey } from '@/lib/runtime-switch';

export type CanonicalTurnDiffState = TurnDiffState | 'loading';

export interface CanonicalTurnDiffResult {
    diff: TurnDiff | null;
    state: CanonicalTurnDiffState;
    error: string | null;
    retry: () => void;
}

const cache = new Map<string, TurnDiff>();

const cacheKey = (sessionId: string, turnId: string): string => `${getRuntimeKey()}\0${sessionId}\0${turnId}`;

export const clearCanonicalTurnDiffCache = (): void => {
    cache.clear();
};

type Resolution =
    | { kind: 'diff'; key: string; diff: TurnDiff }
    | { kind: 'error'; key: string; message: string };

export function useCanonicalTurnDiff(
    sessionId: string | null,
    turnId: string | undefined,
    { enabled, refetchSignal = 0, mutable = false }: { enabled: boolean; refetchSignal?: number | string; mutable?: boolean },
): CanonicalTurnDiffResult {
    const key = sessionId && turnId ? cacheKey(sessionId, turnId) : null;
    const cached = !mutable && key ? cache.get(key) ?? null : null;
    const [resolution, setResolution] = React.useState<Resolution | null>(null);
    const [attempt, nextAttempt] = React.useReducer((value: number) => value + 1, 0);
    const retry = React.useCallback(() => {
        setResolution(null);
        nextAttempt();
    }, []);

    React.useEffect(() => {
        if (!enabled || !sessionId || !turnId || !key) return;
        if (!mutable && cache.has(key)) return;
        let cancelled = false;
        void canonicalClient.getTurnDiff(sessionId, turnId)
            .then((diff) => {
                if (cancelled) return;
                if (!mutable && diff.state !== 'failed') {
                    cache.set(key, diff);
                }
                setResolution({ kind: 'diff', key, diff });
            })
            .catch((error) => {
                if (cancelled) return;
                setResolution({ kind: 'error', key, message: error instanceof Error && error.message ? error.message : 'The turn diff request failed.' });
            });
        return () => {
            cancelled = true;
        };
    }, [enabled, sessionId, turnId, key, attempt, refetchSignal, mutable]);

    const own = resolution && resolution.key === key ? resolution : null;
    const resolvedDiff = cached ?? (own?.kind === 'diff' ? own.diff : null);
    const error = own?.kind === 'error' ? own.message : null;
    const state: CanonicalTurnDiffState = resolvedDiff
        ? resolvedDiff.state
        : error
            ? 'failed'
            : 'loading';
    return {
        diff: resolvedDiff,
        state,
        error,
        retry,
    };
}
