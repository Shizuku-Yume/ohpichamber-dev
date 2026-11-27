import type { useComposerSessionScope } from './useComposerSessionScope';
import type { useComposerEditorState } from './useComposerEditorState';
import type { useComposerColumn } from './useComposerColumn';
import { useDirectorySync } from '@/sync/sync-context';
import { resolveReasoningEffortToSend } from '@/components/chat/composer/submit/resolveReasoningEffort';
import React from 'react';
import { useConfigStore } from '@/stores/useConfigStore';
import { selectAgentsForDirectory, useAgentsStore } from '@/stores/useAgentsStore';
import { useCatalogReadiness } from '@/hooks/useCatalogReadiness';
import { usePinnedComposerSelection } from '../../pinnedComposerSelection';
import { buildModelMetadataKey } from '@/stores/config/metadata';

type Dependencies = {
    column: Pick<ReturnType<typeof useComposerColumn>, 'columnPinned'>;
    editorState: Pick<ReturnType<typeof useComposerEditorState>, 'composerFormRef'>;
    sessionScope: Pick<ReturnType<typeof useComposerSessionScope>, 'currentSessionId' | 'currentDirectory' | 'currentSessionDirectoryForSync' | 'isBtwActive' | 'btwComposerSessionId' | 'sessionAgentPick'>;
};

export function useComposerSelection({
    column, sessionScope,
}: Dependencies) {
    const { columnPinned } = column;
    const {
        currentSessionId, currentDirectory, currentSessionDirectoryForSync, sessionAgentPick,

    } = sessionScope;

    const pinnedComposerSelection = usePinnedComposerSelection({
        enabled: columnPinned,
        sessionId: currentSessionId,
        directory: currentDirectory ?? null,
    });

    const mailboxTarget = columnPinned ? currentSessionId : null;

    const shownSessionId = currentSessionId;

    const configProviderId = useConfigStore((state) => state.currentProviderId);

    const configModelId = useConfigStore((state) => state.currentModelId);

    const modelsReady = useCatalogReadiness('models', currentDirectory).isReady;
    const agentsReady = useCatalogReadiness('agents', currentDirectory).isReady;
    const configCatalogLoaded = modelsReady && agentsReady;

    const currentProviderId = pinnedComposerSelection?.model?.providerId ?? configProviderId;

    const currentModelId = pinnedComposerSelection?.model?.modelId ?? configModelId;

    const metadataCacheEntry = useConfigStore(
        React.useCallback(
            (state) => (currentProviderId && currentModelId
                ? state.modelsMetadata.get(buildModelMetadataKey(currentProviderId, currentModelId))
                : undefined),
            [currentProviderId, currentModelId],
        ),
    );

    const liveProviderModel = useConfigStore(
        React.useCallback(
            (state) => (currentProviderId && currentModelId
                ? state.providers.find((provider) => provider.providerId === currentProviderId)?.models.find((model) => model.modelId === currentModelId)
                : undefined),
            [currentProviderId, currentModelId],
        ),
    );

    const currentModelMetadata = React.useMemo(() => {
        if (!currentProviderId || !currentModelId) return undefined;
        void metadataCacheEntry;
        void liveProviderModel;
        return useConfigStore.getState().getModelMetadata(currentProviderId, currentModelId);
    }, [currentProviderId, currentModelId, metadataCacheEntry, liveProviderModel]);

    const configVariant = useConfigStore((state) => state.currentVariant);

    const currentVariant = pinnedComposerSelection ? pinnedComposerSelection.variant ?? undefined : configVariant;

    const configAgentName = useConfigStore((state) => state.currentAgentName);

    const currentAgentName = pinnedComposerSelection?.agent ?? sessionAgentPick ?? configAgentName;

    const setAgent = useConfigStore((state) => state.setAgent);

    const agents = useAgentsStore((state) => selectAgentsForDirectory(state, currentDirectory));

    const configReasoningEffort = useConfigStore((state) => state.currentReasoningEffort);

    const settingsDefaultReasoningEffort = useConfigStore((state) => state.settingsDefaultReasoningEffort);

    const configuredReasoningEffort = pinnedComposerSelection ? pinnedComposerSelection.reasoningEffort : configReasoningEffort;

    const persistedThinkingLevel = useDirectorySync(
        React.useCallback((state) => (
            currentSessionId ? state.snapshot[currentSessionId]?.selection?.thinkingLevel : undefined
        ), [currentSessionId]),
        currentSessionDirectoryForSync ?? currentDirectory ?? undefined,
    );

    const reasoningEffortForModel = React.useCallback((
        providerId: string | undefined,
        modelId: string | undefined,
        input: { captured?: { reasoningEffort?: string | null } | undefined; session?: string | null | undefined; native?: string | null | undefined; draft?: string | null | undefined },
    ): string | undefined => {
        if (!providerId || !modelId) return undefined;
        const model = useConfigStore.getState().providers
            .find((provider) => provider.providerId === providerId)?.models
            .find((candidate) => candidate.modelId === modelId);
        return resolveReasoningEffortToSend({ model, ompDefault: settingsDefaultReasoningEffort, ...input });
    }, [settingsDefaultReasoningEffort]);

    return {
        currentProviderId, currentModelId, currentModelMetadata, agents, mailboxTarget, shownSessionId,
        currentAgentName, currentVariant, configCatalogLoaded, setAgent,
        pinnedComposerSelection, configuredReasoningEffort, persistedThinkingLevel, reasoningEffortForModel
    };
}
