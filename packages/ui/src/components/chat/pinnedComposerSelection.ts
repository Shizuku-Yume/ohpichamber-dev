import React from 'react';
import type { Session } from '@openchamber/agent-contract';
import { ROOT_SELECTION_AGENT, useSelectionStore } from '@/sync/selection-store';
import { useSession } from '@/sync/sync-context';

<<<<<<< HEAD
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
||||||| bc50ba56aa
/**
 * What a pinned composer sends with: the picks saved for its session first,
 * then the session record, which is what OpenCode 2 runs the next prompt on.
 * An effort saved for the picked agent and model wins over the record's; an
 * effort saved as `null` is an explicit "Default".
 */
export const resolvePinnedComposerSelection = ({ savedAgent, savedModel, savedVariant, record }: {
=======
const isNoEffort = (variant: string) => variant === 'default';

const recordVariant = (record: Pick<Session, 'model'> | undefined): string | undefined => {
    const variant = record?.model?.variant?.trim();
    return variant && !isNoEffort(variant) ? variant : undefined;
};

const savedPick = (variant: string | null): string | null => (
    variant !== null && isNoEffort(variant.trim()) ? null : variant
);

export const resolvePinnedComposerSelection = ({ savedAgent, savedModel, savedVariant, record }: {
>>>>>>> upstream/main
    savedAgent: string | null;
    savedModel: { providerId: string; modelId: string } | null;
    savedVariant: string | null | undefined;
<<<<<<< HEAD
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
||||||| bc50ba56aa
    record: Pick<Session, 'agent' | 'model'> | undefined;
}): BtwSelection => {
    const recordModel = record?.model?.providerID && record.model.id
        ? { providerId: record.model.providerID, modelId: record.model.id }
        : null;
    return {
        agent: savedAgent ?? (record?.agent?.trim() || undefined),
        model: savedModel ?? recordModel,
        variant: savedVariant !== undefined ? savedVariant : record?.model?.variant?.trim() || undefined,
    };
};
=======
    record: Pick<Session, 'agent' | 'model'> | undefined;
}): BtwSelection => {
    const recordModel = record?.model?.providerID && record.model.id
        ? { providerId: record.model.providerID, modelId: record.model.id }
        : null;
    return {
        agent: savedAgent ?? (record?.agent?.trim() || undefined),
        model: savedModel ?? recordModel,
        variant: savedVariant !== undefined ? savedPick(savedVariant) : recordVariant(record),
    };
};
>>>>>>> upstream/main

<<<<<<< HEAD
/**
 * The model, agent and effort a pinned column's composer (a chat open in the
 * side panel) sends with. The app-wide current model belongs to the main
 * chat, so a pinned composer keeps its own saved choices. Canonical session
 * records do not provide a fallback selection; null outside a pinned column.
 */
||||||| bc50ba56aa
/**
 * The model, agent and effort a pinned column's composer (a chat open in the
 * side panel) sends with. The app-wide current model belongs to the main
 * chat, so a pinned composer keeps its own: what was picked in it, saved for
 * its session the way the `/btw` composer saves its picks, and otherwise what
 * the session record names. Null outside a pinned column.
 */
=======
>>>>>>> upstream/main
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
