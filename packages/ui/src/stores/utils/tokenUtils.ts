import type { Message, Part } from '@openchamber/agent-contract';
import type { SessionContextUsage } from "../types/sessionTypes";

type TokenBreakdown = {
    input?: number;
    cache?: {
        read?: number;
        write?: number;
    };
};

export type ContextFillMessage = Pick<Message, 'messageId' | 'role' | 'usage'>;

type LatestContextFill = { state: 'measured'; index: number; totalTokens: number };

/** Canonical messages report measured usage; no compaction lifecycle is exposed. */
export const findLatestContextFill = (messages: readonly ContextFillMessage[]): LatestContextFill | null => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];

        if (message?.role !== 'assistant') continue;

        const totalTokens = message.usage?.totalTokens ?? 0;
        if (totalTokens > 0) return { state: 'measured', index, totalTokens };
    }

    return null;
};

const DEFAULT_THRESHOLD_LIMIT = 200_000;

/** Header-style context usage for a session's messages, shared by every surface that renders `ContextUsageDisplay`. */
export const buildSessionContextUsage = (
    messages: readonly ContextFillMessage[],
    contextLimit: number,
    outputLimit: number,
): SessionContextUsage | null => {
    const fill = findLatestContextFill(messages);
    if (!fill) return null;

    const limits = {
        contextLimit: contextLimit > 0 ? contextLimit : 0,
        outputLimit: outputLimit > 0 ? outputLimit : undefined,
        thresholdLimit: contextLimit > 0 ? contextLimit : DEFAULT_THRESHOLD_LIMIT,
        lastMessageId: messages[fill.index]?.messageId,
    };


    const output = messages[fill.index]?.usage?.output ?? 0;
    return {
        state: 'measured',
        ...limits,
        totalTokens: fill.totalTokens,
        percentage: contextLimit > 0 ? Math.round((fill.totalTokens / contextLimit) * 100) : 0,
        normalizedOutput: outputLimit > 0 ? Math.round((output / outputLimit) * 100) : undefined,
    };
};

export const isSameContextUsage = (a: SessionContextUsage | null, b: SessionContextUsage | null): boolean => {
    if (a === b) return true;
    if (!a || !b || a.state !== b.state) return false;

    const sameLimits = a.contextLimit === b.contextLimit
        && (a.outputLimit ?? 0) === (b.outputLimit ?? 0)
        && a.thresholdLimit === b.thresholdLimit
        && (a.lastMessageId ?? '') === (b.lastMessageId ?? '');
    if (!sameLimits) return false;
    if (a.state === 'compacted' || b.state === 'compacted') return true;

    return a.totalTokens === b.totalTokens
        && a.percentage === b.percentage
        && (a.normalizedOutput ?? 0) === (b.normalizedOutput ?? 0);
};

export const extractTokensFromMessage = (message: { info: Message; parts: Part[] }): number =>
    message.info.usage?.totalTokens ?? 0;

type CacheHitRateResult = {
    /** Cache hit rate as a 0-100 percentage. 0 when there is no input to compare against. */
    percent: number;
    /** True iff `breakdown` had a positive inclusive input total. When false, `percent` is meaningless. */
    hasInput: boolean;
};

/**
 * Compute prefix-cache hit rate from a token breakdown.
 *
 * The SDK reports `input` as the non-cached portion (total input minus
 * cache reads and cache writes). The full input processed by the model is
 * therefore:
 *
 *   totalInput = input + cache.read + cache.write
 *
 *   cacheHitRate = cache.read / totalInput
 *
 * Verified against the SDK source (`session.ts:getUsage`): `input` 
 * is `safe(inputTokens - cacheReadInputTokens - cacheWriteInputTokens)`.
 *
 * Returns `hasInput: false` when there is no total input to compare against,
 * in which case `percent` is 0 and callers should hide the display.
 */
export const computeCacheHitRate = (breakdown: TokenBreakdown | null | undefined): CacheHitRateResult => {
    if (!breakdown || typeof breakdown !== 'object') {
        return { percent: 0, hasInput: false };
    }

    const input = breakdown.input ?? 0;
    const cacheRead = breakdown.cache && typeof breakdown.cache === 'object' ? breakdown.cache.read ?? 0 : 0;
    const cacheWrite = breakdown.cache && typeof breakdown.cache === 'object' ? breakdown.cache.write ?? 0 : 0;
    const total = input + cacheRead + cacheWrite;

    if (total <= 0) {
        return { percent: 0, hasInput: false };
    }

    const safeRead = Math.max(0, cacheRead);
    const percent = Math.min(100, Math.max(0, (safeRead / total) * 100));
    return { percent, hasInput: true };
};
