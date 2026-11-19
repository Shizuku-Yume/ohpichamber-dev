import type { Message, Part } from '@openchamber/agent-contract';
import type { SessionContextUsage } from "../types/sessionTypes";

type TokenBreakdown = {
<<<<<<< HEAD
||||||| bc50ba56aa
    /** Server-reported window of the turn's final round-trip. Optional in the schema; absent on older servers. */
    total?: number;
=======
    total?: number;
>>>>>>> upstream/main
    input?: number;
    cache?: {
        read?: number;
        write?: number;
    };
};

export type ContextFillMessage = Pick<Message, 'messageId' | 'role' | 'usage'>;

type LatestContextFill = { state: 'measured'; index: number; totalTokens: number };

<<<<<<< HEAD
/** Canonical messages report measured usage; no compaction lifecycle is exposed. */
||||||| bc50ba56aa
    return inputTokens + outputTokens + reasoningTokens + cacheReadTokens + cacheWriteTokens;
};

/**
 * Tokens the context window actually holds, from one message's token payload.
 *
 * The breakdown fields accumulate across every API round-trip inside a single
 * assistant turn: each tool call re-reads the whole (cached) prompt, so on a
 * multi-step turn `cache.read` alone can add up to several times the context
 * window (observed on opencode 1.18.18: cache.read 3,291,956 on a turn whose
 * 1M window really held 232,872 — rendered as a 330% context readout). The
 * server reports the final round-trip's window as `tokens.total` (optional in
 * the message schema, absent on older servers). Prefer it; fall back to
 * summing the fields only when the server did not send it.
 */
export const contextTokensFromBreakdown = (breakdown: TokenBreakdown | null | undefined): number => {
    if (!breakdown || typeof breakdown !== 'object') {
        return 0;
    }

    const reportedTotal = breakdown.total;
    if (typeof reportedTotal === 'number' && Number.isFinite(reportedTotal) && reportedTotal > 0) {
        return reportedTotal;
    }

    return sumTokenBreakdown(breakdown);
};

export type ContextFillMessage = {
    id?: string;
    role?: string;
    tokens?: TokenBreakdown;
    /**
     * Compaction records carry OpenCode's lifecycle for the summarizing turn
     * here. Widened to `string` so a whole `Message` (a shell record reports its
     * own statuses) still satisfies this reader.
     */
    status?: string;
    error?: AssistantMessage['error'];
};

type LatestContextFill =
    | { state: 'measured'; index: number; totalTokens: number }
    /** Compacted since the last measured response; the current size is unknown. */
    | { state: 'compacted'; index: number };

/**
 * What the context window holds now, read from the newest message that can say.
 *
 * A compaction's own assistant record describes the summarizing request, not
 * the window left behind: its input is the pre-compaction history, and its
 * output leaves out the system prompt, the tools and the recent tail OpenCode
 * keeps. No number is right until the next response reports tokens, so a
 * finished compaction yields `compacted` instead of falling back to an older,
 * pre-compaction response. A compaction still running or one that failed has
 * not changed the window, so it is skipped and the previous reading stands.
 * OpenCode v2 records a compaction as its own `compaction` message carrying
 * that lifecycle in `status`, so "finished" is `status === 'completed'` with
 * no error rather than the v1 `summary && finish && !error` heuristic.
 */
=======
    return inputTokens + outputTokens + reasoningTokens + cacheReadTokens + cacheWriteTokens;
};

export const contextTokensFromBreakdown = (breakdown: TokenBreakdown | null | undefined): number => {
    if (!breakdown || typeof breakdown !== 'object') {
        return 0;
    }

    const reportedTotal = breakdown.total;
    if (typeof reportedTotal === 'number' && Number.isFinite(reportedTotal) && reportedTotal > 0) {
        return reportedTotal;
    }

    return sumTokenBreakdown(breakdown);
};

export type ContextFillMessage = {
    id?: string;
    role?: string;
    tokens?: TokenBreakdown;
    status?: string;
    error?: AssistantMessage['error'];
};

type LatestContextFill =
    | { state: 'measured'; index: number; totalTokens: number }
    | { state: 'compacted'; index: number };

>>>>>>> upstream/main
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
    percent: number;
    hasInput: boolean;
};

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
