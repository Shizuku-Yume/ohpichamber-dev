import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { useComposerSelection } from './useComposerSelection';
import { useConfigStore } from '@/stores/useConfigStore';
import type { ModelMetadata } from '@/types';
import { ChildStoreManager } from '@/sync/child-store';
import { SyncRuntimeContext } from '@/sync/sync-context';
import { SessionMessageLoader } from '@/sync/session-message-loader';
import { nativeClient } from '@/sync/session-message-loader-test-fixtures';
import { getRuntimeKey } from '@/lib/runtime-switch';
import type { SyncRuntime } from '@/sync/sync-runtime-context';

const metadata = (): ModelMetadata => ({
    id: 'gpt-6-astra',
    providerId: 'openai',
    name: 'GPT-6 Astra',
    limit: { context: 1_050_000, output: 128_000 },
});

const liveModel = (contextWindow: number) => ({
    modelId: 'gpt-6-astra',
    provider: 'openai',
    name: 'GPT-6 Astra',
    modalities: ['text' as const],
    contextWindow,
    maxOutputTokens: 128_000,
    reasoningEffortSupported: false,
    reasoningOptions: [],
    variants: [],
    toolsSupported: true,
    enabled: true,
    status: 'active' as const,
    pricing: null,
});

const liveProvider = (contextWindow: number) => ({
    providerId: 'openai',
    name: 'openai',
    endpoint: null,
    protocol: null,
    authMethods: [],
    auth: { status: 'missing' as const },
    models: [liveModel(contextWindow)],
});

describe('useComposerSelection currentModelMetadata', () => {
    let windowInstance: Window;
    let root: Root | null;
    let snapshot: ModelMetadata | undefined;
    let sync: SyncRuntime;

    const Harness = () => {
        // SAFETY: the metadata path under test reads only these members; the
        // selection hook's other inputs never run on this branch.
        const selection = useComposerSelection({
            column: { columnPinned: false } as never,
            editorState: { composerFormRef: { current: null } } as never,
            sessionScope: {
                currentSessionId: null,
                currentDirectory: '/repo',
                currentSessionDirectoryForSync: null,
                isBtwActive: false,
                btwComposerSessionId: null,
                sessionAgentPick: null,
            } as never,
        });
        snapshot = selection.currentModelMetadata;
        return null;
    };

    beforeEach(async () => {
        windowInstance = new Window({ url: 'http://localhost' });
        Object.assign(globalThis, { window: windowInstance, document: windowInstance.document, navigator: windowInstance.navigator, IS_REACT_ACT_ENVIRONMENT: true });
        useConfigStore.setState({
            currentProviderId: 'openai',
            currentModelId: 'gpt-6-astra',
            providers: [liveProvider(400_000)],
            modelsMetadata: new Map([['openai/gpt-6-astra', metadata()]]),
        });
        const childStores = new ChildStoreManager();
        const client = nativeClient();
        const runtimeKey = getRuntimeKey();
        sync = {
            childStores, client, runtimeKey,
            messageLoader: new SessionMessageLoader(childStores, { client, runtimeKey }),
            currentDirectory: { get: () => '/repo', subscribe: () => () => undefined },
        };
        snapshot = undefined;
        const host = document.createElement('div');
        document.body.append(host);
        root = createRoot(host);
        await act(async () => root!.render(
            <SyncRuntimeContext.Provider value={sync}>
                <Harness />
            </SyncRuntimeContext.Provider>,
        ));
    });

    afterEach(async () => {
        await act(async () => root!.unmount());
        root = null;
        void windowInstance.happyDOM.close();
    });

    test('resolves the provider catalog limit over the cached models.dev limit', () => {
        expect(snapshot?.limit).toEqual({ context: 400_000, output: 128_000 });
    });

    test('re-reads the metadata when the live provider catalog changes its context window', async () => {
        await act(async () => {
            useConfigStore.setState({ providers: [liveProvider(200_000)] });
        });
        expect(snapshot?.limit).toEqual({ context: 200_000, output: 128_000 });
    });

    test('re-reads the metadata when the models.dev metadata cache changes', async () => {
        await act(async () => {
            useConfigStore.setState({ modelsMetadata: new Map() });
        });
        await act(async () => {
            useConfigStore.setState({ modelsMetadata: new Map([['openai/gpt-6-astra', metadata()]]) });
        });
        expect(snapshot?.name).toBe('GPT-6 Astra');
        expect(snapshot?.limit).toEqual({ context: 400_000, output: 128_000 });
    });
});
