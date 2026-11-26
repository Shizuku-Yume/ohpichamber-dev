import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { plugin } from 'bun';
import { pathToFileURL } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { CanonicalClient } from '@/api/canonicalClient';
import type { Part } from '@openchamber/agent-contract';
import { I18nProvider, useI18nStore } from '@/lib/i18n';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import type { RuntimeAPIs } from '@/lib/api/types';
import { SyncProvider } from '@/sync/sync-context';
import { useUIStore } from '@/stores/useUIStore';
import { DedicatedMobileAppProvider, type MobileAppActions } from '@/apps/mobileAppContext';
import { ChatColumnSessionContext } from '../chatColumnSession';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { projectTurnRecords } from '../lib/turns/projectTurnRecords';
import type { ChatMessageEntry, TurnChangedFile, TurnRecord } from '../lib/turns/types';


plugin({
    name: 'live-activity-provider-logos',
    setup(build) {
        // Expand Vite's eager asset glob into the same real file URL map for
        // Bun. This is a loader transform, not a replacement of the logo hook.
        build.onLoad({ filter: /useProviderLogo\.ts$/ }, ({ path }) => {
            const folder = resolve(dirname(path), '../assets/provider-logos');
            const logos = Object.fromEntries(readdirSync(folder).filter((name) => name.endsWith('.svg'))
                .map((name) => [`../assets/provider-logos/${name}`, pathToFileURL(resolve(folder, name)).href]));
            const contents = readFileSync(path, 'utf8').replace(/import\.meta\.glob<string>\([\s\S]*?\);/, `${JSON.stringify(logos)};`);
            return { contents, loader: 'ts' };
        });
    },
});

// Loaded after the plugin: its imports reach the logo glob that Bun cannot
// expand on its own.
const { TurnFold, TurnPagesRow } = await import('./LiveTurnActivity');
const { buildTimelineRows } = await import('../lib/turns/timelineRows');
const { useTurnFoldContexts } = await import('./useTurnFold');
const { LiveFinalActivityContext, LiveTurnHoistedPagesContext } = await import('./liveActivityContext');
const { MessageSliceContext } = await import('../message/messageSliceContext');

const unavailable = (): never => { throw new Error('Activity rendering must not call runtime APIs'); };
const runtimeApis: RuntimeAPIs = {
    runtime: { platform: 'web', isDesktop: false, isVSCode: false },
    get terminal() { return unavailable(); },
    get git() { return unavailable(); },
    get sourceControl() { return unavailable(); },
    get files() { return unavailable(); },
    get settings(): RuntimeAPIs['settings'] {
        return {
            load: async () => ({ settings: {}, source: 'web' }),
            save: async (changes) => changes as RuntimeAPIs['settings'] extends { save(_c: infer _C): Promise<infer R> } ? R : never,
        };
    },
    get permissions() { return unavailable(); },
    get notifications() { return unavailable(); },
};
const client = new CanonicalClient();
// The answer's action bar also has an aria-expanded button, the branch menu
// trigger, so the changed-file toggle is the one that opens no popup.
const changedFilesToggle = () => document.querySelector<HTMLButtonElement>('[data-fixture-message="final"] button[aria-expanded]:not([aria-haspopup])');
let MessageBody: typeof import('../message/MessageBody').default;

function assistant(messageId: string, parts: Part[]): ChatMessageEntry {
    return { messageId, sessionId: 'session', turnId: 'turn', role: 'assistant', createdAt: 2, parts };
}
function text(partId: string, content: string): Part {
    return { type: 'text', partId, content };
}
const readParts: Part[] = [
    { type: 'tool_call', partId: 'read-call-part', toolCallId: 'read-call', toolName: 'read', input: { filePath: '/project/source.ts' }, status: 'completed' },
    { type: 'tool_result', partId: 'read-result', toolCallId: 'read-call', toolName: 'read', output: 'code', isError: false },
];
const editParts: Part[] = [
    { type: 'tool_call', partId: 'edit-call-part', toolCallId: 'edit-call', toolName: 'edit', input: { path: 'src/source.ts', old_string: 'old', new_string: 'new' }, status: 'completed' },
    {
        type: 'tool_result', partId: 'edit-result', toolCallId: 'edit-call', toolName: 'edit', isError: false,
        output: { content: [{ type: 'text', text: 'Updated src/source.ts' }], details: { path: '[workspace]/src/source.ts', diff: '-1|old\n+1|new\n+2|added', op: 'update' } }
    },
];

function turn(messages: ChatMessageEntry[]): TurnRecord {
    return projectTurnRecords([{
        messageId: 'user', sessionId: 'session', turnId: 'turn', role: 'user', createdAt: 1,
        parts: [text('request', 'Request')],
    }, ...messages], { showTurnChangedFiles: true }).turns[0];
}

// The rows a turn under a fold becomes in the list, drawn the way MessageList draws them.
function TurnRows({ record, retired, expanded, keepText = false, onToggle, renderMessage }: {
    record: TurnRecord;
    retired: boolean;
    expanded: boolean;
    keepText?: boolean;
    onToggle: () => void;
    renderMessage: (message: ChatMessageEntry) => React.ReactNode;
}) {
    const rows = buildTimelineRows([{ kind: 'turn', key: 'turn', turn: record, isLastTurn: true, hasLaterAssistant: retired }], {
        collapsedActivity: true, keepActivityText: keepText, expandedTurns: new Map([[record.turnId, expanded]]), showReasoningTraces: true,
    }, []);
    const finalMessageId = rows.find((row) => row.kind === 'turn-fold')?.finalMessageId;
    const { hoistedPages, finalContext } = useTurnFoldContexts(record, retired, expanded, finalMessageId, keepText);
    return <LiveTurnHoistedPagesContext.Provider value={hoistedPages}>
        {rows.map((row) => {
            if (row.kind === 'turn-fold') {
                return <TurnFold key={row.key} turn={record} hasLaterAssistant={retired} expanded={expanded}
                    finalMessageId={row.finalMessageId} keepText={keepText} onToggle={onToggle} renderMessage={renderMessage} />;
            }
            if (row.kind === 'turn-pages') return <TurnPagesRow key={row.key} turn={record} keepText={keepText} />;
            if (row.kind !== 'turn-message') return null;
            const message = record.assistantMessages.find((candidate) => candidate.messageId === row.messageId);
            if (!message) return null;
            return <MessageSliceContext.Provider key={row.key} value={row.slice}>
                {row.final ? <LiveFinalActivityContext.Provider value={finalContext}>{renderMessage(message)}</LiveFinalActivityContext.Provider> : renderMessage(message)}
            </MessageSliceContext.Provider>;
        })}
    </LiveTurnHoistedPagesContext.Provider>;
}

function Harness({ record, noticeOpened = false, keepText = false, retired = false, changedFiles, isLatestTurn = true, mobileActions = null }: {
    record: TurnRecord;
    noticeOpened?: boolean;
    retired?: boolean;
    keepText?: boolean;
    changedFiles?: TurnChangedFile[];
    isLatestTurn?: boolean;
    mobileActions?: MobileAppActions | null;
}) {
    const [expanded, setExpanded] = React.useState(false);
    const renderMessage = (message: ChatMessageEntry) => (
        <div key={message.messageId} data-fixture-message={message.messageId}>
            <MessageBody
                messageId={message.messageId} parts={message.parts} isUser={false}
                isMessageCompleted={isLatestTurn || retired} isMobile={mobileActions !== null} copiedCode={null} onCopyCode={() => undefined} expandedTools={new Set()}
                onToggleTool={() => undefined} onShowPopup={() => undefined} streamPhase="completed" allowAnimation={false}
                hasTextContent={message.parts.some((part) => part.type === 'text')} showReasoningTraces
                turnGroupingContext={{
                    turnId: 'user', snapshotTurnId: noticeOpened ? undefined : 'user', isFirstAssistantInTurn: message === record.assistantMessages[0],
                    isLastAssistantInTurn: message === record.assistantMessages.at(-1),
                    isLatestTurn, changedFiles, isWorking: false, hasTools: record.hasTools, hasReasoning: record.hasReasoning,
                }}
            />
        </div>
    );
    const content = <RuntimeAPIContext.Provider value={runtimeApis}>
        <SyncProvider client={client} directory="/project">
            <I18nProvider>
                <TurnRows record={record} retired={retired} expanded={expanded} keepText={keepText}
                    onToggle={() => setExpanded((value) => !value)} renderMessage={renderMessage} />
            </I18nProvider>
        </SyncProvider>
    </RuntimeAPIContext.Provider>;
    return mobileActions
        ? <DedicatedMobileAppProvider actions={mobileActions}>{content}</DedicatedMobileAppProvider>
        : content;
}

// The first test pays for loading the real message body and for its first
// render. Under the full parallel suite that crossed the 5 second default on
// Windows; later tests take well under a second.
setDefaultTimeout(30_000);

describe('live Activity with the real message body', () => {
    let root: Root;
    let container: HTMLDivElement;
    let restore: () => void;
    beforeEach(async () => {
        const win = new Window({ url: 'http://localhost', settings: { device: { prefersReducedMotion: 'reduce' } } });
        const globals = {
            window: win, document: win.document, Event: win.Event, CustomEvent: win.CustomEvent, navigator: win.navigator, localStorage: win.localStorage,
            customElements: win.customElements,
            Node: win.Node, NodeList: win.NodeList, Element: win.Element, HTMLElement: win.HTMLElement, SVGElement: win.SVGElement,
            HTMLAnchorElement: win.HTMLAnchorElement,
            MutationObserver: win.MutationObserver, ResizeObserver: win.ResizeObserver,
            requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
            getComputedStyle: win.getComputedStyle.bind(win), IS_REACT_ACT_ENVIRONMENT: true,
        };
        const previous = Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
        for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
        // Reduced motion makes the disclosure lifecycle deterministic without
        // replacing the real component or animation module.
        restore = () => {
            for (const [name, descriptor] of previous) {
                if (descriptor) Object.defineProperty(globalThis, name, descriptor);
                else Reflect.deleteProperty(globalThis, name);
            }
        };
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        useUIStore.setState({
            chatRenderMode: 'live', collapsibleThinkingBlocks: false, showSplitAssistantMessageActions: false,
            contextPanelByDirectory: {}, pendingDiffFile: 'existing.ts', pendingDiffScope: 'working',
            pendingFileFocusPath: null, isMobile: false,
        });
        useDirectoryStore.setState({ currentDirectory: '/project' });
        useI18nStore.getState().setLocale('en');
        MessageBody = (await import('../message/MessageBody')).default;
    });
    afterEach(async () => {
        await act(async () => root.unmount());
        restore();
    });

    test('keeps active prose and tools visible; stop folds history but leaves the answer', async () => {
        const progress = assistant('progress', [text('progress-text', 'Checking the source'), ...readParts]);
        await act(async () => root.render(<Harness record={turn([progress])} />));
        expect(container.textContent).toContain('Checking the source');
        expect(container.querySelector('button[aria-controls]')?.getAttribute('aria-expanded')).toBe('false');
        expect(container.textContent).toContain('Activity');
        const final = assistant('final', [text('final-text', 'The final answer')]);
        await act(async () => root.render(<Harness record={turn([progress, final])} />));
        expect(container.textContent).toContain('The final answer');
        expect(container.textContent).not.toContain('Checking the source');
        const header = container.querySelector<HTMLButtonElement>('button[aria-controls]');
        expect(header?.getAttribute('aria-expanded')).toBe('false');
        expect(header?.textContent).toContain('Explored codebase');
        await act(async () => header?.click());
        expect(header?.textContent).toContain('Explored codebase');
        expect(container.textContent).toContain('Checking the source');
        expect(container.textContent).toContain('The final answer');
        await act(async () => root.render(<Harness record={turn([progress, { ...final, parts: [...final.parts] }])} />));
        expect(header?.getAttribute('aria-expanded')).toBe('true');
    });

    test('keeps thinking in the final message inside Activity, not outside with the answer', async () => {
        const thinking: Part = { type: 'reasoning', partId: 'thinking', content: 'Private reasoning content' };
        const final = assistant('final', [thinking, text('final-text', 'Public answer')]);
        await act(async () => root.render(<Harness record={turn([final])} />));
        expect(container.textContent).toContain('Public answer');
        expect(container.textContent).not.toContain('Private reasoning content');
        await act(async () => container.querySelector<HTMLButtonElement>('button[aria-controls]')?.click());
        expect(container.textContent).toContain('Private reasoning content');
        expect(container.textContent).toContain('Public answer');
    });

    test('an interrupted turn folds all prose without fabricating a final answer', async () => {
        const record = turn([assistant('progress', [text('progress-text', 'Still working'), ...readParts])]);
        await act(async () => root.render(<Harness record={record} />));
        expect(container.textContent).toContain('Still working');
        expect(container.textContent).toContain('Activity');
        await act(async () => root.render(<Harness record={record} retired />));
        expect(container.textContent).not.toContain('Still working');
        expect(container.textContent).toContain('Activity');
        await act(async () => container.querySelector<HTMLButtonElement>('button[aria-controls]')?.click());
        expect(container.textContent).toContain('Still working');
    });

    test('keeps file statistics visible when expanded', async () => {
        const edit = editParts;
        await act(async () => root.render(<Harness record={turn([
            assistant('progress', edit),
            assistant('final', [text('answer', 'Done')]),
        ])} />));
        const header = container.querySelector<HTMLButtonElement>('button[aria-controls]');
        expect(header?.textContent).toContain('Changed 1 file');
        expect(header?.textContent).toContain('+2 −1');
        await act(async () => header?.click());
        expect(header?.textContent).toContain('Changed 1 file');
        expect(header?.textContent).toContain('+2 −1');
    });

    test('shows at most four changed files and folds the rest into one chip, including at the threshold', async () => {
        const record = turn([assistant('final', [text('answer', 'Done')])]);
        for (const count of [0, 1, 3, 4, 5, 100]) {
            const files = Array.from({ length: count }, (_, index) => ({ file: `src/file-${index}.ts`, additions: 1, deletions: 0 }));
            await act(async () => root.render(<Harness record={record} changedFiles={files} />));
            expect(container.querySelectorAll('button[aria-label^="Open src/file-"]')).toHaveLength(Math.min(count, 4));
            const toggle = changedFilesToggle();
            if (count <= 4) {
                expect(toggle).toBeNull();
            } else {
                expect(toggle?.textContent).toBe(`+${count - 4}`);
                expect(toggle?.getAttribute('aria-label')).toBe(`Other changed files (${count - 4})`);
                expect(toggle?.getAttribute('aria-expanded')).toBe('false');
                expect(container.textContent).not.toContain('file-4.ts');
            }
        }
    });

    test('reveals the rest in source order, keeps them through updates and locale changes, then hides them with focus intact', async () => {
        const record = turn([assistant('final', [text('answer', 'Done')])]);
        const files = Array.from({ length: 100 }, (_, index) => ({ file: `src/file-${index}.ts`, additions: 1, deletions: 0 }));
        await act(async () => root.render(<Harness record={record} changedFiles={files} />));
        const toggle = changedFilesToggle();
        if (!toggle) throw new Error('Missing changed-file toggle');
        toggle.focus();
        await act(async () => toggle.click());
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(toggle.getAttribute('aria-label')).toBe('Show fewer files');
        expect(Array.from(container.querySelectorAll('button[aria-label^="Open src/file-"]'), (button) => button.getAttribute('title')))
            .toEqual(files.map((file) => `Open ${file.file}`));
        expect(toggle.previousElementSibling?.getAttribute('title')).toBe('Open src/file-99.ts');
        await act(async () => root.render(<Harness record={record} changedFiles={[...files]} />));
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        await act(async () => {
            useI18nStore.getState().setLocale('uk');
            await import('@/lib/i18n/messages/uk');
        });
        expect(toggle.getAttribute('aria-label')).toBe('Показати менше файлів');
        await act(async () => toggle.click());
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(toggle.textContent).toBe('+96');
        expect(toggle.getAttribute('aria-label')).toBe('Інші змінені файли (96)');
        expect(document.activeElement).toBe(toggle);
        expect(container.textContent).not.toContain('file-4.ts');
        expect(container.querySelectorAll('button[aria-label^="Відкрити src/file-"]')).toHaveLength(4);
    });

    test('changed files open the pinned turn diff, never a working-tree diff', async () => {
        const record = turn([assistant('final', [text('answer', 'Done')])]);
        await act(async () => root.render(<Harness record={record} changedFiles={[
            { file: 'src/a.ts' },
            { file: 'src/b.ts', additions: 1, deletions: 2 },
            { file: 'src/c.ts', additions: 1, deletions: 0 },
        ]} />));
        expect(container.querySelector('button[aria-label="Open src/a.ts"]')?.textContent).toBe('a.ts');
        expect(container.querySelector('button[aria-label="Open src/b.ts"]')?.textContent).toBe('b.ts+1 −2');
        const fileButton = container.querySelector<HTMLButtonElement>('button[aria-label="Open src/c.ts"]');
        expect(fileButton?.textContent).toBe('c.ts+1 −0');
        await act(async () => fileButton?.click());
        const state = useUIStore.getState();
        expect(state.pendingTurnDiffFile).toMatchObject({ file: 'src/c.ts', turnId: 'user' });
        expect(state.contextPanelByDirectory['/project']?.tabs.some((tab) => tab.mode === 'diff' && tab.targetPath === 'src/c.ts')).toBe(true);
        expect(state.contextPanelByDirectory['/project']?.tabs.some((tab) => tab.mode === 'file' && tab.targetPath === '/project/src/c.ts')).toBe(false);
        expect(state.pendingDiffScope).toBe('working');
        expect(state.pendingDiffFile).toBe('existing.ts');
    });

    test('mobile changed files open Changes in the pinned turn scope', async () => {
        const record = turn([assistant('final', [text('answer', 'Done')])]);
        let filesOpened = 0;
        const changesRequests: Array<{ diffPath?: string | null; scope?: string; turnId?: string; sessionId?: string | null; directory?: string | null }> = [];
        const mobileActions: MobileAppActions = {
            openFiles: () => { filesOpened += 1; },
            openChanges: (request) => { changesRequests.push(request ?? {}); },
            openPlan: () => undefined,
            openSourceBoard: () => undefined,
            openReceivedPage: () => undefined,
        };
        useUIStore.setState({ isMobile: true });
        await act(async () => root.render(<Harness record={record} changedFiles={[{ file: '/project/src/mobile.ts' }]} mobileActions={mobileActions} />));
        await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Open /project/src/mobile.ts"]')?.click());
        expect(filesOpened).toBe(0);
        expect(changesRequests).toEqual([{ diffPath: '/project/src/mobile.ts', scope: 'turn', turnId: 'user', sessionId: null, directory: '/project' }]);
        expect(useUIStore.getState().pendingDiffScope).toBe('working');
        expect(useUIStore.getState().pendingDiffFile).toBe('existing.ts');
    });

    test('historical files pin their own turn diff through the column session', async () => {
        const record = turn([assistant('final', [text('answer', 'Done')])]);
        await act(async () => root.render(<ChatColumnSessionContext.Provider value={{ sessionId: 'pinned-session', directory: '/column' }}>
            <Harness record={record} changedFiles={[{ file: 'src/older.ts', additions: 1, deletions: 1 }]} isLatestTurn={false} retired />
        </ChatColumnSessionContext.Provider>));
        const button = container.querySelector<HTMLButtonElement>('button[aria-label="Open src/older.ts"]');
        expect(button).not.toBeNull();
        await act(async () => button?.click());
        expect(useUIStore.getState().pendingTurnDiffFile).toMatchObject({ file: 'src/older.ts', turnId: 'user', sessionId: 'pinned-session' });
        expect(useUIStore.getState().contextPanelByDirectory['/column']?.tabs.some((tab) => tab.mode === 'diff' && tab.targetPath === 'src/older.ts')).toBe(true);
    });

    test('historical files stay hidden until completion and expand into the pinned turn diff', async () => {
        const files = Array.from({ length: 5 }, (_, index) => ({ file: `src/file-${index}.ts`, additions: 1, deletions: 0 }));
        const final = assistant('final', [text('answer', 'Done')]);
        await act(async () => root.render(<Harness record={turn([final])} changedFiles={files} isLatestTurn={false} />));
        expect(container.textContent).not.toContain('file-0.ts');
        await act(async () => root.render(<Harness record={turn([final])} changedFiles={files} isLatestTurn={false} retired />));
        expect(container.textContent).toContain('file-0.ts');
        await act(async () => changedFilesToggle()?.click());
        expect(container.querySelectorAll('button[aria-label^="Open src/file-"]')).toHaveLength(5);
        await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Open src/file-4.ts"]')?.click());
        expect(useUIStore.getState().pendingTurnDiffFile).toMatchObject({ file: 'src/file-4.ts', turnId: 'user' });
        expect(useUIStore.getState().contextPanelByDirectory['/project']?.tabs.some((tab) => tab.mode === 'diff' && tab.targetPath === 'src/file-4.ts')).toBe(true);
    });

    test('renders one operation card for matched, running and failed tool parts', async () => {
        const editCall: Part = {
            type: 'tool_call', partId: 'live-edit-call', toolCallId: 'live-edit', toolName: 'edit',
            input: { path: 'src/source.ts', old_string: 'old', new_string: 'new' }, status: 'completed',
        };
        const editResult: Part = {
            type: 'tool_result', partId: 'live-edit-result', toolCallId: 'live-edit', toolName: 'edit', isError: false,
            output: {
                content: [{ type: 'text', text: 'Updated src/source.ts' }],
                details: { path: '[workspace]/src/source.ts', diff: '-1|old\n+1|new\n+2|added', op: 'update' },
            },
        };
        const progress = assistant('progress', [text('progress-text', 'Editing'), editCall, editResult]);
        await act(async () => root.render(<Harness record={turn([progress])} />));
        expect(container.querySelectorAll('[class*="group/tool"]')).toHaveLength(1);
        expect(container.textContent).toContain('+2/-1');

        const running: Part = {
            type: 'tool_call', partId: 'running-call', toolCallId: 'running', toolName: 'bash',
            input: { command: 'sleep 1' }, status: 'running',
        };
        await act(async () => root.render(<Harness record={turn([assistant('running-message', [running])])} />));
        expect(container.querySelectorAll('[class*="group/tool"]')).toHaveLength(1);
        expect(container.textContent).toContain('sleep 1');

        const failedCall: Part = {
            type: 'tool_call', partId: 'live-edit-call', toolCallId: 'live-edit', toolName: 'edit',
            input: { path: 'src/source.ts' }, status: 'failed',
        };
        const failedResult: Part = {
            type: 'tool_result', partId: 'live-edit-error', toolCallId: 'live-edit', toolName: 'edit',
            isError: true, error: 'Permission denied',
            output: { content: [{ type: 'text', text: 'Cannot edit src/source.ts' }] },
        };
        await act(async () => root.render(
            <Harness record={turn([assistant('error-message', [failedCall, failedResult])])} />,
        ));
        expect(container.querySelectorAll('[class*="group/tool"]')).toHaveLength(1);
    });
});
