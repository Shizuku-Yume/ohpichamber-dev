import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createServer } from 'node:http';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { I18nProvider } from '@/lib/i18n';
import type { CanonicalEvent, Session, ShellJob } from '@openchamber/agent-contract';
import { configureRuntimeUrlResolver, getRuntimeUrlResolver, setRuntimeUrlResolver } from '@/lib/runtime-url';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { applyBackgroundShellEvents, resetBackgroundShells, type RunningShell } from '@/sync/background-shells';
import { BackgroundShellsStrip } from './BackgroundShellsStrip';
import { stopForegroundShell } from './message/parts/foregroundShellStop';

const session = (sessionId: string, parentSessionId?: string): Session => ({
  sessionId, parentSessionId, rootSessionId: parentSessionId ?? sessionId,
  projectId: 'project', workspaceId: 'workspace', displayPath: '.',
  createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0',
  runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
  metadata: null, metadataRevision: '0', archiveRevision: '0',
});

const shell = (jobId: string, sessionId: string, command: string, startedAt = Date.now()): RunningShell => ({
  jobId, sessionId, epoch: 'epoch', workerGeneration: 'worker',
  workspaceId: 'workspace', projectId: 'project', command,
  startedAt, outputCursor: '0', background: true, status: 'running',
});

const shellEvent = (job: ShellJob): CanonicalEvent => ({
  type: 'shell.updated', job, sessionId: job.sessionId,
  epoch: job.epoch, sequence: '1', timestamp: job.startedAt,
});

const start = (...shells: RunningShell[]) => act(async () => {
  applyBackgroundShellEvents('/repo', shells.map(shellEvent));
});

describe('BackgroundShellsStrip', () => {
  let windowInstance: Window;
  let host: HTMLDivElement;
  let root: Root;

  const descriptors = new Map<string, PropertyDescriptor | undefined>();

  beforeEach(async () => {
    windowInstance = new Window();
    const globals = {
      window: windowInstance,
      document: windowInstance.document,
      HTMLElement: windowInstance.HTMLElement,
      Element: windowInstance.Element,
      Node: windowInstance.Node,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    for (const [key, value] of Object.entries(globals)) {
      descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
    resetBackgroundShells();
    useGlobalSessionsStore.setState({
      entityById: new Map([
        ['ses_root', session('ses_root')],
        ['ses_child', session('ses_child', 'ses_root')],
        ['ses_other', session('ses_other')],
      ]),
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <I18nProvider>
          <BackgroundShellsStrip sessionId="ses_root" />
        </I18nProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    resetBackgroundShells();
  });

  const buttons = () => [...host.querySelectorAll('button')];
  const button = (label: string) => buttons().find((item) => item.textContent === label || item.getAttribute('aria-label') === label);

  test('renders nothing while no command of the session runs', async () => {
    await start(shell('sh_other', 'ses_other', 'bun run dev'));
    expect(host.innerHTML).toBe('');
  });

  test('a foreground command the turn is still waiting for stays out', async () => {
    await start({ ...shell('sh_waited', 'ses_root', 'bun run type-check'), background: false });
    expect(host.innerHTML).toBe('');
  });

  test('one command is its own row with a stop action', async () => {
    await start(shell('sh_1', 'ses_root', 'bun run dev --port 5391', Date.now() - 65_000));
    expect(host.textContent).toContain('bun run dev --port 5391');
    expect(host.textContent).toContain('1m 5s');
    expect(button('Stop')).toBeDefined();
  });

  test('several commands collapse into a count that expands in place', async () => {
    await start(shell('sh_1', 'ses_root', 'bun run dev'), shell('sh_2', 'ses_child', 'python -m http.server'));
    expect(host.textContent).toContain('Background commands: 2');
    expect(host.textContent).not.toContain('bun run dev');

    const header = buttons().find((item) => item.textContent === 'Background commands: 2');
    expect(header?.getAttribute('aria-expanded')).toBe('false');
    await act(async () => header?.click());
    expect(header?.getAttribute('aria-expanded')).toBe('true');
    expect(host.textContent).toContain('bun run dev');
    expect(host.textContent).toContain('python -m http.server');
    expect(host.textContent).toContain('subagent');
    expect(buttons().filter((item) => item.textContent === 'Stop')).toHaveLength(2);
  });

  test('stops the owning canonical job and waits for its end event before removing the row', async () => {
    const running = shell('sh_child', 'ses_child', 'vite preview');
    const ended: ShellJob = { ...running, status: 'ended', endedAt: Date.now(), termination: { reason: 'stopped', exitCode: null } };
    const requests: { method: string | undefined; url: string | undefined; body: unknown }[] = [];
    let received!: () => void;
    const requestReceived = new Promise<void>((resolve) => { received = resolve; });
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      requests.push({ method: request.method, url: request.url, body: JSON.parse(Buffer.concat(chunks).toString()) });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ job: ended }));
      received();
    });
    const previousResolver = getRuntimeUrlResolver();
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected loopback TCP listener');
      configureRuntimeUrlResolver({ apiBaseUrl: `http://127.0.0.1:${address.port}` });
      await start(running);
      await act(async () => {
        button('Stop')?.click();
        await requestReceived;
      });
      expect(requests).toEqual([{
        method: 'POST',
        url: '/api/agent/v1/sessions/ses_child/shell/jobs/sh_child/stop',
        body: { job: { sessionId: 'ses_child', jobId: 'sh_child', epoch: 'epoch', workerGeneration: 'worker' } },
      }]);
      expect(host.textContent).toContain('vite preview');
      expect(button('Stop')?.disabled).toBe(true);

      await act(async () => {
        applyBackgroundShellEvents('/repo', [shellEvent(ended)]);
      });
      expect(host.innerHTML).toBe('');
    } finally {
      setRuntimeUrlResolver(previousResolver);
      const closed = new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      server.closeAllConnections();
      await closed;
    }
  });
<<<<<<< HEAD
||||||| bc50ba56aa

  test('stop all stops every command with one call per owning session', async () => {
    const stop = spyOn(opencodeClient, 'stopBackgroundShells').mockResolvedValue(undefined);
    try {
      await start(
        shell('sh_1', 'ses_root', 'bun run dev'),
        shell('sh_2', 'ses_root', 'bun run watch'),
        shell('sh_3', 'ses_child', 'vite preview'),
      );
      expect(button('Stop')).toBeUndefined();
      await act(async () => button('Stop all')?.click());
      expect(stop.mock.calls).toEqual([
        [{
          sessionID: 'ses_root',
          sessionDirectory: '/repo',
          shells: [
            { shellID: 'sh_1', shellDirectory: '/repo', command: 'bun run dev' },
            { shellID: 'sh_2', shellDirectory: '/repo', command: 'bun run watch' },
          ],
        }],
        [{
          sessionID: 'ses_child',
          sessionDirectory: '/repo',
          shells: [{ shellID: 'sh_3', shellDirectory: '/repo', command: 'vite preview' }],
        }],
      ]);
      expect(button('Stop all')?.disabled).toBe(true);
    } finally {
      stop.mockRestore();
    }
  });

  test('a failed stop makes its commands stoppable again', async () => {
    const stop = spyOn(opencodeClient, 'stopBackgroundShells').mockRejectedValue(new Error('offline'));
    try {
      await start(shell('sh_1', 'ses_root', 'bun run dev'), shell('sh_2', 'ses_root', 'bun run watch'));
      await act(async () => button('Stop all')?.click());
      expect(stop.mock.calls).toHaveLength(1);
      expect(button('Stop all')?.disabled).toBe(false);
    } finally {
      stop.mockRestore();
    }
  });

  test('an image the session generates is its own row, without a stop', async () => {
    await startImage('image_1', 'ses_root', '/repo/assets/hero');
    expect(host.textContent).toContain('Generating an image');
    expect(host.textContent).toContain('hero');
    expect(button('Stop')).toBeUndefined();
  });

  test('a command and an image of a subagent collapse into one count; Stop all stops the command only', async () => {
    const stop = spyOn(opencodeClient, 'stopBackgroundShells').mockResolvedValue(undefined);
    await start(shell('sh_1', 'ses_root', 'bun run dev'));
    await startImage('image_1', 'ses_child', '/tmp/images/image_1');
    expect(host.textContent).toContain('In the background: 2');

    await act(async () => button('Stop all')?.click());
    expect(stop.mock.calls.map(([input]) => input.shells.map((item) => item.shellID))).toEqual([['sh_1']]);
    stop.mockRestore();
  });
=======

  test('stop all stops every command with one call per owning session', async () => {
    const stop = spyOn(opencodeClient, 'stopBackgroundShells').mockResolvedValue(undefined);
    try {
      await start(
        shell('sh_1', 'ses_root', 'bun run dev'),
        shell('sh_2', 'ses_root', 'bun run watch'),
        shell('sh_3', 'ses_child', 'vite preview'),
      );
      expect(button('Stop')).toBeUndefined();
      await act(async () => button('Stop all')?.click());
      expect(stop.mock.calls).toEqual([
        [{
          sessionID: 'ses_root',
          sessionDirectory: '/repo',
          shells: [
            { shellID: 'sh_1', shellDirectory: '/repo', command: 'bun run dev' },
            { shellID: 'sh_2', shellDirectory: '/repo', command: 'bun run watch' },
          ],
        }],
        [{
          sessionID: 'ses_child',
          sessionDirectory: '/repo',
          shells: [{ shellID: 'sh_3', shellDirectory: '/repo', command: 'vite preview' }],
        }],
      ]);
      expect(button('Stop all')?.disabled).toBe(true);
    } finally {
      stop.mockRestore();
    }
  });

  test('a command its chat row is stopping offers no second stop here', async () => {
    const waited = shell('sh_waited', 'ses_root', 'bun run test');
    // The row's stop moved the call to the background and is still on its way.
    const background = spyOn(opencodeClient, 'backgroundSessionWork').mockImplementation(() => {
      applyBackgroundShellEvents('/repo', [{
        type: 'message.tool.transition',
        properties: {
          sessionID: 'ses_root', messageID: 'msg_1', partID: 'call_sh_waited',
          transition: { kind: 'success', output: '', metadata: { status: 'running', shellID: 'sh_waited' }, executed: true, end: 2 },
        },
      }]);
      return new Promise<void>(() => {});
    });
    const stop = spyOn(opencodeClient, 'stopBackgroundShells').mockResolvedValue(undefined);
    try {
      await act(async () => { applyBackgroundShellEvents('/repo', [startEvent(waited)]); });
      await act(async () => { void stopForegroundShell({ sessionID: 'ses_root', sessionDirectory: '/repo', shell: { shellID: 'sh_waited', shellDirectory: '/repo', command: 'bun run test' } }); });
      expect(button('Stop')?.disabled).toBe(true);

      await start(shell('sh_dev', 'ses_root', 'bun run dev'));
      await act(async () => button('Stop all')?.click());
      expect(stop.mock.calls).toEqual([[{
        sessionID: 'ses_root',
        sessionDirectory: '/repo',
        shells: [{ shellID: 'sh_dev', shellDirectory: '/repo', command: 'bun run dev' }],
      }]]);
    } finally {
      background.mockRestore();
      stop.mockRestore();
    }
  });

  test('stop all is off while chat rows stop every listed command, and back after one of those stops fails', async () => {
    const waited = [shell('sh_fg_1', 'ses_root', 'bun run test'), shell('sh_fg_2', 'ses_root', 'bun run e2e')];
    const rejects: Array<(error: Error) => void> = [];
    // Backgrounding moves both calls to the background, then stays pending
    // until the test fails it.
    const background = spyOn(opencodeClient, 'backgroundSessionWork').mockImplementation(() => {
      applyBackgroundShellEvents('/repo', waited.map((value): SyncEvent => ({
        type: 'message.tool.transition',
        properties: {
          sessionID: 'ses_root', messageID: 'msg_1', partID: `call_${value.id}`,
          transition: { kind: 'success', output: '', metadata: { status: 'running', shellID: value.id }, executed: true, end: 2 },
        },
      })));
      return new Promise<void>((_resolve, reject) => { rejects.push(reject); });
    });
    const stop = spyOn(opencodeClient, 'stopBackgroundShells').mockResolvedValue(undefined);
    try {
      await act(async () => { applyBackgroundShellEvents('/repo', waited.map(startEvent)); });
      const stops = waited.map((value) => stopForegroundShell({
        sessionID: 'ses_root',
        sessionDirectory: '/repo',
        shell: { shellID: value.id, shellDirectory: '/repo', command: value.command },
      }).catch(() => undefined));
      await act(async () => {});
      expect(button('Stop all')?.disabled).toBe(true);

      await act(async () => {
        rejects[0]?.(new Error('offline'));
        await stops[0];
      });
      expect(button('Stop all')?.disabled).toBe(false);
      await act(async () => button('Stop all')?.click());
      expect(stop.mock.calls).toEqual([[{
        sessionID: 'ses_root',
        sessionDirectory: '/repo',
        shells: [{ shellID: 'sh_fg_1', shellDirectory: '/repo', command: 'bun run test' }],
      }]]);
    } finally {
      rejects.forEach((reject) => reject(new Error('done')));
      background.mockRestore();
      stop.mockRestore();
    }
  });

  test('a failed stop makes its commands stoppable again', async () => {
    const stop = spyOn(opencodeClient, 'stopBackgroundShells').mockRejectedValue(new Error('offline'));
    try {
      await start(shell('sh_1', 'ses_root', 'bun run dev'), shell('sh_2', 'ses_root', 'bun run watch'));
      await act(async () => button('Stop all')?.click());
      expect(stop.mock.calls).toHaveLength(1);
      expect(button('Stop all')?.disabled).toBe(false);
    } finally {
      stop.mockRestore();
    }
  });

  test('an image the session generates is its own row, without a stop', async () => {
    await startImage('image_1', 'ses_root', '/repo/assets/hero');
    expect(host.textContent).toContain('Generating an image');
    expect(host.textContent).toContain('hero');
    expect(button('Stop')).toBeUndefined();
  });

  test('a command and an image of a subagent collapse into one count; Stop all stops the command only', async () => {
    const stop = spyOn(opencodeClient, 'stopBackgroundShells').mockResolvedValue(undefined);
    await start(shell('sh_1', 'ses_root', 'bun run dev'));
    await startImage('image_1', 'ses_child', '/tmp/images/image_1');
    expect(host.textContent).toContain('In the background: 2');

    await act(async () => button('Stop all')?.click());
    expect(stop.mock.calls.map(([input]) => input.shells.map((item) => item.shellID))).toEqual([['sh_1']]);
    stop.mockRestore();
  });
>>>>>>> upstream/main
});
