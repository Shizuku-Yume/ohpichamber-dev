import type { OmpSettingsState } from '@openchamber/agent-contract';
import { afterEach, expect, jest, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  localStorage: browser.localStorage,
  Node: browser.Node,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement,
  HTMLTextAreaElement: browser.HTMLTextAreaElement,
  Event: browser.Event,
  FocusEvent: browser.FocusEvent,
  MouseEvent: browser.MouseEvent,
  PointerEvent: browser.PointerEvent,
  KeyboardEvent: browser.KeyboardEvent,
  CustomEvent: browser.CustomEvent,
  MutationObserver: browser.MutationObserver,
  ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

// React's input-event support is detected when react-dom loads.
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { ThemeSystemProvider } = await import('@/contexts/ThemeSystemContext');
const { useProjectsStore } = await import('@/stores/useProjectsStore');
const { canonicalClient, CanonicalApiError } = await import('@/api/canonicalClient');
const { BehaviorPage } = await import('./BehaviorPage');

const container = document.createElement('div');
document.body.appendChild(container);
let root = createRoot(container);
const fetchSpy = spyOn(globalThis, 'fetch');
const resolveSpy = spyOn(canonicalClient, 'resolveWorkspace');
const readFilesSpy = spyOn(canonicalClient.fileResources, 'getBehaviorFiles');

afterEach(async () => {
  await act(async () => root.unmount());
  root = createRoot(container);
  fetchSpy.mockRestore();
  resolveSpy.mockReset();
  readFilesSpy.mockReset();
});

test('a slow prompt save preserves and then persists the newer blurred draft', async () => {
  const writes: Array<{ content: string; expectedContent: string | null; finish: () => void }> = [];
  const settingsWrites: Array<() => void> = [];
  let persisted = 'initial';
  resolveSpy.mockResolvedValue({ workspaceId: 'workspace', projectId: 'project', name: 'Demo' });
  readFilesSpy.mockRejectedValue(
    new CanonicalApiError({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      code: 'NOT_IMPLEMENTED',
      detail: 'Unavailable',
      retryable: false,
    }),
  );

  fetchSpy.mockImplementation(async (input, init) => {
    const request = new Request(input instanceof Request ? input : new URL(input, window.location.href), init);
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/behavior/agents-md') {
      if (request.method === 'GET') {
        return Response.json({ content: persisted, exists: true, path: '/test/AGENTS.md' });
      }
      const body: { content: string; expectedContent: string | null } = await request.json();
      return new Promise<Response>((resolve) => {
        writes.push({
          content: body.content,
          expectedContent: body.expectedContent,
          finish: () => {
            persisted = body.content;
            resolve(Response.json({ success: true }));
          },
        });
      });
    }
    if (pathname === '/api/config/settings') {
      if (request.method === 'GET') return Response.json({});
      const body = await request.text();
      const reply = () => new Response(
        JSON.stringify({
          ...JSON.parse(body),
          projects: [{ path: '/test' }],
          activeProjectId: 'path_L3Rlc3Q',
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
      const keys = Object.keys(JSON.parse(body));
      if (keys.some((key) => key.startsWith('responseStyle'))) {
        return new Promise<Response>((resolve) => {
          settingsWrites.push(() => resolve(reply()));
        });
      }
      return reply();
    }
    if (pathname === '/api/agent/v1/workspaces/workspace/settings') {
      return Response.json({ workspaceId: 'workspace', revision: '1', totalCount: 0, settings: [] });
    }
    throw new Error(`Unexpected request: ${request.method} ${pathname}`);
  });

  const settle = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };
  useProjectsStore.setState({
    projects: [{ id: 'path_L3Rlc3Q', path: '/test' }],
    activeProjectId: 'path_L3Rlc3Q',
  });
  await act(async () => {
    root.render(<ThemeSystemProvider><I18nProvider><BehaviorPage /></I18nProvider></ThemeSystemProvider>);
  });
  await settle();
  const prompt = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="AGENTS.md"]');
  if (!prompt) throw new Error('Missing system prompt field');
  expect(prompt.disabled).toBe(false);
  expect(prompt.className).toContain('font-mono');
  expect(prompt.getAttribute('rows')).toBeNull();
  expect(container.textContent).toContain('Global rules are combined with project rules');

  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (!setValue) throw new Error('Missing native textarea setter');
  const edit = async (value: string) => {
    await act(async () => {
      setValue.call(prompt, value);
      prompt.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      prompt.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    await settle();
  };

  await edit('older');
  await edit('newer');
  expect(writes.map((write) => write.content)).toEqual(['older\n']);
  await act(async () => {
    writes[0].finish();
  });
  expect(prompt.value).toBe('newer');

  // AGENTS.md is the sole authority; prompt edits never write settings.
  jest.useFakeTimers();
  try {
    await act(async () => {
      jest.advanceTimersByTime(350);
    });
  } finally {
    jest.useRealTimers();
  }
  expect(settingsWrites).toHaveLength(0);
  await settle();
  expect(writes.map((write) => write.content)).toEqual(['older\n', 'newer\n']);
  expect(writes.map((write) => write.expectedContent)).toEqual(['initial', 'older\n']);
  await act(async () => {
    writes[1].finish();
  });
  await settle();
  expect(prompt.value.trim()).toBe('newer');
  expect(persisted).toBe('newer\n');

  // An edit made in another editor shows up when the window is focused again.
  persisted = 'edited elsewhere\n';
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  await settle();
  expect(prompt.value).toBe('edited elsewhere\n');
});

test('sidebar groups Global and Project entries, keeps Prompt & Personality accessible, and surfaces AGENTS.md fetch failures', async () => {
  resolveSpy.mockResolvedValue({ workspaceId: 'workspace', projectId: 'project', name: 'Demo' });
  readFilesSpy.mockResolvedValue({
    workspaceId: 'workspace',
    revision: '1',
    scopes: ['agent'],
    files: [
      {
        kind: 'rule',
        scope: 'agent',
        name: 'strict.mdc',
        version: 'a'.repeat(64),
        content: 'Be strict.',
        fields: { alwaysApply: true, globs: ['src/**/*.ts'], interruptMode: 'tool-only' },
      },
      {
        kind: 'instruction',
        scope: 'agent',
        name: 'style.md',
        version: 'b'.repeat(64),
        content: 'Be clear.',
        fields: { applyTo: '**/*.md' },
      },
    ],
  });

  fetchSpy.mockImplementation(async (input, init) => {
    const request = new Request(input instanceof Request ? input : new URL(input, window.location.href), init);
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/behavior/agents-md') {
      return new Response(JSON.stringify({ error: 'Permission denied' }), { status: 500 });
    }
    if (pathname === '/api/config/settings') {
      if (request.method === 'GET') return Response.json({});
      const body = await request.text();
      return Response.json({
        ...JSON.parse(body),
        projects: [{ path: '/test' }],
        activeProjectId: 'path_L3Rlc3Q',
      });
    }
    throw new Error(`Unexpected request: ${request.method} ${pathname}`);
  });

  useProjectsStore.setState({
    projects: [{ id: 'path_L3Rlc3Q', path: '/test' }],
    activeProjectId: 'path_L3Rlc3Q',
  });
  await act(async () => {
    root.render(<ThemeSystemProvider><I18nProvider><BehaviorPage /></I18nProvider></ThemeSystemProvider>);
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(container.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');

  for (const id of [
    'behavior.system-prompt',
    'behavior.files.rules-md',
    'behavior.files.system-md',
    'behavior.rules',
    'behavior.instructions',
    'behavior.files.create',
  ]) {
    expect(container.querySelectorAll(`[data-settings-item="${id}"]`)).toHaveLength(1);
  }

  const promptNav = [...container.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === 'Prompt & Personality',
  );
  expect(promptNav).toBeDefined();
  await act(async () => {
    promptNav?.click();
  });
  expect(container.querySelectorAll('[data-settings-item="behavior.prompt-personality"]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-settings-item="behavior.response-style"]')).toHaveLength(1);
});

test('an OMP prompt write failure reports error state instead of saved', async () => {
  const { toast } = await import('@/components/ui');
  const toastErrorSpy = spyOn(toast, 'error');
  const state: OmpSettingsState = {
    workspaceId: 'workspace', revision: '1', totalCount: 1,
    settings: [{
      id: 'skillful', type: 'boolean', value: false, default: false, configured: false,
      placement: { type: 'page', page: 'behavior', section: 'prompt' },
    }],
  };
  const getSettingsSpy = spyOn(canonicalClient, 'getOmpSettings').mockResolvedValue(state);
  const updateSettingsSpy = spyOn(canonicalClient, 'updateOmpSettings').mockRejectedValue(
    new CanonicalApiError({
      type: 'about:blank', title: 'Internal', status: 500,
      code: 'SERVICE_UNAVAILABLE', detail: 'write denied', retryable: false,
    }),
  );
  resolveSpy.mockResolvedValue({ workspaceId: 'workspace', projectId: 'project', name: 'Demo' });
  readFilesSpy.mockResolvedValue({ workspaceId: 'workspace', revision: '1', scopes: ['agent'], files: [] });

  fetchSpy.mockImplementation(async (input, init) => {
    const request = new Request(input instanceof Request ? input : new URL(input, window.location.href), init);
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/behavior/agents-md') {
      return Response.json({ content: '', exists: false });
    }
    if (pathname === '/api/config/settings') {
      if (request.method === 'GET') return Response.json({});
      const body = await request.text();
      return Response.json({
        ...JSON.parse(body),
        projects: [{ path: '/test' }],
        activeProjectId: 'path_L3Rlc3Q',
      });
    }
    throw new Error(`Unexpected request: ${request.method} ${pathname}`);
  });

  useProjectsStore.setState({
    projects: [{ id: 'path_L3Rlc3Q', path: '/test' }],
    activeProjectId: 'path_L3Rlc3Q',
  });
  try {
    await act(async () => {
      root.render(<ThemeSystemProvider><I18nProvider><BehaviorPage /></I18nProvider></ThemeSystemProvider>);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const promptNav = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Prompt & Personality',
    );
    await act(async () => {
      promptNav?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const checkbox = container.querySelector<HTMLElement>('[data-settings-item="behavior.prompt-personality"] [role="checkbox"]');
    expect(checkbox).not.toBeNull();
    await act(async () => {
      checkbox?.click();
      await Promise.resolve();
    });

    expect(updateSettingsSpy).toHaveBeenCalled();
    expect(toastErrorSpy).toHaveBeenCalled();
  } finally {
    getSettingsSpy.mockRestore();
    updateSettingsSpy.mockRestore();
    toastErrorSpy.mockRestore();
  }
});
