import React from 'react';
import type { Session } from '@openchamber/agent-contract';
import type { BtwSelection } from '@/stores/useBtwStore';
import { useSelectionStore } from '@/sync/selection-store';
import { useSession } from '@/sync/sync-context';

/**
 * What a pinned composer sends with: the picks saved for its session. Canonical
 * sessions intentionally do not carry the legacy agent/model selection fields,
 * so an absent saved pick remains absent rather than being inferred.
 */
export const resolvePinnedComposerSelection = ({ savedAgent, savedModel, savedVariant }: {
    savedAgent: string | null;
    savedModel: { providerId: string; modelId: string } | null;
    savedVariant: string | null | undefined;
    record?: Session;
}): BtwSelection => ({
    // Canonical sessions intentionally do not expose legacy agent/model
    // selection fields. Saved composer choices are the only supported source.
    agent: savedAgent ?? undefined,
    model: savedModel,
    variant: savedVariant,
});

/**
 * The model, agent and effort a pinned column's composer (a chat open in the
 * side panel) sends with. The app-wide current model belongs to the main
 * chat, so a pinned composer keeps its own saved choices. Canonical session
 * records do not provide a fallback selection; null outside a pinned column.
 */
export const usePinnedComposerSelection = ({ enabled, sessionId, directory }: {
    enabled: boolean;
    sessionId: string | null;
    directory: string | null;
}): BtwSelection | null => {
    const key = enabled ? sessionId : null;
    const record = useSession(key ?? undefined, directory ?? undefined);
    const savedAgent = useSelectionStore((state) => (key ? state.sessionAgentSelections.get(key) ?? null : null));
    const savedModel = useSelectionStore((state) => (key ? state.sessionModelSelections.get(key) ?? null : null));
    const base = resolvePinnedComposerSelection({ savedAgent, savedModel, savedVariant: undefined, record });
    const savedVariant = useSelectionStore((state) => (key && base.agent && base.model
        ? state.getAgentModelVariantForSession(key, base.agent, base.model.providerId, base.model.modelId)
        : undefined));
    const { agent, model, variant } = resolvePinnedComposerSelection({ savedAgent, savedModel, savedVariant, record });
    const providerId = model?.providerId;
    const modelId = model?.modelId;
    return React.useMemo(() => {
        if (!key) return null;
        return {
            agent,
            model: providerId && modelId ? { providerId, modelId } : null,
            variant,
        };
    }, [agent, key, modelId, providerId, variant]);
};
