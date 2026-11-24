import React from 'react';
import type { JsonValue, Subagent } from '@openchamber/agent-contract';
import { z } from 'zod';
import { useSubagentsStore } from '@/stores/useSubagentsStore';

const vibeSpawnInputSchema = z.object({
    name: z.string().trim().min(1).optional(),
});

const vibeSpawnDetailsSchema = z.object({
    spawned: z.object({
        id: z.string().trim().min(1),
    }).optional(),
});

const serializeVibeSpawnSubagent = (
    list: readonly Subagent[] | undefined,
    parentSessionId: string,
    toolCallId: string,
    workerId: string,
): string => {
    if (!list || list.length === 0) return '';
    const byToolCall = toolCallId
        ? list.find((child) => child.parentSessionId === parentSessionId && child.toolCallId === toolCallId && Boolean(child.childSessionId))
        : undefined;
    const byWorker = !byToolCall && workerId
        ? list.find((child) => child.parentSessionId === parentSessionId && (child.name === workerId || child.subagentId === workerId) && Boolean(child.childSessionId))
        : undefined;
    const matched = byToolCall ?? byWorker;
    if (!matched?.childSessionId) return '';
    const label = matched.name?.trim() || workerId || matched.role;
    return [matched.childSessionId, matched.role, label].join('\u0000');
};

export interface VibeSpawnSubtaskTarget {
    childSessionId: string;
    role: string;
    label: string;
}

export function useVibeSpawnSubtask(params: {
    enabled: boolean;
    parentSessionId: string | null | undefined;
    toolCallId: string;
    input: JsonValue | undefined;
    details: JsonValue | undefined;
    runtimeKey: string;
}): VibeSpawnSubtaskTarget | null {
    const { enabled, parentSessionId, toolCallId, input, details, runtimeKey } = params;

    const workerId = React.useMemo(() => {
        if (!enabled) return '';
        const fromDetails = vibeSpawnDetailsSchema.safeParse(details).data?.spawned?.id;
        if (fromDetails) return fromDetails;
        return vibeSpawnInputSchema.safeParse(input).data?.name ?? '';
    }, [details, enabled, input]);

    const subtaskKey = useSubagentsStore(
        React.useCallback(
            (state) => (enabled && parentSessionId
                ? serializeVibeSpawnSubagent(state.byParent[parentSessionId], parentSessionId, toolCallId, workerId)
                : ''),
            [enabled, parentSessionId, toolCallId, workerId],
        ),
    );

    React.useEffect(() => {
        if (!enabled || !parentSessionId || subtaskKey) return;
        void useSubagentsStore.getState().hydrateParent(parentSessionId);
    }, [enabled, parentSessionId, runtimeKey, subtaskKey]);

    return React.useMemo(() => {
        if (!subtaskKey) return null;
        const [childSessionId = '', role = '', label = ''] = subtaskKey.split('\u0000');
        if (!childSessionId) return null;
        return { childSessionId, role: role || 'subagent', label: label || role || 'subagent' };
    }, [subtaskKey]);
}
