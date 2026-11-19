import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { fetchVoiceApiKeys, migrateLegacyVoiceApiKeys, updateVoiceApiKeys } from './voiceKeysApi';

describe('Host transcription key contract', () => {
  let windowInstance: Window;
  let descriptors: Map<string, PropertyDescriptor | undefined>;
  const requests: Array<{ method: string; body: unknown }> = [];
  let responseBody: unknown;
  let responseStatus: number;

  beforeEach(() => {
    windowInstance = new Window({ url: 'http://localhost/' });
    descriptors = new Map(['window', 'fetch'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    responseBody = { stt: false };
    responseStatus = 200;
    requests.length = 0;
    Object.assign(globalThis, {
      window: windowInstance,
      fetch: async (_input: unknown, init?: RequestInit) => {
        requests.push({ method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
        return Response.json(responseBody, { status: responseStatus });
      },
    });
  });

  afterEach(() => {
    windowInstance.close();
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });

  test('reads the Host STT-only empty state and save/remove results', async () => {
    expect(await fetchVoiceApiKeys()).toEqual({ stt: false });
    responseBody = { stt: true };
    expect(await updateVoiceApiKeys({ stt: 'synthetic-test-key' })).toEqual({ stt: true });
    responseBody = { stt: false };
    expect(await updateVoiceApiKeys({ stt: null })).toEqual({ stt: false });
    expect(requests).toEqual([
      { method: 'GET', body: null },
      { method: 'PUT', body: { stt: 'synthetic-test-key' } },
      { method: 'PUT', body: { stt: null } },
    ]);
  });

  test('rejects missing or non-boolean status rather than claiming success', async () => {
    for (const body of [{}, { stt: 'true' }, { stt: null }]) {
      responseBody = body;
      await expect(fetchVoiceApiKeys()).rejects.toThrow();
      await expect(updateVoiceApiKeys({ stt: 'synthetic-test-key' })).rejects.toThrow();
    }
  });

  test('surfaces HTTP failures for reads and writes', async () => {
    responseStatus = 503;
    await expect(fetchVoiceApiKeys()).rejects.toThrow('Failed to read voice keys: 503');
    await expect(updateVoiceApiKeys({ stt: null })).rejects.toThrow('Failed to save voice keys: 503');
  });

  test('migrates only transcription, without sending retired speech keys to the Host', async () => {
    windowInstance.localStorage.setItem('openaiApiKey', 'legacy-speech-key');
    windowInstance.localStorage.setItem('openaiCompatibleApiKey', 'legacy-custom-speech-key');
    windowInstance.localStorage.setItem('sttApiKey', ' synthetic-test-key ');
    responseBody = { stt: true };
    expect(await migrateLegacyVoiceApiKeys()).toEqual({ stt: true });
    expect(requests).toEqual([{ method: 'PUT', body: { stt: 'synthetic-test-key' } }]);
    expect(windowInstance.localStorage.getItem('sttApiKey')).toBeNull();
    expect(windowInstance.localStorage.getItem('openaiApiKey')).toBe('legacy-speech-key');
    expect(await migrateLegacyVoiceApiKeys()).toBeNull();
    expect(requests.length).toBe(1);
  });

  test('keeps a legacy transcription key when migration cannot confirm the write', async () => {
    windowInstance.localStorage.setItem('sttApiKey', 'synthetic-test-key');
    responseBody = {};
    await expect(migrateLegacyVoiceApiKeys()).rejects.toThrow();
    expect(windowInstance.localStorage.getItem('sttApiKey')).toBe('synthetic-test-key');
  });

  test('empty legacy storage does not make a request', async () => {
    expect(await migrateLegacyVoiceApiKeys()).toBeNull();
    windowInstance.localStorage.setItem('sttApiKey', ' ');
    expect(await migrateLegacyVoiceApiKeys()).toBeNull();
    expect(windowInstance.localStorage.getItem('sttApiKey')).toBeNull();
    expect(requests).toEqual([]);
  });
});
