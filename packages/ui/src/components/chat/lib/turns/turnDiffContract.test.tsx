import type { AddressInfo } from 'node:net';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { TurnDiffFileSchema, TurnDiffSchema, type TurnDiff, type TurnDiffFile } from '@openchamber/agent-contract';

import { configureRuntimeUrlResolver, getRuntimeUrlResolver, setRuntimeUrlResolver, type RuntimeUrlResolver } from '@/lib/runtime-url';
import { useCanonicalTurnDiff, clearCanonicalTurnDiffCache, type CanonicalTurnDiffResult } from '@/hooks/useCanonicalTurnDiff';
import { adaptTurnDiff, adaptTurnDiffFiles } from '@/components/views/turnDiffAdapter';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
    window: browser, document: browser.document, navigator: browser.navigator,
    Node: browser.Node, Element: browser.Element, HTMLElement: browser.HTMLElement,
    Event: browser.Event, IS_REACT_ACT_ENVIRONMENT: true,
});

const sessionId = 'session_turn_diff';
const turnId = 'turn_turn_diff';

const fileRow = (overrides: Partial<TurnDiffFile> = {}): TurnDiffFile => TurnDiffFileSchema.parse({
    path: 'src/a.ts',
    status: 'modified',
    before: 'const value = 1;\n',
    after: 'const value = 2;\n',
    patch: '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-const value = 1;\n+const value = 2;\n',
    additions: 1,
    deletions: 1,
    provenance: [{ tool: 'edit', agent: 'session', at: 1000 }],
    truncated: false,
    incomplete: false,
    ...overrides,
});

const turnDiffPayload = (overrides: Partial<TurnDiff> = {}): TurnDiff => TurnDiffSchema.parse({
    sessionId,
    turnId,
    state: 'ready',
    files: [fileRow()],
    ...overrides,
});

let handler: (request: IncomingMessage, response: ServerResponse) => void;
let server: Server;
let serverPort: number;
let previousResolver: RuntimeUrlResolver;
let requests: string[];

const json = (response: ServerResponse, payload: TurnDiff) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(TurnDiffSchema.parse(payload)));
};

beforeEach(async () => {
    requests = [];
    clearCanonicalTurnDiffCache();
    handler = (_request, response) => { response.writeHead(404); response.end(); };
    server = createServer((request, response) => {
        requests.push(`${request.method} ${request.url}`);
        handler(request, response);
    });
    const listening = Promise.withResolvers<void>();
    server.listen(0, '127.0.0.1', listening.resolve);
    await listening.promise;
    // SAFETY: the completed listen callback binds a TCP port on loopback.
    const address = server.address() as AddressInfo;
    serverPort = address.port;
    previousResolver = getRuntimeUrlResolver();
    configureRuntimeUrlResolver({ apiBaseUrl: `http://127.0.0.1:${address.port}` });
});

afterEach(async () => {
    setRuntimeUrlResolver(previousResolver);
    const closing = Promise.withResolvers<void>();
    server.close((error) => (error ? closing.reject(error) : closing.resolve()));
    server.closeAllConnections();
    await closing.promise;
});

let reactRoot: Root | null = null;
afterEach(async () => {
    await act(async () => reactRoot?.unmount());
    reactRoot = null;
});

interface HookHarness {
    current: () => CanonicalTurnDiffResult;
    waitFor: (predicate: (value: CanonicalTurnDiffResult) => boolean) => Promise<CanonicalTurnDiffResult>;
}

const HookProbe: React.FC<{ session: string | null; turn: string | undefined; mutable?: boolean; onUpdate: (value: CanonicalTurnDiffResult) => void }> = ({ session, turn, mutable = false, onUpdate }) => {
    const result = useCanonicalTurnDiff(session, turn, { enabled: true, mutable });
    React.useEffect(() => {
        onUpdate(result);
    }, [onUpdate, result]);
    return null;
};

const renderHook = async (session: string | null, turn: string | undefined, mutable = false): Promise<HookHarness> => {
    let latest: CanonicalTurnDiffResult | null = null;
    const waiters: Array<{ predicate: (value: CanonicalTurnDiffResult) => boolean; resolve: (value: CanonicalTurnDiffResult) => void }> = [];
    const onUpdate = (value: CanonicalTurnDiffResult) => {
        latest = value;
        for (const waiter of waiters.splice(0)) {
            if (waiter.predicate(value)) waiter.resolve(value);
            else waiters.push(waiter);
        }
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    reactRoot = createRoot(container);
    await act(async () => {
        reactRoot?.render(<HookProbe session={session} turn={turn} mutable={mutable} onUpdate={onUpdate} />);
    });
    return {
        current: () => {
            if (!latest) throw new Error('hook never rendered');
            return latest;
        },
        waitFor: (predicate) => {
            if (latest && predicate(latest)) return Promise.resolve(latest);
            const pending = Promise.withResolvers<CanonicalTurnDiffResult>();
            waiters.push({ predicate, resolve: pending.resolve });
            return pending.promise;
        },
    };
};

const sentinelRoundTrip = async () => {
    const response = await fetch(`http://127.0.0.1:${serverPort}/sentinel`);
    await response.text();
};

describe('useCanonicalTurnDiff against a real Canonical transport', () => {
    test('ready state carries the contract files and requests only the turn diff route', async () => {
        handler = (_request, response) => json(response, turnDiffPayload());
        const hook = await renderHook(sessionId, turnId);
        const result = await hook.waitFor((value) => value.state !== 'loading');

        expect(result.state).toBe('ready');
        expect(result.diff?.files).toHaveLength(1);
        expect(result.diff?.files[0]?.path).toBe('src/a.ts');
        expect(result.error).toBeNull();
        // Only the per-turn diff contract route is consulted: no git or
        // workspace-diff route is ever requested for any state.
        expect(requests).toEqual([`GET /api/agent/v1/sessions/${sessionId}/turns/${turnId}/diff`]);
    });

    test('empty state carries no files and never falls back', async () => {
        handler = (_request, response) => json(response, turnDiffPayload({ state: 'empty', files: [] }));
        const hook = await renderHook(sessionId, turnId);
        const result = await hook.waitFor((value) => value.state !== 'loading');

        expect(result.state).toBe('empty');
        expect(result.diff?.files).toEqual([]);
        expect(result.error).toBeNull();
        expect(requests).toEqual([`GET /api/agent/v1/sessions/${sessionId}/turns/${turnId}/diff`]);
    });

    test('unsupported state passes through as its own explicit state', async () => {
        handler = (_request, response) => json(response, turnDiffPayload({ state: 'unsupported', files: [] }));
        const hook = await renderHook(sessionId, turnId);
        const result = await hook.waitFor((value) => value.state !== 'loading');

        expect(result.state).toBe('unsupported');
        expect(result.diff?.files).toEqual([]);
        expect(result.error).toBeNull();
    });

    test('contract failed state carries its detail and is never cached', async () => {
        let reads = 0;
        handler = (_request, response) => {
            reads += 1;
            json(response, turnDiffPayload({ state: 'failed', files: [], error: 'journal unreadable' }));
        };
        const hook = await renderHook(sessionId, turnId);
        const result = await hook.waitFor((value) => value.state !== 'loading');

        expect(result.state).toBe('failed');
        expect(result.diff?.error).toBe('journal unreadable');
        expect(reads).toBe(1);

        // A failed contract read is not terminal: a retry fetches again instead
        // of replaying a cached failure.
        await act(async () => {
            result.retry();
        });
        const retried = await hook.waitFor((value) => reads >= 2 && value.state === 'failed');
        expect(retried.state).toBe('failed');
        expect(reads).toBeGreaterThan(1);
    });

    test('transport failure is distinct from empty and retries through the hook', async () => {
        handler = (_request, response) => {
            response.writeHead(500, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({
                type: 'urn:ohpichamber:problem:SERVICE_UNAVAILABLE', title: 'unavailable', status: 500,
                detail: 'agent service down', code: 'SERVICE_UNAVAILABLE', retryable: true,
            }));
        };
        const hook = await renderHook(sessionId, turnId);
        const failed = await hook.waitFor((value) => value.state !== 'loading');

        expect(failed.state).toBe('failed');
        expect(failed.error).toBeTruthy();
        expect(failed.diff).toBeNull();

        handler = (_request, response) => json(response, turnDiffPayload());
        await act(async () => {
            failed.retry();
        });
        const recovered = await hook.waitFor((value) => value.state === 'ready');

        expect(recovered.state).toBe('ready');
        expect(recovered.error).toBeNull();
    });

    test('a terminal read is cached per turn and not refetched', async () => {
        let reads = 0;
        handler = (request, response) => {
            if (request.url?.includes('/turns/')) reads += 1;
            json(response, turnDiffPayload());
        };
        const first = await renderHook(sessionId, turnId);
        await first.waitFor((value) => value.state === 'ready');
        expect(reads).toBe(1);
        await act(async () => reactRoot?.unmount());
        reactRoot = null;

        const second = await renderHook(sessionId, turnId);
        expect(second.current().state).toBe('ready');
        // The sentinel round trips give any wrongly initiated refetch the
        // loopback transit time to reach the server before the count is read:
        // the hook's fetch, had it started, is written to the wire before the
        // sentinel that the test starts afterwards.
        await sentinelRoundTrip();
        await sentinelRoundTrip();
        expect(reads).toBe(1);
    });

    test('a mutable read never poisons the terminal cache: the settled read refetches', async () => {
        let reads = 0;
        handler = (request, response) => {
            if (request.url?.includes('/turns/')) reads += 1;
            json(response, turnDiffPayload());
        };
        const running = await renderHook(sessionId, turnId, true);
        await running.waitFor((value) => value.state === 'ready');
        expect(reads).toBe(1);
        await act(async () => reactRoot?.unmount());
        reactRoot = null;

        // The same key read immutably afterwards must not replay the mid-write
        // response: nothing was cached while the turn was mutable, so the read
        // fetches again and the settled diff replaces the partial one.
        const settled = await renderHook(sessionId, turnId);
        const result = await settled.waitFor((value) => value.state === 'ready');
        expect(result.state).toBe('ready');
        expect(reads).toBe(2);
    });
});

describe('adaptTurnDiffFiles', () => {
    test('maps contract rows into sorted snapshots and per-file diff data', () => {
        const patch = '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n';
        const adapted = adaptTurnDiffFiles([
            fileRow({ path: 'src/b.ts', patch, additions: 1, deletions: 1 }),
            fileRow({ path: 'src/a.ts', before: 'before', after: 'after', patch: undefined }),
        ]);

        expect(adapted.snapshots.map((row) => row.file)).toEqual(['src/a.ts', 'src/b.ts']);
        expect(adapted.diffDataByPath.get('src/b.ts')?.fileDiff).toBeDefined();
        expect(adapted.diffDataByPath.get('src/a.ts')).toMatchObject({ original: 'before', modified: 'after', contextMode: 'full' });
        expect(adapted.hasIncompleteRows).toBe(false);
    });

    test('renamed rows carry their previous path into the snapshot row', () => {
        const adapted = adaptTurnDiffFiles([
            fileRow({ path: 'src/new.ts', status: 'renamed', previousPath: 'src/old.ts' }),
        ]);
        expect(adapted.snapshots[0]).toMatchObject({ file: 'src/new.ts', status: 'renamed', previousPath: 'src/old.ts' });
    });

    test('truncated and incomplete rows mark the surface banner without dropping the row', () => {
        const adapted = adaptTurnDiffFiles([
            fileRow({ path: 'src/big.ts', before: undefined, after: undefined, patch: undefined, truncated: true }),
            fileRow({ path: 'src/broken.ts', before: undefined, after: undefined, patch: undefined, additions: 0, deletions: 0, incomplete: true }),
        ]);
        expect(adapted.snapshots).toHaveLength(2);
        expect(adapted.hasIncompleteRows).toBe(true);
        // An incomplete row carries no replayable content; the entry renders
        // the empty placeholder rather than guessed content.
        const broken = adapted.diffDataByPath.get('src/broken.ts');
        expect(broken).toMatchObject({ original: '', modified: '' });
    });

    test('adaptTurnDiff yields rows only for a ready read', () => {
        expect(adaptTurnDiff(turnDiffPayload({ state: 'empty', files: [] })).snapshots).toEqual([]);
        expect(adaptTurnDiff(turnDiffPayload({ state: 'unsupported', files: [] })).snapshots).toEqual([]);
        expect(adaptTurnDiff(null).snapshots).toEqual([]);
        expect(adaptTurnDiff(turnDiffPayload()).snapshots).toHaveLength(1);
    });
});
