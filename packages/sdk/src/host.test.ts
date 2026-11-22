import { describe, expect, test } from 'bun:test';

import { OPENCHAMBER_SDK_API_VERSION, OPENCHAMBER_SDK_CHANNEL } from './api-version.ts';
import { connectHost as createHost, HostRequestError, type HostClient, type HostClientOptions, type HostFrame } from './host.ts';
import {
  GUEST_ATTACH_TITLE_MAX,
  GUEST_FILE_CONTENT_MAX,
  GUEST_FILE_PATH_MAX,
  GUEST_GENERATE_OUTPUT_TOKENS_MAX,
  GUEST_GENERATE_PROMPT_MAX,
  GUEST_RESOLVE_ERROR_MAX,
  GUEST_CLIPBOARD_TEXT_MAX,
  GUEST_TOAST_MAX,
  type GuestMessage,
  type HostMessage,
  type SessionSnapshot,
} from './contract.ts';
import { GUEST_SHELL_OUTPUT_TAIL_MAX } from './shells.ts';
import { createMessageChannelFrame, type MessageChannelFrame } from './message-channel-test.ts';
const isMessageChannelFrame = (target: HostFrame): target is MessageChannelFrame => (
  'connect' in target && 'source' in target.parent
);

const connectHost = (options: HostClientOptions): HostClient => {
  const host = createHost(options);
  if (options.target && isMessageChannelFrame(options.target)) options.target.connect(options.target.parent.source);
  return host;
};

const pointerEvent = (type: 'pointerover' | 'pointerout'): Event => Object.assign(new Event(type), { pointerType: 'mouse', relatedTarget: null });

const ready: HostMessage = {
  channel: OPENCHAMBER_SDK_CHANNEL,
  v: OPENCHAMBER_SDK_API_VERSION,
  type: 'ready',
  payload: {
    theme: {
      mode: 'dark',
      tokens: {
        background: '#111',
        elevated: '#1a1a1a',
        foreground: '#eee',
        muted: '#666',
        subtle: '#222',
        border: '#333',
        hover: '#2a2a2a',
        selection: '#334',
        focus: '#4af',
        primary: '#4af',
        font: 'SF Pro Text, sans-serif',
        mutedSurface: '#f4f4f5',
        elevatedForeground: '#111111',
        active: '#e5e5e5',
        selectionForeground: '#111111',
        primaryForeground: '#ffffff',
        primaryText: '#123456',
        successText: '#224433',
        warningText: '#664422',
        errorText: '#882233',
        infoText: '#334488',
        success: '#16a34a',
        warning: '#d97706',
        error: '#dc2626',
        info: '#2563eb',
        mono: 'Menlo, monospace',
        radius: '0.5625rem',
      },
    },
    locale: 'en',
    directory: '/repo',
    session: { id: 'ses-1', title: 'Hello', busy: false },
    surface: 'panel',
    connection: { connected: false, account: '' },
    settings: {},
    item: null,
  },
};

const demoItem = {
  providerId: 'tasks-demo',
  id: 'DEMO-1',
  title: 'Fix the login redirect loop',
  url: 'https://example.com/tasks/DEMO-1',
  kind: 'issue' as const,
};

describe('connectHost', () => {
  test('queues an RPC until the asynchronous SDK port handoff and delivers its result', async () => {
    const frame = createMessageChannelFrame();
    const host = createHost({ target: frame, acceptSource: () => true });
    const pending = host.request({ method: 'GET', path: '/api/v2/user' });
    await frame.flush();
    expect(frame.posted).toHaveLength(0);

    frame.connect(frame.parent.source);
    await frame.flush();
    expect(frame.posted.map((message) => message.type)).toEqual(['hello', 'request']);
    const request = frame.posted.find((message) => message.type === 'request');
    if (!request || request.type !== 'request') throw new Error('Expected queued request');
    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: request.id, ok: true, payload: { status: 204, body: '' } });
    await expect(pending).resolves.toEqual({ status: 204, body: '' });
    host.dispose();
  });
  test('a popover child reports only its own pointer and window focus transitions', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    await frame.receive({ ...ready, payload: { ...ready.payload, surface: 'popover', popover: { id: 'child-1', data: null } } });
    await expect(host.setPopoverAnchorActive('other', true)).rejects.toMatchObject({ code: 'UNSUPPORTED' });
    frame.dispatch(pointerEvent('pointerover'));
    frame.dispatch(new Event('focus'));
    frame.dispatch(pointerEvent('pointerout'));
    frame.dispatch(new Event('blur'));
    await frame.flush();
    const activity = frame.posted.filter((message) => message.type === 'popover-anchor');
    expect(activity.map((message) => message.type === 'popover-anchor' ? message.payload : null)).toEqual([
      { id: 'child-1', active: true }, { id: 'child-1', active: false },
    ]);
    host.dispose();
    frame.dispatch(pointerEvent('pointerover'));
    expect(frame.posted.filter((message) => message.type === 'popover-anchor')).toHaveLength(2);
  });

  test('refuses popovers before the host advertises support without posting', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    await expect(host.openPopover({ id: 'preview-1', anchor: { x: 0, y: 0, width: 1, height: 1 }, width: 160, height: 48, data: null })).rejects.toMatchObject({ code: 'UNSUPPORTED' });
    await frame.flush();
    expect(frame.posted).toHaveLength(1);
    host.dispose();
  });

  test('forwards popover close pushes and ignores them after disposal', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    const events: string[] = [];
    host.onPopoverClosed((event) => events.push(`${event.id}:${event.reason}`));
    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'popover-closed', payload: { id: 'preview-1', reason: 'escape' } });
    host.dispose();
    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'popover-closed', payload: { id: 'preview-1', reason: 'closed' } });
    expect(events).toEqual(['preview-1:escape']);
  });
  test('toast options are sent as data and resolve on display acknowledgement', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    const pending = host.toast({ kind: 'success', message: '  Result  ', copy: { text: '  original\n' }, dismiss: true, persistent: true });
    await frame.flush();
    const request = frame.posted.at(-1);
    if (!request || request.type !== 'toast') throw new Error('Expected toast');
    expect(request.payload).toEqual({ kind: 'success', message: 'Result', copy: { text: '  original\n' }, dismiss: true, persistent: true });
    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: request.id, ok: true });
    await pending;
    host.dispose();
  });

  test('invalid toast text rejects locally instead of waiting for a timeout', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    for (const message of ['', ' ', 'x'.repeat(GUEST_TOAST_MAX + 1)]) {
      await expect(host.toast({ kind: 'info', message })).rejects.toMatchObject({ code: 'HOST_REJECTED' });
    }
    for (const text of ['', 'x'.repeat(GUEST_CLIPBOARD_TEXT_MAX + 1)]) {
      await expect(host.toast({ kind: 'info', message: 'Summary', copy: { text } })).rejects.toMatchObject({ code: 'HOST_REJECTED' });
    }
    await frame.flush();
    expect(frame.posted.filter((message) => message.type !== 'hello')).toHaveLength(0);
    host.dispose();
  });

  test('keeps legacy storage requests unchanged and refuses device storage before advertising it', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    const legacy = host.storage.get('saved');
    await frame.flush();
    const legacyRequest = frame.posted.at(-1);
    if (!legacyRequest || legacyRequest.type !== 'storage') throw new Error('Expected storage request');
    expect(legacyRequest.payload).toEqual({ op: 'get', key: 'saved' });
    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: legacyRequest.id, ok: true, payload: { storage: true, op: 'get', found: false } });
    await expect(legacy).resolves.toBeUndefined();
    const explicitInstance = host.storage.keys({ scope: 'instance' });
    await frame.flush();
    const instanceRequest = frame.posted.at(-1);
    if (!instanceRequest || instanceRequest.type !== 'storage') throw new Error('Expected storage request');
    expect(instanceRequest.payload).toEqual({ op: 'keys' });
    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: instanceRequest.id, ok: true, payload: { storage: true, op: 'keys', keys: [] } });
    await expect(explicitInstance).resolves.toEqual([]);
    await expect(host.storage.get('saved', { scope: 'device' })).rejects.toMatchObject({ code: 'UNSUPPORTED' });
    expect(frame.posted.filter((message) => message.type === 'storage')).toHaveLength(2);
    host.dispose();
  });

  test('sends device-scoped storage only after the host advertises it', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    await frame.receive({
      ...ready,
      payload: { ...ready.payload, features: { deviceStorage: true } },
    });
    const pending = host.storage.set('saved', { enabled: true }, { scope: 'device' });
    await frame.flush();
    const request = frame.posted.at(-1);
    if (!request || request.type !== 'storage') throw new Error('Expected storage request');
    expect(request.payload).toEqual({ op: 'set', key: 'saved', value: { enabled: true }, scope: 'device' });
    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: request.id, ok: true, payload: { storage: true, op: 'set' } });
    await pending;
    host.dispose();
  });

  test('publishes status controls only to supporting hosts and disposes listeners', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    await expect(host.setStatusControls([])).rejects.toMatchObject({ code: 'UNSUPPORTED' });
    await frame.receive({
      ...ready,
      payload: { ...ready.payload, features: { statusControls: true } },
    });
    const events: string[] = [];
    const remove = host.onStatusControl((event) => events.push(event.id));
    const pending = host.setStatusControls([{ kind: 'button', id: 'refresh', label: 'Refresh' }]);
    await frame.flush();
    const request = frame.posted.at(-1);
    if (!request || request.type !== 'status-controls') throw new Error('Expected status controls request');
    expect(request.payload).toEqual({ controls: [{ kind: 'button', id: 'refresh', label: 'Refresh' }] });
    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: request.id, ok: true });
    await pending;
    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'status-control-event', payload: { id: 'refresh' } });
    remove();
    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'status-control-event', payload: { id: 'refresh' } });
    expect(events).toEqual(['refresh']);
    host.dispose();
  });

  test('rejects invalid status controls locally without posting', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    await frame.receive({
      ...ready,
      payload: { ...ready.payload, features: { statusControls: true } },
    });
    const invalidControls = [
      [{ kind: 'button' as const, id: 'refresh', label: 'Refresh' }, { kind: 'button' as const, id: 'refresh', label: 'Again' }],
      [{ kind: 'select' as const, id: 'branch', label: 'Branch', value: 'main', options: [{ value: 'main', label: 'Main' }, { value: 'main', label: 'Again' }] }],
      [{ kind: 'select' as const, id: 'branch', label: 'Branch', value: 'missing', options: [{ value: 'main', label: 'Main' }] }],
      Array.from({ length: 5 }, (_, index) => ({ kind: 'button' as const, id: `item-${index}`, label: 'Control' })),
      [{ kind: 'button' as const, id: 'refresh', label: '' }],
    ];
    for (const controls of invalidControls) {
      await expect(host.setStatusControls(controls)).rejects.toMatchObject({ code: 'HOST_REJECTED' });
    }
    expect(frame.posted.filter((message) => message.type === 'status-controls')).toHaveLength(0);
    host.dispose();
  });

  const action: HostMessage = {
    channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'action', id: 'action-1',
    payload: { kind: 'message', action: 'count', sessionId: 's1', sessionTitle: 'Session', directory: '/repo', messageId: 'm1', role: 'assistant', text: 'Hello' },
  };

  test('background action waits for the handler and its toast acknowledgement', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    host.onAction(async (item) => {
      expect(item).toEqual(action.payload);
      await host.toast({ kind: 'info', message: 'Done' });
    });
    await frame.receive(action);
    await frame.flush();
    const toast = frame.posted.find((message) => message.type === 'toast');
    if (!toast || toast.type !== 'toast') throw new Error('Expected toast');
    expect(frame.posted.some((message) => message.type === 'action-result')).toBe(false);
    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: toast.id, ok: true });
    await frame.flush();
    expect(frame.posted.at(-1)).toEqual({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'action-result', id: 'action-1', payload: { ok: true } });
    host.dispose();
  });

  test('missing action handlers and rejected handlers answer with bounded failures', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    await frame.receive(action);
    await frame.flush();
    expect(frame.posted.at(-1)).toMatchObject({ type: 'action-result', payload: { ok: false, error: 'This extension does not handle background actions.' } });
    const removeOld = host.onAction(() => {});
    const removeCurrent = host.onAction(async () => { throw new Error('x'.repeat(GUEST_RESOLVE_ERROR_MAX + 20)); });
    removeOld();
    await frame.receive(action);
    await frame.flush();
    expect(frame.posted.at(-1)).toMatchObject({ type: 'action-result', payload: { ok: false, error: 'x'.repeat(GUEST_RESOLVE_ERROR_MAX) } });
    removeCurrent();
    await frame.receive(action);
    await frame.flush();
    expect(frame.posted.at(-1)).toMatchObject({ type: 'action-result', payload: { ok: false, error: 'This extension does not handle background actions.' } });
    host.dispose();
  });

  test('disposing during an action suppresses its late result', async () => {
    const frame = createMessageChannelFrame();
    let calls = 0;
    const pendingAction = Promise.withResolvers<void>();
    const host = connectHost({ target: frame, acceptSource: () => true });
    host.onAction(() => { calls++; return pendingAction.promise; });
    await frame.receive(action);
    expect(calls).toBe(1);
    host.dispose();
    pendingAction.resolve();
    await frame.flush();
    expect(frame.posted.some((message) => message.type === 'action-result')).toBe(false);
  });

  test('workspace subscriptions deliver an initial snapshot, unsubscribe, and propagate refusals', async () => {
    const guest = createMessageChannelFrame();
    const host = connectHost({ target: guest, acceptSource: () => true });
    const seen: string[] = [];
    const subscription = host.onProjects((snapshot) => seen.push(snapshot.state));
    await guest.flush();
    const call = guest.posted.at(-1);
    if (call?.type !== 'workspace-subscribe') throw new Error('Expected subscription');
    await guest.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'workspace',
      payload: { subscriptionId: call.payload.subscriptionId, snapshot: { kind: 'projects', state: 'loading', projects: [] } } });
    await guest.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: call.id, ok: true });
    const stop = await subscription;
    expect(seen).toEqual(['loading']);
    stop();
    await guest.flush();
    expect(guest.posted.at(-1)?.type).toBe('workspace-unsubscribe');
    const refused = host.onSessions('project', () => {});
    const refusedResult = refused.catch((error) => {
      expect(error).toMatchObject({ code: 'NOT_GRANTED' });
    });
    await guest.flush();
    const next = guest.posted.at(-1);
    if (next?.type !== 'workspace-subscribe') throw new Error('Expected subscription');
    await guest.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: next.id, ok: false, code: 'NOT_GRANTED', error: 'Not allowed' });
    await refusedResult;
    host.dispose();
    await expect(host.listProjects()).rejects.toMatchObject({ code: 'HOST_UNAVAILABLE' });
  });

  test('requires the default parent source before accepting a MessagePort', async () => {
    const frame = createMessageChannelFrame();
    const parentSource = new MessageChannel().port1;
    const unrelatedSource = new MessageChannel().port1;
    const target = {
      addEventListener: frame.addEventListener,
      removeEventListener: frame.removeEventListener,
      parent: Object.assign(parentSource, { postMessage: () => {} }),
    };
    const host = createHost({ target });

    const rejected = frame.connect(unrelatedSource);
    await frame.flush();
    expect(frame.posted).toHaveLength(0);

    const accepted = frame.connect(parentSource);
    await frame.flush();
    expect(frame.posted.at(-1)).toMatchObject({
      channel: OPENCHAMBER_SDK_CHANNEL,
      v: OPENCHAMBER_SDK_API_VERSION,
      type: 'hello',
    });
    const seen: string[] = [];
    host.onReady((context) => seen.push(context.directory ?? ''));
    await frame.receiveOn(accepted, ready);
    expect(seen).toEqual(['/repo']);

    host.dispose();
    rejected.close();
    accepted.close();
    parentSource.close();
    unrelatedSource.close();
  });

  test('rejects an unrelated port source before accepting the allowed source', async () => {
    const frame = createMessageChannelFrame();
    const unrelated = createMessageChannelFrame();
    const allowedSource = frame.parent.source;
    const host = createHost({ target: frame, acceptSource: (source) => source === allowedSource });

    const rejected = frame.connect(unrelated.parent.source);
    await frame.receiveOn(rejected, ready);
    await frame.flush();
    expect(frame.posted).toHaveLength(0);

    const accepted = frame.connect(allowedSource);
    await frame.flush();
    expect(frame.posted.at(-1)).toMatchObject({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'hello' });
    const seen: string[] = [];
    host.onReady((context) => seen.push(context.directory ?? ''));
    await frame.receiveOn(accepted, ready);
    expect(seen).toEqual(['/repo']);
    host.dispose();
  });

  test('delivers ready from the parent frame over the connected port', async () => {
    const guest = createMessageChannelFrame();

    const host = connectHost({ target: guest, acceptSource: () => true });
    expect(guest.windowPosted).toHaveLength(0);
    await guest.flush();
    expect(guest.posted.at(0)).toMatchObject({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'hello' });
    const seen: string[] = [];
    host.onReady((context) => {
      seen.push(context.directory ?? '');
    });

    await guest.receive(ready);
    expect(seen).toEqual(['/repo']);

    guest.dispatch(new Event('click'));
    expect(seen).toEqual(['/repo']);

    host.dispose();
  });

  test('ignores window protocol messages after the guest port connects', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    const seen: string[] = [];
    host.onReady((context) => seen.push(context.directory ?? ''));
    frame.dispatchWindow(new MessageEvent('message', { data: ready }));
    expect(seen).toEqual([]);
    await frame.receive(ready);
    expect(seen).toEqual(['/repo']);
    host.dispose();
  });

  test('replays the last ready to a late listener', async () => {
    const guest = createMessageChannelFrame();

    const host = connectHost({ target: guest, acceptSource: () => true });
    await guest.receive(ready);

    let locale = '';
    host.onReady((context) => {
      locale = context.locale;
    });
    expect(locale).toBe('en');
    host.dispose();
  });

  test('delivers a session push', async () => {
    const guest = createMessageChannelFrame();

    const host = connectHost({ target: guest, acceptSource: () => true });
    const seen: Array<string | null> = [];
    host.onSession((session) => {
      seen.push(session?.title ?? null);
    });
    await guest.receive({
      channel: OPENCHAMBER_SDK_CHANNEL,
      v: OPENCHAMBER_SDK_API_VERSION,
      type: 'session',
      payload: { session: { id: 'ses-2', title: 'Later' } },
    });
    expect(seen).toEqual(['Later']);
    host.dispose();
  });

  test('delivers usage through the private port on ready and subsequent session updates', async () => {
    const guest = createMessageChannelFrame();
    const host = connectHost({ target: guest, acceptSource: () => true });
    const usage = { prompt: 1000, output: 20, reasoning: 10, cacheRead: 700, cacheWrite: 100, cacheHitPercent: 70 };
    const initial = { id: 'ses-1', title: 'Hello', busy: true, context: { tokens: 800, limit: 4000 }, tokens: usage };
    await guest.receive({ ...ready, payload: { ...ready.payload, session: initial } });
    const seen: Array<SessionSnapshot | null> = [];
    host.onSession((session) => { seen.push(session); });
    const updated = { ...initial, context: null, tokens: { ...usage, output: 40 } };
    guest.dispatchWindow(new MessageEvent('message', { data: { ...ready, type: 'session', payload: { session: updated } } }));
    expect(seen).toEqual([initial]);
    await guest.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'session', payload: { session: updated } });
    expect(seen).toEqual([initial, updated]);
    const replayed: Array<SessionSnapshot | null> = [];
    host.onSession((session) => { replayed.push(session); });
    expect(replayed).toEqual([updated]);
    host.dispose();
  });

  test('delivers the ready item and replays it to a late listener', async () => {
    const guest = createMessageChannelFrame();

    const host = connectHost({ target: guest, acceptSource: () => true });
    await guest.receive({ ...ready, payload: { ...ready.payload, item: demoItem } });

    const seen: Array<string | null> = [];
    host.onItem((item) => {
      seen.push(item?.id ?? null);
    });
    expect(seen).toEqual(['DEMO-1']);

    await guest.receive({
      channel: OPENCHAMBER_SDK_CHANNEL,
      v: OPENCHAMBER_SDK_API_VERSION,
      type: 'item',
      payload: { item: null },
    });
    expect(seen).toEqual(['DEMO-1', null]);

    let readyItem: string | null = 'unset';
    host.onReady((context) => {
      readyItem = context.item?.id ?? null;
    });
    expect(readyItem).toBeNull();
    host.dispose();
  });

  test('replays the last directory to a late listener', async () => {
    const guest = createMessageChannelFrame();

    const host = connectHost({ target: guest, acceptSource: () => true });
    await guest.receive(ready);

    let directory = '';
    host.onDirectory((next) => {
      directory = next ?? '';
    });
    expect(directory).toBe('/repo');
    host.dispose();
  });

  test('keeps lastReady current after a directory and session push', async () => {
    const guest = createMessageChannelFrame();
    const host = connectHost({ target: guest, acceptSource: () => true });
    await guest.receive(ready);
    await guest.receive({
      channel: OPENCHAMBER_SDK_CHANNEL,
      v: OPENCHAMBER_SDK_API_VERSION,
      type: 'directory',
      payload: { directory: '/other' },
    });
    await guest.receive({
      channel: OPENCHAMBER_SDK_CHANNEL,
      v: OPENCHAMBER_SDK_API_VERSION,
      type: 'session',
      payload: { session: { id: 'ses-9', title: 'Later' } },
    });

    let directory = '';
    let title = '';
    host.onDirectory((next) => {
      directory = next ?? '';
    });
    host.onSession((session) => {
      title = session?.title ?? '';
    });
    expect(directory).toBe('/other');
    expect(title).toBe('Later');
    host.dispose();
  });

  test('replays the last session lifecycle to a late listener', async () => {
    const guest = createMessageChannelFrame();
    const host = connectHost({ target: guest, acceptSource: () => true });
    await guest.receive(ready);

    const seen: string[] = [];
    host.onSessionLifecycle((event) => {
      seen.push(`${event.sessionId}:${event.phase}`);
    });
    expect(seen).toEqual(['ses-1:completed']);

    await guest.receive({
      channel: OPENCHAMBER_SDK_CHANNEL,
      v: OPENCHAMBER_SDK_API_VERSION,
      type: 'session-lifecycle',
      payload: { sessionId: 'ses-1', phase: 'started' },
    });
    expect(seen).toEqual(['ses-1:completed', 'ses-1:started']);
    host.dispose();
  });

  test('replays the last session to a late listener', async () => {
    const guest = createMessageChannelFrame();

    const host = connectHost({ target: guest, acceptSource: () => true });
    await guest.receive(ready);

    let title = '';
    host.onSession((session) => {
      title = session?.title ?? '';
    });
    expect(title).toBe('Hello');
    host.dispose();
  });

  test('resolves toast when the host answers ok', async () => {
    const guest = createMessageChannelFrame();

    const host = connectHost({ target: guest, acceptSource: () => true });
    const toast = host.toast({ kind: 'info', message: 'Hello' });
    await guest.flush();
    const request = guest.posted.at(-1);
    expect(request?.type).toBe('toast');
    if (request?.type !== 'toast') {
      throw new Error('expected toast');
    }

    await guest.receive({
      channel: OPENCHAMBER_SDK_CHANNEL,
      v: OPENCHAMBER_SDK_API_VERSION,
      type: 'result',
      id: request.id,
      ok: true,
    });

    await toast;
    host.dispose();
  });

  test('rejects when the page is not framed', async () => {
    const top = createMessageChannelFrame();
    top.parent = top;
    const host = connectHost({ target: top });
    try {
      await host.toast({ kind: 'info', message: 'Hello' });
      throw new Error('should have rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(HostRequestError);
      if (error instanceof HostRequestError) {
        expect(error.code).toBe('HOST_UNAVAILABLE');
      }
    }
    host.dispose();
  });

  test('posts clipboard-write and compose', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    const write = host.writeClipboard('/repo');
    const compose = host.compose({ text: 'Hello from the guest' });
    await frame.flush();
    const writeRequest = frame.posted.find((message) => message.type === 'clipboard-write');
    const composeRequest = frame.posted.find((message) => message.type === 'compose');
    if (writeRequest?.type !== 'clipboard-write' || composeRequest?.type !== 'compose') {
      throw new Error('expected clipboard-write and compose');
    }

    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: writeRequest.id, ok: true });
    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: composeRequest.id, ok: true });
    await Promise.all([write, compose]);
    host.dispose();
  });

  test('posts attach and close', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    const attach = host.attach({
      providerId: 'hello',
      id: 'HELLO-1',
      title: 'Sample ticket',
      url: 'https://example.com/HELLO-1',
    });
    const close = host.close();
    await frame.flush();
    const attachRequest = frame.posted.find((message) => message.type === 'attach');
    const closeRequest = frame.posted.find((message) => message.type === 'close');
    if (attachRequest?.type !== 'attach' || closeRequest?.type !== 'close') {
      throw new Error('expected attach and close');
    }

    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: attachRequest.id, ok: true });
    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: closeRequest.id, ok: true });
    await Promise.all([attach, close]);
    host.dispose();
  });

  test('clamps attach title before post', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    const title = 'x'.repeat(240);
    const attach = host.attach({
      providerId: 'clickup',
      id: 'abc',
      title,
      url: 'https://app.clickup.com/t/abc',
    });
    await frame.flush();
    const attachRequest = frame.posted.find((message) => message.type === 'attach');
    if (attachRequest?.type !== 'attach') {
      throw new Error('expected attach');
    }
    expect(attachRequest.payload.title).toHaveLength(GUEST_ATTACH_TITLE_MAX);
    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: attachRequest.id, ok: true });
    await attach;
    host.dispose();
  });

  test('posts a pull attach with author and branches', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    const attach = host.attach({
      providerId: 'gitlab',
      id: '!12',
      title: 'Fix login',
      url: 'https://gitlab.com/acme/app/-/merge_requests/12',
      kind: 'pull',
      author: 'ada',
      branches: { head: 'feature', base: 'main' },
    });
    await frame.flush();
    const attachRequest = frame.posted.find((message) => message.type === 'attach');
    if (attachRequest?.type !== 'attach') {
      throw new Error('expected attach');
    }
    expect(attachRequest.payload).toMatchObject({
      kind: 'pull',
      author: 'ada',
      branches: { head: 'feature', base: 'main' },
    });
    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: attachRequest.id, ok: true });
    await attach;
    host.dispose();
  });

  test('posts start-session with a worktree flag', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    const start = host.startSession({
      providerId: 'gitlab',
      id: '!12',
      title: 'Fix login',
      url: 'https://gitlab.com/acme/app/-/merge_requests/12',
      kind: 'pull',
      worktree: true,
    });
    await frame.flush();
    const posted = frame.posted.find((message) => message.type === 'start-session');
    if (posted?.type !== 'start-session') {
      throw new Error('expected start-session');
    }
    expect(posted.payload.worktree).toBe(true);
    await frame.receive({
      channel: OPENCHAMBER_SDK_CHANNEL,
      v: OPENCHAMBER_SDK_API_VERSION,
      type: 'result',
      id: posted.id,
      ok: true,
      payload: { sessionId: 'ses-9', sent: 'skipped' },
    });
    expect(await start).toEqual({ sessionId: 'ses-9', sent: 'skipped' });
    host.dispose();
  });

  test('posts prompt and session-link', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    const prompt = host.prompt({ text: 'Fix the login', send: true });
    const link = host.sessionLink({
      providerId: 'gitlab',
      id: '!12',
      title: 'Fix login',
      url: 'https://gitlab.com/acme/app/-/merge_requests/12',
    });
    await frame.flush();
    const promptRequest = frame.posted.find((message) => message.type === 'prompt');
    const linkRequest = frame.posted.find((message) => message.type === 'session-link');
    if (promptRequest?.type !== 'prompt' || linkRequest?.type !== 'session-link') {
      throw new Error('expected prompt and session-link');
    }
    expect(promptRequest.payload).toEqual({ text: 'Fix the login', send: true });
    await frame.receive({
      channel: OPENCHAMBER_SDK_CHANNEL,
      v: OPENCHAMBER_SDK_API_VERSION,
      type: 'result',
      id: promptRequest.id,
      ok: true,
      payload: { sent: 'sent' },
    });
    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: linkRequest.id, ok: true });
    expect(await prompt).toEqual({ sent: 'sent' });
    await link;
    host.dispose();
  });

  test('rejects prompt when the session is busy', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    const pending = host.prompt({ text: 'Wait', send: true });
    const pendingResult = pending.catch((error) => {
      expect(error).toMatchObject({ code: 'SESSION_BUSY' });
    });
    await frame.flush();
    const posted = frame.posted.find((message) => message.type === 'prompt');
    if (posted?.type !== 'prompt') {
      throw new Error('expected prompt');
    }
    await frame.receive({
      channel: OPENCHAMBER_SDK_CHANNEL,
      v: OPENCHAMBER_SDK_API_VERSION,
      type: 'result',
      id: posted.id,
      ok: false,
      error: 'Session is busy.',
      code: 'SESSION_BUSY',
    });
    await pendingResult;
    host.dispose();
  });

  test('replays connection and settings from ready', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    await frame.receive({
      ...ready,
      payload: {
        ...ready.payload,
        connection: { connected: true, account: 'ada' },
        settings: { 'list-id': '123' },
      },
    });

    let account = '';
    let listId = '';
    host.onConnection((connection) => {
      account = connection.account;
    });
    host.onSettings((settings) => {
      listId = settings['list-id'] ?? '';
    });
    expect(account).toBe('ada');
    expect(listId).toBe('123');
    host.dispose();
  });

  test('resolves request with the host payload', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    const pending = host.request({ method: 'GET', path: '/api/v2/user' });
    await frame.flush();
    const posted = frame.posted.find((message) => message.type === 'request');
    if (posted?.type !== 'request') {
      throw new Error('expected request');
    }
    await frame.receive({
      channel: OPENCHAMBER_SDK_CHANNEL,
      v: OPENCHAMBER_SDK_API_VERSION,
      type: 'result',
      id: posted.id,
      ok: true,
      payload: { status: 200, body: '{"user":{"username":"ada"}}' },
    });
    await expect(pending).resolves.toEqual({
      status: 200,
      body: '{"user":{"username":"ada"}}',
    });
    host.dispose();
  });

  test('posts file calls and narrows their results', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    const answer = async (type: GuestMessage['type'], payload: object) => {
      await frame.flush();
      const posted = frame.posted.at(-1);
      if (posted?.type !== type || !('id' in posted)) {
        throw new Error(`expected ${type}`);
      }
      await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: posted.id, ok: true, payload });
      return posted;
    };
    const read = host.readFile('README.md');
    expect(await answer('file-read', { content: '# hi' })).toMatchObject({ payload: { path: 'README.md' } });
    await expect(read).resolves.toEqual({ content: '# hi' });

    const write = host.writeFile('notes.txt', 'x');
    expect(await answer('file-write', { written: true })).toMatchObject({ payload: { path: 'notes.txt', content: 'x' } });
    await expect(write).resolves.toEqual({ written: true });

    const list = host.listDir('.');
    await answer('file-list', { entries: [{ name: 'a', kind: 'file' }] });
    await expect(list).resolves.toEqual({ entries: [{ name: 'a', kind: 'file' }] });

    const stat = host.stat('~/.config/x');
    await answer('file-stat', { kind: 'missing', size: 0, mtime: 0 });
    await expect(stat).resolves.toEqual({ kind: 'missing', size: 0, mtime: 0 });

    const mismatch = host.readFile('a');
    const mismatchResult = mismatch.catch((error) => {
      expect(error).toMatchObject({ code: 'HOST_REJECTED' });
    });
    await answer('file-read', { written: true });
    await mismatchResult;
    host.dispose();
  });

  test('generate posts a trimmed prompt, clamps output tokens, and reads text back', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    const answer = async (payload: object) => {
      await frame.flush();
      const posted = frame.posted.at(-1);
      if (posted?.type !== 'generate') {
        throw new Error('expected generate');
      }
      await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: posted.id, ok: true, payload });
      return posted;
    };
    const generated = host.generate({ prompt: '  Summarize this  ', system: 'Be brief', maxOutputTokens: 99_999 });
    const first = await answer({ text: 'Short.' });
    expect(first).toMatchObject({
      type: 'generate',
      payload: { prompt: 'Summarize this', system: 'Be brief', maxOutputTokens: GUEST_GENERATE_OUTPUT_TOKENS_MAX },
    });
    await expect(generated).resolves.toEqual({ text: 'Short.' });

    const bare = host.generate({ prompt: 'x' });
    const second = await answer({ text: '' });
    expect(second).not.toHaveProperty('payload.system');
    await expect(bare).resolves.toEqual({ text: '' });

    const mismatch = host.generate({ prompt: 'y' });
    const mismatchResult = mismatch.catch((error) => {
      expect(error).toMatchObject({ code: 'HOST_REJECTED' });
    });
    await answer({ status: 200, body: 'nope' });
    await mismatchResult;

    await expect(host.generate({ prompt: '   ' })).rejects.toMatchObject({ code: 'HOST_REJECTED' });
    await expect(host.generate({ prompt: 'x'.repeat(GUEST_GENERATE_PROMPT_MAX + 1) })).rejects.toMatchObject({ code: 'HOST_REJECTED' });
    expect(frame.posted).toHaveLength(4);
    host.dispose();
  });

  test('refuses a bad file path or oversized content without posting', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    await expect(host.readFile('')).rejects.toMatchObject({ code: 'BAD_PATH' });
    await expect(host.stat('x'.repeat(GUEST_FILE_PATH_MAX + 1))).rejects.toMatchObject({ code: 'BAD_PATH' });
    await expect(host.writeFile('a', 'x'.repeat(GUEST_FILE_CONTENT_MAX + 1))).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    await frame.flush();
    expect(frame.posted).toHaveLength(1);
    host.dispose();
  });

  test('rejects a request with the host error code', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    const pending = host.request({ method: 'GET', path: '/api/v2/user' });
    const pendingResult = pending.catch((error) => {
      expect(error).toMatchObject({ code: 'DISCONNECTED', message: 'Not connected.' });
    });
    await frame.flush();
    const posted = frame.posted.find((message) => message.type === 'request');
    if (posted?.type !== 'request') {
      throw new Error('expected request');
    }
    await frame.receive({
      channel: OPENCHAMBER_SDK_CHANNEL,
      v: OPENCHAMBER_SDK_API_VERSION,
      type: 'result',
      id: posted.id,
      ok: false,
      error: 'Not connected.',
      code: 'DISCONNECTED',
    });
    await pendingResult;
    host.dispose();
  });

  test('rejects when the host stays silent past the timeout', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({
      target: frame,
      acceptSource: () => true,
      requestTimeoutMs: 5,
    });
    await expect(host.request({ method: 'GET', path: '/api/v2/user' })).rejects.toMatchObject({ code: 'HOST_TIMEOUT' });
    host.dispose();
  });
});

describe('connectHost resolve and badge', () => {
  const resolveMessage = (id: string, command: string, args: string): HostMessage => ({
    channel: OPENCHAMBER_SDK_CHANNEL,
    v: OPENCHAMBER_SDK_API_VERSION,
    type: 'resolve',
    id,
    payload: { command, args },
  });

  test('answers resolve with the handler item, null, or an error, and refuses without a handler', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });

    await frame.receive(resolveMessage('r-0', 'task', '1'));
    await frame.flush();
    expect(frame.posted.at(-1)).toMatchObject({ type: 'resolve-result', id: 'r-0', payload: { error: 'This extension does not resolve commands.' } });

    const seen: Array<{ command: string; args: string }> = [];
    const off = host.onResolve(async (request) => {
      seen.push(request);
      if (request.args === 'none') return null;
      if (request.args === 'boom') throw new Error('Task service is down');
      return { ...demoItem, title: `${demoItem.title} `.repeat(40) };
    });

    await frame.receive(resolveMessage('r-1', 'task', 'DEMO-1'));
    await frame.receive(resolveMessage('r-2', 'task', 'none'));
    await frame.receive(resolveMessage('r-3', 'task', 'boom'));
    await frame.flush();

    expect(seen).toEqual([
      { command: 'task', args: 'DEMO-1' },
      { command: 'task', args: 'none' },
      { command: 'task', args: 'boom' },
    ]);
    const answers = frame.posted.filter((message) => message.type === 'resolve-result');
    expect(answers).toHaveLength(4);
    expect(answers[1]).toMatchObject({ id: 'r-1', payload: { item: { id: 'DEMO-1', kind: 'issue' } } });
    const itemAnswer = answers[1];
    if (itemAnswer?.type === 'resolve-result' && itemAnswer.payload.item) {
      expect(itemAnswer.payload.item.title.length).toBe(GUEST_ATTACH_TITLE_MAX);
    }
    expect(answers[2]).toMatchObject({ id: 'r-2', payload: { item: null } });
    expect(answers[3]).toMatchObject({ id: 'r-3', payload: { error: 'Task service is down' } });

    off();
    await frame.receive(resolveMessage('r-4', 'task', 'x'));
    await frame.flush();
    expect(frame.posted.at(-1)).toMatchObject({ id: 'r-4', payload: { error: 'This extension does not resolve commands.' } });
    host.dispose();
  });

  test('setBadge clamps to 0..999 and sends null to clear', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });

    const calls = [3, 5000, -2, 2.6, null].map((count) => host.setBadge(count).catch(() => undefined));
    await frame.flush();
    const badges = frame.posted.filter((message) => message.type === 'badge');
    expect(badges.map((message) => message.type === 'badge' ? message.payload.count : undefined)).toEqual([3, 999, 0, 3, null]);
    host.dispose();
    await Promise.all(calls);
  });

  test('openCommit posts a valid hash and refuses anything else locally', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    const sent = host.openCommit('abcdef1').catch(() => undefined);
    await expect(host.openCommit('main')).rejects.toMatchObject({ code: 'HOST_REJECTED' });
    await frame.flush();
    expect(frame.posted.filter((message) => message.type === 'open-commit').map((message) => message.type === 'open-commit' ? message.payload.sha : '')).toEqual(['abcdef1']);
    host.dispose();
    await sent;
  });

  test('openWalkthrough posts a trimmed base and refuses an empty or oversized one locally', async () => {
    const guest = createMessageChannelFrame();
    const host = connectHost({ target: guest, acceptSource: () => true });
    const sent = host.openWalkthrough({ base: ' origin/main ' }).catch(() => undefined);
    await expect(host.openWalkthrough({ base: '  ' })).rejects.toMatchObject({ code: 'HOST_REJECTED' });
    await expect(host.openWalkthrough({ base: 'x'.repeat(256) })).rejects.toMatchObject({ code: 'HOST_REJECTED' });
    await guest.flush();
    expect(guest.posted.filter((message) => message.type === 'open-walkthrough').map((message) => (message.type === 'open-walkthrough' ? message.payload.base : ''))).toEqual(['origin/main']);
    host.dispose();
    await sent;
  });

  test('setHeight sends whole pixels within the wire range', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });

    const calls = [180, 12.2, -5, 50_000, Number.NaN].map((height) => host.setHeight(height).catch(() => undefined));
    await frame.flush();
    const sizes = frame.posted.filter((message) => message.type === 'resize');
    expect(sizes.map((message) => message.type === 'resize' ? message.payload.height : undefined)).toEqual([180, 13, 0, 10_000, 0]);
    host.dispose();
    await Promise.all(calls);
  });

  test('replays a message item to a late onItem listener', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    const messageItem = {
      kind: 'message' as const,
      action: 'create-task',
      sessionId: 'ses-1',
      sessionTitle: 'Hello',
      directory: '/repo',
      messageId: 'msg-1',
      role: 'assistant' as const,
      text: 'Do the thing.',
    };
    await frame.receive({ ...ready, payload: { ...ready.payload, item: messageItem } });
    const seen: typeof messageItem[] = [];
    host.onItem((item) => { if (item) seen.push(item); });
    expect(seen).toEqual([messageItem]);
    host.dispose();
  });

  test('shells subscriptions, output reads, and stops use the wire contract', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    const seen: string[] = [];
    const subscription = host.onRunningShells({ kind: 'session', sessionId: 'ses_1' }, (snapshot) => seen.push(snapshot.scope.kind));
    await frame.flush();
    const call = frame.posted.at(-1);
    if (call?.type !== 'shells-subscribe') throw new Error('Expected subscription');
    expect(call.payload.scope).toEqual({ kind: 'session', sessionId: 'ses_1' });
    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'shells', payload: { subscriptionId: call.payload.subscriptionId, snapshot: { kind: 'shells', scope: { kind: 'session', sessionId: 'ses_1' }, shells: [], ended: [] } } });
    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: call.id, ok: true });
    const stop = await subscription;
    expect(seen).toEqual(['session']);
    stop();
    await frame.flush();
    expect(frame.posted.at(-1)?.type).toBe('shells-unsubscribe');
    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'shells', payload: { subscriptionId: call.payload.subscriptionId, snapshot: { kind: 'shells', scope: { kind: 'session', sessionId: 'ses_1' }, shells: [], ended: [] } } });
    expect(seen).toEqual(['session']);

    const outputPromise = host.readShellOutput('sh_1', { cursor: 10, tailBytes: 1024 });
    await frame.flush();
    const outputCall = frame.posted.at(-1);
    if (outputCall?.type !== 'shell-output') throw new Error('Expected output call');
    expect(outputCall.payload).toEqual({ shellId: 'sh_1', cursor: 10, tailBytes: 1024 });
    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: outputCall.id, ok: true, payload: { output: 'tick', cursor: 14, skipped: false } });
    await expect(outputPromise).resolves.toEqual({ output: 'tick', cursor: 14, skipped: false });

    const stopPromise = host.stopShell('sh_1');
    await frame.flush();
    const stopCall = frame.posted.at(-1);
    if (stopCall?.type !== 'shell-stop') throw new Error('Expected stop call');
    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: stopCall.id, ok: true, payload: { stopped: true } });
    await expect(stopPromise).resolves.toEqual({ stopped: true });

    await expect(host.readShellOutput('')).rejects.toMatchObject({ code: 'HOST_REJECTED' });
    host.dispose();
  });

  test('project and global shell scopes post their scope and reject empty identities', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    const globalSubscription = host.onRunningShells({ kind: 'global' }, () => {});
    await frame.flush();
    const globalCall = frame.posted.at(-1);
    if (globalCall?.type !== 'shells-subscribe') throw new Error('Expected subscription');
    expect(globalCall.payload.scope).toEqual({ kind: 'global' });
    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: globalCall.id, ok: true });
    await globalSubscription;
    const projectSubscription = host.onRunningShells({ kind: 'project', projectId: 'p1' }, () => {});
    await frame.flush();
    const projectCall = frame.posted.at(-1);
    if (projectCall?.type !== 'shells-subscribe') throw new Error('Expected subscription');
    expect(projectCall.payload.scope).toEqual({ kind: 'project', projectId: 'p1' });
    await frame.receive({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: projectCall.id, ok: true });
    await projectSubscription;
    await expect(host.onRunningShells({ kind: 'project', projectId: '' }, () => {})).rejects.toMatchObject({ code: 'HOST_REJECTED' });
    await expect(host.onRunningShells({ kind: 'session', sessionId: ' ' }, () => {})).rejects.toMatchObject({ code: 'HOST_REJECTED' });
    host.dispose();
  });

  test('readShellOutput refuses out-of-range options before posting', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    await expect(host.readShellOutput('sh_1', { cursor: -1 })).rejects.toMatchObject({ code: 'HOST_REJECTED' });
    await expect(host.readShellOutput('sh_1', { cursor: 1.5 })).rejects.toMatchObject({ code: 'HOST_REJECTED' });
    await expect(host.readShellOutput('sh_1', { tailBytes: 0 })).rejects.toMatchObject({ code: 'HOST_REJECTED' });
    await expect(host.readShellOutput('sh_1', { tailBytes: GUEST_SHELL_OUTPUT_TAIL_MAX + 1 })).rejects.toMatchObject({ code: 'HOST_REJECTED' });
    await frame.flush();
    expect(frame.posted).toHaveLength(1);
    host.dispose();
  });
});

describe('late generate results', () => {
  const late = { request: { prompt: 'Summarize' }, ok: true as const, result: { text: 'Short.' } };
  const failed = { request: { prompt: 'Again' }, ok: false as const, code: 'MODEL_FAILED' as const, error: 'The Small Model could not complete this request.' };
  const supporting: HostMessage = { ...ready, payload: { ...ready.payload, features: { lateGenerateResults: true } } };
  const lateMessage = (payload: typeof late | typeof failed): HostMessage => ({
    channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'generate-late', payload,
  });
  const listens = (frame: MessageChannelFrame) => frame.posted.filter((message) => message.type === 'generate-late-listen').length;

  test('listens only on a host that keeps late answers, and hands each one over', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    const results: unknown[] = [];
    const stop = host.onLateGenerateResult((result) => results.push(result));
    // No ready yet, then an older host without the feature: nothing to listen to.
    await frame.receive(ready);
    expect(listens(frame)).toBe(0);
    await frame.receive(supporting);
    expect(listens(frame)).toBe(1);
    // Every later ready repeats it, so a host that re-attached knows again.
    await frame.receive(supporting);
    expect(listens(frame)).toBe(2);
    await frame.receive(lateMessage(late));
    await frame.receive(lateMessage(failed));
    expect(results).toEqual([late, failed]);
    stop();
    await frame.receive(supporting);
    expect(listens(frame)).toBe(2);
    // The host may still push after the last listener left; the answer waits for the next one.
    await frame.receive(lateMessage(late));
    expect(results).toHaveLength(2);
    const later: unknown[] = [];
    host.onLateGenerateResult((result) => later.push(result));
    expect(later).toEqual([late]);
    host.dispose();
  });

  test('a listener registered after ready listens at once', async () => {
    const frame = createMessageChannelFrame();
    const host = connectHost({ target: frame, acceptSource: () => true });
    await frame.receive(supporting);
    expect(listens(frame)).toBe(0);
    host.onLateGenerateResult(() => undefined);
    await frame.flush();
    expect(listens(frame)).toBe(1);
    host.dispose();
  });
});

describe('openMicrophone', () => {
  type FakeProcessor = { onaudioprocess: ((event: { outputBuffer: { getChannelData: () => Float32Array } }) => void) | null; connected: boolean };
  const installAudio = () => {
    const made: { processor: FakeProcessor; stopped: () => boolean; closed: () => boolean }[] = [];
    class FakeAudioContext {
      sampleRate = 48_000;
      state = 'running';
      private closedFlag = false;
      private trackStopped = false;
      constructor() {
        const processor: FakeProcessor = { onaudioprocess: null, connected: false };
        made.push({ processor, stopped: () => this.trackStopped, closed: () => this.closedFlag });
        this.processor = processor;
      }
      processor: FakeProcessor;
      createScriptProcessor() {
        const processor = this.processor;
        return Object.assign(processor, { connect: () => { processor.connected = true; }, disconnect: () => { processor.connected = false; } });
      }
      createMediaStreamDestination() {
        return { stream: { getTracks: () => [{ stop: () => { this.trackStopped = true; } }] } };
      }
      resume() { return Promise.resolve(); }
      close() { this.closedFlag = true; return Promise.resolve(); }
    }
    const previous = globalThis.AudioContext;
    Object.defineProperty(globalThis, 'AudioContext', { value: FakeAudioContext, configurable: true, writable: true });
    return { made, restore: () => Object.defineProperty(globalThis, 'AudioContext', { value: previous, configurable: true, writable: true }) };
  };

  const microphoneReady = { ...ready, payload: { ...ready.payload, features: { microphone: true } } };
  const connect = async () => {
    const guest = createMessageChannelFrame();
    const parent = guest;
    const host = connectHost({ target: guest, acceptSource: () => true });
    await guest.receive(microphoneReady);
    const envelope = { channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION } as const;
    const deliver = (data: HostMessage) => guest.receive(data);
    const answer = (id: string, outcome: { ok: true } | { ok: false; error: string; code: 'DENIED' }) => deliver(
      outcome.ok ? { ...envelope, type: 'result', id, ok: true, payload: { opened: true } } : { ...envelope, type: 'result', id, ...outcome },
    );
    const pushAudio = (samples: Float32Array<ArrayBuffer>) => deliver({ ...envelope, type: 'microphone-audio', payload: { samples } });
    const pushEnded = () => deliver({ ...envelope, type: 'microphone-ended', payload: { reason: 'revoked' } });
    return { parent, guest, host, answer, pushAudio, pushEnded };
  };
  const lastOpen = (posted: GuestMessage[]) => {
    const open = posted.filter((message) => message.type === 'microphone-open').at(-1);
    if (!open) throw new Error('No microphone-open was posted.');
    return open;
  };
  const closes = (posted: GuestMessage[]) => posted.filter((message) => message.type === 'microphone-close').length;

  test('is UNSUPPORTED on a host without the feature, before asking anything', async () => {
    const audio = installAudio();
    try {
      const frame = createMessageChannelFrame();
      const host = connectHost({ target: frame, acceptSource: () => true });
      await frame.receive(ready);
      await expect(host.openMicrophone()).rejects.toMatchObject({ code: 'UNSUPPORTED' });
      expect(frame.posted.some((message) => message.type === 'microphone-open')).toBe(false);
      expect(audio.made).toHaveLength(0);
      host.dispose();
    } finally {
      audio.restore();
    }
  });

  test('asks at the frame rate, plays host audio into the stream, and closes on both sides', async () => {
    const audio = installAudio();
    try {
      const { parent, host, answer, pushAudio } = await connect();
      const opening = host.openMicrophone();
      await parent.flush();
      const request = lastOpen(parent.posted);
      expect(request).toMatchObject({ payload: { sampleRate: 48_000 } });
      answer(request.id, { ok: true });
      const microphone = await opening;
      await expect(host.openMicrophone()).rejects.toMatchObject({ code: 'HOST_REJECTED' });

      await pushAudio(new Float32Array([0.5, -0.5]));
      const out = new Float32Array(3);
      audio.made[0].processor.onaudioprocess?.({ outputBuffer: { getChannelData: () => out } });
      expect([...out]).toEqual([0.5, -0.5, 0]);

      microphone.close();
      microphone.close();
      await parent.flush();
      expect(closes(parent.posted)).toBe(1);
      expect(audio.made[0].stopped()).toBe(true);
      expect(audio.made[0].closed()).toBe(true);
      host.dispose();
    } finally {
      audio.restore();
    }
  });

  test('a refusal rejects with its code, releases the frame audio, and tells the host to let go', async () => {
    const audio = installAudio();
    try {
      const { parent, host, answer } = await connect();
      const opening = host.openMicrophone();
      await parent.flush();
      answer(lastOpen(parent.posted).id, { ok: false, error: 'Microphone access was refused.', code: 'DENIED' });
      await expect(opening).rejects.toMatchObject({ code: 'DENIED' });
      expect(audio.made[0].stopped()).toBe(true);
      await parent.flush();
      expect(closes(parent.posted)).toBe(1);
      // Nothing stays open, so the user can try again.
      const again = host.openMicrophone();
      await parent.flush();
      answer(lastOpen(parent.posted).id, { ok: true });
      await expect(again).resolves.toBeDefined();
      host.dispose();
    } finally {
      audio.restore();
    }
  });

  test('the host ending the capture reaches onEnded and ends the stream', async () => {
    const audio = installAudio();
    try {
      const { parent, host, answer, pushEnded } = await connect();
      const opening = host.openMicrophone();
      await parent.flush();
      answer(lastOpen(parent.posted).id, { ok: true });
      const microphone = await opening;
      const reasons: string[] = [];
      microphone.onEnded((reason) => reasons.push(reason));
      await pushEnded();
      expect(reasons).toEqual(['revoked']);
      expect(audio.made[0].stopped()).toBe(true);
      // Closing after the host ended it sends nothing more.
      microphone.close();
      await parent.flush();
      expect(closes(parent.posted)).toBe(0);
      host.dispose();
    } finally {
      audio.restore();
    }
  });

  test('dispose releases an open microphone on the host', async () => {
    const audio = installAudio();
    try {
      const { parent, host, answer } = await connect();
      const opening = host.openMicrophone();
      await parent.flush();
      answer(lastOpen(parent.posted).id, { ok: true });
      await opening;
      host.dispose();
      await parent.flush();
      expect(closes(parent.posted)).toBe(1);
      expect(audio.made[0].stopped()).toBe(true);
    } finally {
      audio.restore();
    }
  });
});
