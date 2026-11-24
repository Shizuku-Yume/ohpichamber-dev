import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { I18nProvider } from '@/lib/i18n';
import { useConfigStore } from '@/stores/useConfigStore';
import { useI18nStore } from '@/lib/i18n/store';
import { dict as enDict } from '@/lib/i18n/messages/en';
import { dict as ukLocaleDict } from '@/lib/i18n/messages/uk';
import { browserVoiceService } from '@/lib/voice/browserVoiceService';

import { VoiceSettings } from './VoiceSettings';

// Locale modules carry the translated entries; `formatMessage` falls back to
// English for the rest, so this is the dictionary the runtime actually shows.
const ukDict = { ...enDict, ...ukLocaleDict };

describe('VoiceSettings endpoint paths', () => {
  let windowInstance: Window;
  let host: HTMLDivElement;
  let root: Root;
  let globalDescriptors: Map<string, PropertyDescriptor | undefined>;
  let initialConfig: ReturnType<typeof useConfigStore.getState>;
  let initialI18n: ReturnType<typeof useI18nStore.getState>;
  let voices: SpeechSynthesisVoice[];
  let synthesis: { getVoices: () => SpeechSynthesisVoice[]; onvoiceschanged: (() => void) | null };
  let waitForVoices: ReturnType<typeof spyOn<typeof browserVoiceService, 'waitForVoices'>>;

  const globalNames = ['window', 'document', 'HTMLElement', 'Element', 'Node', 'ResizeObserver', 'localStorage', 'sessionStorage', 'IS_REACT_ACT_ENVIRONMENT', 'fetch', 'requestAnimationFrame', 'cancelAnimationFrame'];

  beforeEach(() => {
    windowInstance = new Window();
    voices = [];
    synthesis = { getVoices: () => voices, onvoiceschanged: null };
    Object.defineProperty(windowInstance, 'speechSynthesis', { value: synthesis, configurable: true });
    waitForVoices = spyOn(browserVoiceService, 'waitForVoices').mockResolvedValue([]);
    initialConfig = useConfigStore.getState();
    initialI18n = useI18nStore.getState();
    globalDescriptors = new Map(globalNames.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    Object.assign(globalThis, {
      window: windowInstance,
      document: windowInstance.document,
      HTMLElement: windowInstance.HTMLElement,
      Element: windowInstance.Element,
      Node: windowInstance.Node,
      ResizeObserver: windowInstance.ResizeObserver,
      localStorage: windowInstance.localStorage,
      sessionStorage: windowInstance.sessionStorage,
      IS_REACT_ACT_ENVIRONMENT: true,
      fetch: async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => '' }),
      // The prompt textarea's overlay scrollbar measures on animation frames.
      requestAnimationFrame: windowInstance.requestAnimationFrame.bind(windowInstance),
      cancelAnimationFrame: windowInstance.cancelAnimationFrame.bind(windowInstance),
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    try {
      await act(async () => root.unmount());
    } finally {
      useConfigStore.setState(initialConfig);
      waitForVoices.mockRestore();
      useI18nStore.setState(initialI18n);
      windowInstance.close();
      for (const [name, descriptor] of globalDescriptors) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    }
  });

  const inputWithPlaceholder = (placeholder: string) => (
    Array.from(host.querySelectorAll('input')).find((element) => element.placeholder === placeholder)
  );

  const voiceRowLabel = () => Array.from(host.querySelectorAll('div')).find(
    (element) => element.textContent === enDict['settings.voice.page.field.voice'],
  );
  const renderPlayback = async (voiceProvider: 'browser' | 'openai' | 'say' | 'local') => {
    useConfigStore.setState({ voiceProvider, showMessageTTSButtons: true, voiceApiKeys: { stt: false } });
    await act(async () => root.render(<I18nProvider><VoiceSettings /></I18nProvider>));
  };
  const setFetch = (request: () => Promise<Response>) => { globalThis.fetch = Object.assign(request, globalThis.fetch); };

  test('hides the OpenAI voice row when the Host has no speech credential', async () => {
    setFetch(async () => new Response(JSON.stringify({ available: false })));
    await renderPlayback('openai');
    expect(voiceRowLabel()).toBeUndefined();
    expect(host.textContent).toContain(enDict['settings.voice.page.field.speechRate']);
  });

  test('keeps the OpenAI voice selector and preview when speech is available', async () => {
    setFetch(async () => new Response(JSON.stringify({ available: true })));
    await renderPlayback('openai');
    expect(voiceRowLabel()).toBeDefined();
    expect(host.querySelectorAll('[role="combobox"]').length).toBe(1);
    expect(host.querySelector(`button[aria-label="${enDict['settings.voice.page.actions.preview']}"]`)).not.toBeNull();
  });

  test('hides Browser voices until selectable voices arrive and hides them again when removed', async () => {
    await renderPlayback('browser');
    expect(voiceRowLabel()).toBeUndefined();
    voices = [{ name: 'Unnamed language', lang: '', voiceURI: 'empty', default: false, localService: true }];
    await act(async () => { synthesis.onvoiceschanged?.(); });
    expect(voiceRowLabel()).toBeUndefined();
    voices = [{ name: 'Test English', lang: 'en-US', voiceURI: 'test', default: true, localService: true }];
    await act(async () => { synthesis.onvoiceschanged?.(); });
    expect(voiceRowLabel()).toBeDefined();
    expect(host.querySelector(`button[aria-label="${enDict['settings.voice.page.actions.preview']}"]`)).not.toBeNull();
    voices = [];
    await act(async () => { synthesis.onvoiceschanged?.(); });
    expect(voiceRowLabel()).toBeUndefined();
  });

  test('hides the OpenAI voice row when its availability request fails', async () => {
    setFetch(async () => { throw new Error('Offline'); });
    await renderPlayback('openai');
    expect(voiceRowLabel()).toBeUndefined();
  });

  test('hides an empty system voice row and preserves the built-in local voice picker', async () => {
    setFetch(async () => new Response(JSON.stringify({ available: true, voices: [] })));
    await renderPlayback('say');
    expect(voiceRowLabel()).toBeUndefined();
    await act(async () => { useConfigStore.setState({ voiceProvider: 'local' }); });
    expect(voiceRowLabel()).toBeDefined();
  });

  test('shows the saved speech endpoint path beside the custom server fields', async () => {
    useConfigStore.setState({
      voiceProvider: 'openai-compatible',
      showMessageTTSButtons: true,
      openaiCompatibleTtsEndpointPath: '/custom/speech',
    });
    await act(async () => root.render(
      <I18nProvider>
        <VoiceSettings />
      </I18nProvider>,
    ));

    expect(inputWithPlaceholder('/audio/speech')?.value).toBe('/custom/speech');
  });

  test('shows the saved transcription endpoint path beside the custom server fields', async () => {
    useConfigStore.setState({ dictationEnabled: true, sttProvider: 'openai-compatible', sttEndpointPath: '/speech_to_text' });
    await act(async () => root.render(
      <I18nProvider>
        <VoiceSettings />
      </I18nProvider>,
    ));

    expect(inputWithPlaceholder('/audio/transcriptions')?.value).toBe('/speech_to_text');
  });

  test('the localized endpoint fields render and disappear with their switches', async () => {
    useI18nStore.setState({ locale: 'uk', dictionary: ukDict });
    useConfigStore.setState({
      voiceProvider: 'openai-compatible', sttProvider: 'openai-compatible',
      showMessageTTSButtons: true, autoReadAloudEnabled: false, dictationEnabled: true,
    });
    await act(async () => root.render(<I18nProvider><VoiceSettings /></I18nProvider>));
    for (const id of ['voice.tts-endpoint-path', 'voice.stt-endpoint-path']) {
      const target = host.querySelector(`[data-settings-item="${id}"]`);
      // The field's accessible name is the localized label, not the English default.
      expect(target?.querySelector('input')?.getAttribute('aria-label')).toBe(ukDict['settings.voice.page.field.endpointPath']);
      expect(target?.textContent).toContain(ukDict['settings.voice.page.field.endpointPath']);
      expect(target?.textContent).not.toContain(enDict['settings.voice.page.field.endpointPath']);
    }
    await act(async () => { useConfigStore.setState({ showMessageTTSButtons: false, dictationEnabled: false }); });
    expect(host.querySelector('[data-settings-item="voice.tts-endpoint-path"]')).toBeNull();
    expect(host.querySelector('[data-settings-item="voice.stt-endpoint-path"]')).toBeNull();
  });

  test('only transcription exposes a key field and accepts the Host save/remove response', async () => {
    let stored = false;
    const patches: unknown[] = [];
    globalThis.fetch = (async (input, init) => {
      if (String(input).includes('/api/voice/keys')) {
        if (init?.method === 'PUT') {
          const patch = JSON.parse(String(init.body));
          patches.push(patch);
          stored = Boolean(patch.stt);
        }
        return Response.json({ stt: stored });
      }
      return Response.json({ available: false });
    }) as typeof fetch;
    useConfigStore.setState({
      voiceProvider: 'openai', showMessageTTSButtons: true,
      dictationEnabled: false, autoReadAloudEnabled: false, voiceApiKeys: { stt: false },
    });
    await act(async () => root.render(<I18nProvider><VoiceSettings /></I18nProvider>));
    expect(host.querySelector('input[type="password"]')).toBeNull();
    await act(async () => { useConfigStore.setState({ voiceProvider: 'openai-compatible' }); });
    expect(host.querySelector('input[type="password"]')).toBeNull();
    await act(async () => { useConfigStore.setState({ dictationEnabled: true, sttProvider: 'openai-compatible' }); });
    expect(host.querySelectorAll('input[type="password"]').length).toBe(1);

    await act(async () => { expect(await useConfigStore.getState().setVoiceApiKey('stt', 'synthetic-test-key')).toBe(true); });
    expect(inputWithPlaceholder(enDict['settings.voice.page.field.apiKeySavedPlaceholder'])).toBeDefined();
    const remove = host.querySelector<HTMLButtonElement>(`button[aria-label="${enDict['settings.voice.page.field.apiKeyRemove']}"]`);
    expect(remove).not.toBeNull();
    await act(async () => { remove?.click(); });
    expect(inputWithPlaceholder('sk-...')).toBeDefined();
    expect(useConfigStore.getState().voiceApiKeys).toEqual({ stt: false });
    expect(patches).toEqual([{ stt: 'synthetic-test-key' }, { stt: null }]);
  });

  test('renders flat radio options without oc-tile cards in LocalModelPicker and selects models', async () => {
    setFetch(async () => Response.json({
      activeModel: 'parakeet-tdt-0.6b-v2-int8',
      models: [
        { id: 'parakeet-tdt-0.6b-v2-int8', installed: true, downloading: false, downloadProgress: null, downloadError: null },
        { id: 'whisper-tiny-int8', installed: false, downloading: false, downloadProgress: null, downloadError: null },
      ],
    }));
    useConfigStore.setState({ dictationEnabled: true, sttProvider: 'local', sttLocalModel: 'parakeet-tdt-0.6b-v2-int8' });
    await act(async () => root.render(<I18nProvider><VoiceSettings /></I18nProvider>));

    const group = host.querySelector('[role="radiogroup"]');
    expect(group).not.toBeNull();
    expect(host.querySelector('.oc-tile')).toBeNull();

    const whisperRadio = host.querySelector<HTMLButtonElement>(`button[role="radio"][aria-label="${enDict['settings.voice.page.stt.model.whisperTiny']}"]`);
    expect(whisperRadio).not.toBeNull();
    expect(whisperRadio?.getAttribute('aria-checked')).toBe('false');

    await act(async () => { whisperRadio?.click(); });
    expect(useConfigStore.getState().sttLocalModel).toBe('whisper-tiny-int8');
  });

  test('uses shared compact Input and Button primitives for server fields and LocalTts disclosure filter', async () => {
    setFetch(async () => Response.json({
      ttsModels: [
        { id: 'kokoro-en-v0_19', description: 'Kokoro English', installed: true, downloading: false, downloadProgress: null, downloadError: null },
        { id: 'kokoro-multi-lang-v1_1', description: 'Kokoro Multilingual', installed: false, downloading: false, downloadProgress: null, downloadError: null },
      ],
    }));
    useConfigStore.setState({
      dictationEnabled: true,
      sttProvider: 'openai-compatible',
      sttServerUrl: 'http://localhost:8001/v1',
      showMessageTTSButtons: true,
      voiceProvider: 'local',
    });
    await act(async () => root.render(<I18nProvider><VoiceSettings /></I18nProvider>));

    const sttUrlInput = inputWithPlaceholder('http://localhost:8001/v1');
    expect(sttUrlInput?.getAttribute('data-slot')).toBe('input');
    expect(sttUrlInput?.className).toContain('h-7');

    const clearButton = host.querySelector<HTMLButtonElement>(`button[aria-label="${enDict['settings.common.actions.clear']}"]`);
    expect(clearButton?.getAttribute('data-slot')).toBe('button');
    await act(async () => { clearButton?.click(); });
    expect(useConfigStore.getState().sttServerUrl).toBe('');

    const disclosureButton = Array.from(host.querySelectorAll('button')).find((el) =>
      el.textContent?.includes(enDict['settings.voice.page.localTts.availableToDownload']),
    );
    expect(disclosureButton?.getAttribute('aria-expanded')).toBe('false');
    await act(async () => { disclosureButton?.click(); });
    expect(disclosureButton?.getAttribute('aria-expanded')).toBe('true');

    const filterInput = inputWithPlaceholder(enDict['settings.voice.page.localTts.filterPlaceholder']);
    expect(filterInput?.getAttribute('data-slot')).toBe('input');
    expect(filterInput?.className).toContain('h-7');
  });
});
