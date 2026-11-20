import React from 'react';
import type { Session } from '@openchamber/agent-contract';
import { ROOT_SELECTION_AGENT, useSelectionStore } from '@/sync/selection-store';
import { useSession } from '@/sync/sync-context';

export type ComposerModelSelection = {
    agent: string | undefined;
    model: { providerId: string; modelId: string } | null;
    variant: string | null | undefined;
    reasoningEffort?: string;
};

/**
 * What a pinned composer sends with: the picks saved for its session. Canonical
 * sessions intentionally do not carry the legacy agent/model selection fields,
 * so an absent saved pick remains absent rather than being inferred.
 */
export const resolvePinnedComposerSelection = ({ savedAgent, savedModel, savedVariant, savedReasoningEffort }: {
    savedAgent: string | null;
    savedModel: { providerId: string; modelId: string } | null;
    savedVariant: string | null | undefined;
    savedReasoningEffort?: string;
    record?: Session;
}): ComposerModelSelection => ({
    // Canonical sessions intentionally do not expose legacy agent/model
    // selection fields. Saved composer choices are the only supported source.
    agent: savedAgent ?? undefined,
    model: savedModel,
    variant: savedVariant,
    reasoningEffort: savedReasoningEffort,
});

export const usePinnedComposerSelection = ({ enabled, sessionId, directory }: {
    enabled: boolean;
    sessionId: string | null;
    directory: string | null;
}): ComposerModelSelection | null => {
    const key = enabled ? sessionId : null;
    const record = useSession(key ?? undefined, directory ?? undefined);
    const savedAgent = useSelectionStore((state) => (key ? state.sessionAgentSelections.get(key) ?? null : null));
    const savedModel = useSelectionStore((state) => (key ? state.sessionModelSelections.get(key) ?? null : null));
    const base = resolvePinnedComposerSelection({ savedAgent, savedModel, savedVariant: undefined, record });
    const savedVariant = useSelectionStore((state) => (key && base.agent && base.model
        ? state.getAgentModelVariantForSession(key, base.agent, base.model.providerId, base.model.modelId)
        : undefined));
    const savedReasoningEffort = useSelectionStore((state) => (key && base.model
        ? state.getAgentModelReasoningEffortForSession(key, base.agent ?? ROOT_SELECTION_AGENT, base.model.providerId, base.model.modelId)
        : undefined));
    const { agent, model, variant, reasoningEffort } = resolvePinnedComposerSelection({ savedAgent, savedModel, savedVariant, savedReasoningEffort, record });
    const providerId = model?.providerId;
    const modelId = model?.modelId;
    return React.useMemo(() => {
        if (!key) return null;
        return {
            agent,
            model: providerId && modelId ? { providerId, modelId } : null,
            variant,
            reasoningEffort,
        };
    }, [agent, key, modelId, providerId, reasoningEffort, variant]);
};
