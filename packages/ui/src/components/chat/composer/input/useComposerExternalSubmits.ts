import type { useComposerSubmission } from './useComposerSubmission';
import type { useComposerSessionScope } from './useComposerSessionScope';
import type { useComposerSendAvailability } from './useComposerSendAvailability';
import type { useComposerSendActions } from './useComposerSendActions';
import type { useComposerSelection } from './useComposerSelection';
import type { useComposerDraftText } from './useComposerDraftText';
import type { useComposerColumn } from './useComposerColumn';
import type { ComposerSendHandlers } from './composerSendHandlers';
import React from 'react';
import { useInputStore } from '@/sync/input-store';
import { getChatDraftIdentityKey } from '@/lib/chatDraftPersistence';

type Dependencies = {
    draftText: Pick<ReturnType<typeof useComposerDraftText>, 'setMessage' | 'composerText'>;
    column: Pick<ReturnType<typeof useComposerColumn>, 'columnPinned'>;
    sendHandlers: Pick<ComposerSendHandlers, 'handleSubmitRef'>;
    sendAvailability: Pick<ReturnType<typeof useComposerSendAvailability>, 'getCurrentInputSnapshot'>;
    sessionScope: Pick<ReturnType<typeof useComposerSessionScope>, 'immediateBtwSubmitRef' | 'isBtwActive' | 'chatDraftIdentity' | 'pendingPresetSubmit' | 'newSessionDraftOpen' | 'newSessionDraft'>;
    submission: Pick<ReturnType<typeof useComposerSubmission>, 'handleSubmit'>;
    sendActions: Pick<ReturnType<typeof useComposerSendActions>, 'submitPresetPrompt'>;
    selection: Pick<ReturnType<typeof useComposerSelection>, 'configCatalogLoaded' | 'currentProviderId' | 'currentModelId' | 'mailboxTarget'>;
};

export function useComposerExternalSubmits({
    column, sessionScope, submission, sendActions,
}: Dependencies) {
    const { columnPinned } = column;
    const {
        immediateBtwSubmitRef, isBtwActive, chatDraftIdentity, pendingPresetSubmit,
    } = sessionScope;
    const { handleSubmit } = submission;
    const { submitPresetPrompt } = sendActions;

    React.useEffect(() => {
        const pending = immediateBtwSubmitRef.current;
        if (!pending || !isBtwActive || !chatDraftIdentity) return;
        if (getChatDraftIdentityKey(pending.identity) !== getChatDraftIdentityKey(chatDraftIdentity)) {
            immediateBtwSubmitRef.current = null;
            return;
        }
        immediateBtwSubmitRef.current = null;
        void handleSubmit({ presetText: pending.text });
    });

    React.useEffect(() => {
        if (pendingPresetSubmit == null || columnPinned) return;
        const text = useInputStore.getState().consumePendingPresetSubmit();
        if (text) submitPresetPrompt(text.text, text.type);
    }, [columnPinned, pendingPresetSubmit, submitPresetPrompt]);

}
