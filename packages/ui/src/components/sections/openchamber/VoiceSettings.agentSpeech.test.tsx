import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Root } from 'react-dom/client';
import type { OmpSettingsState } from '@openchamber/agent-contract';
import { Window } from 'happy-dom';

const windowInstance = new Window({ url: 'http://localhost/' });
Object.defineProperty(windowInstance, 'speechSynthesis', {
  value: { getVoices: () => [], onvoiceschanged: null },
  configurable: true,
});

const globalNames = [
  'window',
  'document',
  'HTMLElement',
  'Element',
  'Node',
  'Event',
  'MouseEvent',
  'PointerEvent',
  'FocusEvent',
  'KeyboardEvent',
  'ResizeObserver',
  'MutationObserver',
  'IntersectionObserver',
  'localStorage',
  'sessionStorage',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'IS_REACT_ACT_ENVIRONMENT',
] as const;

const globalDescriptors = new Map(globalNames.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));

Object.assign(globalThis, {
  window: windowInstance,
  document: windowInstance.document,
  HTMLElement: windowInstance.HTMLElement,
  Element: windowInstance.Element,
  Node: windowInstance.Node,
  Event: windowInstance.Event,
  MouseEvent: windowInstance.MouseEvent,
  PointerEvent: windowInstance.PointerEvent,
  FocusEvent: windowInstance.FocusEvent,
  KeyboardEvent: windowInstance.KeyboardEvent,
  ResizeObserver: windowInstance.ResizeObserver,
  MutationObserver: windowInstance.MutationObserver,
  IntersectionObserver: class {
    observe() { }
    unobserve() { }
    disconnect() { }
  },
  localStorage: windowInstance.localStorage,
  sessionStorage: windowInstance.sessionStorage,
  getComputedStyle: windowInstance.getComputedStyle.bind(windowInstance),
  requestAnimationFrame: windowInstance.requestAnimationFrame.bind(windowInstance),
  cancelAnimationFrame: windowInstance.cancelAnimationFrame.bind(windowInstance),
  IS_REACT_ACT_ENVIRONMENT: true,
});

const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { canonicalClient } = await import('@/api/canonicalClient');
const directoryModule = await import('@/hooks/useSettingsDirectory');
const { I18nProvider } = await import('@/lib/i18n');
const { ompSettingsI18n } = await import('@/lib/i18n/messages/omp-settings.i18n');
const { browserVoiceService } = await import('@/lib/voice/browserVoiceService');
const { VoiceSettings } = await import('./VoiceSettings');

const flushMicrotasks = async () => {
  await act(async () => {
    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve();
    }
  });
};

const buildVoiceSnapshot = (revision: string, voice: string, speed: number): OmpSettingsState => ({
  workspaceId: 'workspace_1',
  revision,
  totalCount: 3,
  settings: [
    {
      id: 'tts.localVoice',
      type: 'enum',
      value: voice,
      default: 'harper',
      configured: true,
      label: 'Local TTS Voice',
      description: 'Phonon voice used by the local TTS backend (American/British, female/male)',
      placement: { type: 'page', page: 'voice', section: 'agent-speech' },
      options: [
        { value: 'harper', label: 'Harper (American female)' },
        { value: 'hadley', label: 'Hadley (American female)' },
        { value: 'delia', label: 'Delia (American female)' },
        { value: 'caleb', label: 'Caleb (American male)' },
      ],
    },
    {
      id: 'tts.localSpeed',
      type: 'number',
      value: speed,
      default: 1,
      configured: true,
      label: 'Local TTS Speed',
      description: 'Speaking rate of the local TTS backend (tts tool, omp say). 1 = normal; clamped to 0.8–1.3',
      placement: { type: 'page', page: 'voice', section: 'agent-speech' },
      options: [
        { value: '0.8', label: '0.8×' },
        { value: '0.9', label: '0.9×' },
        { value: '1', label: '1× (normal)' },
        { value: '1.1', label: '1.1×' },
        { value: '1.2', label: '1.2×' },
        { value: '1.3', label: '1.3×' },
      ],
    },
    {
      id: 'speech.enabled',
      type: 'boolean',
      value: false,
      default: false,
      configured: false,
      placement: { type: 'config-only' },
    },
  ],
});

describe('VoiceSettings agent speech section', () => {
  let host: HTMLDivElement;
  let root: Root;
  let originalFetch: typeof globalThis.fetch;
  let restoreSpies: Array<() => void>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    const unavailableResponse = new Response(JSON.stringify({ available: false, stt: false }), { status: 200 });
    globalThis.fetch = Object.assign(async () => unavailableResponse.clone(), originalFetch);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    const voicesSpy = spyOn(browserVoiceService, 'waitForVoices').mockResolvedValue([]);
    const dirSpy = spyOn(directoryModule, 'useSettingsDirectory').mockReturnValue('/repo');
    const workspaceSpy = spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue({
      workspaceId: 'workspace_1',
      projectId: 'project_1',
      name: 'repo',
    });
    restoreSpies = [
      () => voicesSpy.mockRestore(),
      () => dirSpy.mockRestore(),
      () => workspaceSpy.mockRestore(),
    ];
  });

  afterEach(async () => {
    try {
      await act(async () => root.unmount());
    } finally {
      for (const restore of restoreSpies) {
        restore();
      }
      host.remove();
      globalThis.fetch = originalFetch;
    }
  });

  afterAll(() => {
    windowInstance.close();
    for (const [name, descriptor] of globalDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });

  const renderVoiceSettings = async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <VoiceSettings />
        </I18nProvider>,
      );
    });
    await flushMicrotasks();
  };

  const selectOptionAt = async (settingId: string, optionIndex: number) => {
    const row = host.querySelector(`[data-settings-item="omp.${settingId}"]`);
    expect(row).not.toBeNull();
    const trigger = row?.querySelector('[role="combobox"]');
    expect(trigger).not.toBeNull();
    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    });
    await flushMicrotasks();
    const options = Array.from(document.querySelectorAll('[role="option"]'));
    const target = options[optionIndex];
    expect(target).toBeDefined();
    await act(async () => {
      if (target instanceof HTMLElement) {
        target.click();
      }
    });
    await flushMicrotasks();
  };

  test('renders both agent-speech rows from the OMP settings snapshot', async () => {
    const getSpy = spyOn(canonicalClient, 'getOmpSettings').mockResolvedValue(buildVoiceSnapshot('1', 'harper', 1));
    restoreSpies.push(() => getSpy.mockRestore());

    await renderVoiceSettings();

    const voiceRow = host.querySelector('[data-settings-item="omp.tts.localVoice"]');
    const speedRow = host.querySelector('[data-settings-item="omp.tts.localSpeed"]');
    expect(voiceRow).not.toBeNull();
    expect(speedRow).not.toBeNull();
    expect(host.querySelector('[data-settings-item="omp.speech.enabled"]')).toBeNull();
  });

  test('changing tts.localVoice and tts.localSpeed writes the setting id and value', async () => {
    const first = buildVoiceSnapshot('1', 'harper', 1);
    const second = buildVoiceSnapshot('2', 'hadley', 1);
    const third = buildVoiceSnapshot('3', 'hadley', 1.2);
    const getSpy = spyOn(canonicalClient, 'getOmpSettings').mockResolvedValue(first);
    const updateSpy = spyOn(canonicalClient, 'updateOmpSettings')
      .mockResolvedValueOnce(second)
      .mockResolvedValueOnce(third);
    restoreSpies.push(() => getSpy.mockRestore(), () => updateSpy.mockRestore());

    await renderVoiceSettings();

    await selectOptionAt('tts.localVoice', 1);
    expect(updateSpy.mock.calls).toEqual([
      ['workspace_1', {
        expectedRevision: '1',
        changes: [{ id: 'tts.localVoice', value: 'hadley' }],
      }],
    ]);

    await selectOptionAt('tts.localSpeed', 4);
    expect(updateSpy.mock.calls).toEqual([
      ['workspace_1', {
        expectedRevision: '1',
        changes: [{ id: 'tts.localVoice', value: 'hadley' }],
      }],
      ['workspace_1', {
        expectedRevision: '2',
        changes: [{ id: 'tts.localSpeed', value: 1.2 }],
      }],
    ]);
  });

  test('shows a load-failure notice when reading OMP settings fails', async () => {
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => { });
    const getSpy = spyOn(canonicalClient, 'getOmpSettings').mockRejectedValue(new Error('Agent Service unavailable'));
    restoreSpies.push(() => warnSpy.mockRestore(), () => getSpy.mockRestore());

    await renderVoiceSettings();

    const notice = host.querySelector('[role="status"]');
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain(ompSettingsI18n.en['settings.omp.loadFailed']);
    expect(host.querySelector('[data-settings-item="omp.tts.localVoice"]')).toBeNull();
    expect(host.querySelector('[data-settings-item="omp.tts.localSpeed"]')).toBeNull();
  });
});
