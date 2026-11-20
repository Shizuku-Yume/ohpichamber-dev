import React from 'react';

import { useAssistantStatus } from '@/hooks/useAssistantStatus';
import { useConfigStore } from '@/stores/useConfigStore';
import { getProviderModelDisplayName } from '@/lib/modelDisplay';
import { StatusRow } from './StatusRow';

export const StatusRowContainer: React.FC = React.memo(() => {
    const { activeModel, working } = useAssistantStatus();
    const providers = useConfigStore((state) => state.providers);

    const modelDisplayName = React.useMemo(() => {
        if (!activeModel) {
            return null;
        }
        const provider = providers.length > 0
            ? providers.find((candidate) => candidate.providerId === activeModel.providerId)
            : undefined;
        return getProviderModelDisplayName(provider, activeModel.modelId) || null;
    }, [activeModel, providers]);

    return (
        <StatusRow
            isWorking={working.isWorking}
            status={working.status}
            isWaitingForPermission={working.isWaitingForPermission}
            abortActive={working.abortActive}
            retryInfo={working.retryInfo}
            modelName={modelDisplayName}
            providerId={activeModel?.providerId ?? null}
        />
    );
});

StatusRowContainer.displayName = 'StatusRowContainer';
