import { afterEach, expect, test } from 'bun:test';
import { getDictationStartOptions } from './useDictation';
import { useConfigStore } from '@/stores/useConfigStore';
import { getRuntimeApiBaseUrl, getRuntimeKey, switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { setTranscriptionPrompt } from '@/stores/useTranscriptionPromptStore';

const original = useConfigStore.getState();
const runtime = { apiBaseUrl: getRuntimeApiBaseUrl(), runtimeKey: getRuntimeKey() };
afterEach(() => {
  setTranscriptionPrompt('');
  switchRuntimeEndpoint(runtime);
  useConfigStore.setState(original);
});

test('a server recognizer receives the trimmed prompt, while a local recognizer does not', async () => {
  useConfigStore.setState({ sttProvider: 'openai-compatible', sttCorrectTranscript: false });
  setTranscriptionPrompt('  Español e inglés.\n東京  ');
  expect((await getDictationStartOptions()).openaiCompatible?.prompt).toBe('Español e inglés.\n東京');
  useConfigStore.setState({ sttProvider: 'local' });
  expect(JSON.stringify(await getDictationStartOptions())).not.toContain('prompt');
});

test('an empty prompt is omitted', async () => {
  useConfigStore.setState({ sttProvider: 'openai-compatible', sttCorrectTranscript: false });
  setTranscriptionPrompt(' \n ');
  expect((await getDictationStartOptions()).openaiCompatible?.prompt).toBeUndefined();
});

test('switching hosts does not disclose the previous recognizer prompt', async () => {
  switchRuntimeEndpoint({ apiBaseUrl: 'https://dictation-a.test', runtimeKey: 'dictation-a' });
  useConfigStore.setState({ sttProvider: 'openai-compatible', sttCorrectTranscript: false });
  setTranscriptionPrompt('private vocabulary');
  switchRuntimeEndpoint({ apiBaseUrl: 'https://dictation-b.test', runtimeKey: 'dictation-b' });
  useConfigStore.setState({ sttProvider: 'openai-compatible', sttCorrectTranscript: false });
  expect((await getDictationStartOptions()).openaiCompatible?.prompt).toBeUndefined();
});
