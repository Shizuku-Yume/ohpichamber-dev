import { afterEach, beforeEach, describe, expect, spyOn, test, type Spy } from 'bun:test';

import { useConfigStore } from '@/stores/useConfigStore';
import { getDictationStartOptions } from './useDictation';
import { canonicalClient } from '@/api/canonicalClient';
import { nativeSnapshot } from '@/sync/session-message-loader-test-fixtures';
import { dictationClient } from '@/lib/dictation/dictation-client';
import { DictationStreamSender } from '@/lib/dictation/dictation-stream-sender';

describe('getDictationStartOptions', () => {
  const original = {
    sttProvider: useConfigStore.getState().sttProvider,
    sttServerUrl: useConfigStore.getState().sttServerUrl,
    sttModel: useConfigStore.getState().sttModel,
    sttLanguage: useConfigStore.getState().sttLanguage,
    sttEndpointPath: useConfigStore.getState().sttEndpointPath,
    sttCorrectTranscript: useConfigStore.getState().sttCorrectTranscript,
  };

  let sessionRead: Spy<typeof canonicalClient.getSession>;
  let workspaceRead: Spy<typeof canonicalClient.resolveWorkspace>;
  beforeEach(() => {
    useConfigStore.setState({ sttCorrectTranscript: false });
    sessionRead = spyOn(canonicalClient, 'getSession');
    workspaceRead = spyOn(canonicalClient, 'resolveWorkspace');
  });

  afterEach(() => {
    sessionRead.mockRestore();
    workspaceRead.mockRestore();
    useConfigStore.setState(original);
  });

  test('passes the custom stt endpoint path to the server', async () => {
    useConfigStore.setState({
      sttProvider: 'openai-compatible',
      sttServerUrl: 'http://127.0.0.1:9/v1',
      sttModel: 'whisper-1',
      sttLanguage: 'en',
      sttEndpointPath: '/speech_to_text',
    });

    expect(await getDictationStartOptions()).toEqual({
      provider: 'openai-compatible',
      language: 'en',
      openaiCompatible: {
        baseUrl: 'http://127.0.0.1:9/v1',
        model: 'whisper-1',
        endpointPath: '/speech_to_text',
      },
    });
  });

  test('leaves the path out when the setting is empty', async () => {
    useConfigStore.setState({
      sttProvider: 'openai-compatible',
      sttServerUrl: 'http://127.0.0.1:9/v1',
      sttModel: 'whisper-1',
      sttLanguage: '',
      sttEndpointPath: '',
    });

    expect(await getDictationStartOptions()).toEqual({
      provider: 'openai-compatible',
      openaiCompatible: {
        baseUrl: 'http://127.0.0.1:9/v1',
        model: 'whisper-1',
        endpointPath: undefined,
      },
    });
  });

  test('uses the session workspace rather than reverse-mapping its directory', async () => {
    useConfigStore.setState({ sttCorrectTranscript: true });
    sessionRead.mockResolvedValueOnce(nativeSnapshot('session-a'));
    expect(await getDictationStartOptions({ sessionId: 'session-a', directory: '/shared/path' }))
      .toMatchObject({ correct: true, workspaceId: 'workspace-a' });
    expect(sessionRead).toHaveBeenCalledWith('session-a');
    expect(workspaceRead).not.toHaveBeenCalled();
  });

  test('resolves an authorized workspace for a draft without a session', async () => {
    useConfigStore.setState({ sttCorrectTranscript: true });
    workspaceRead.mockResolvedValueOnce({ workspaceId: 'draft-workspace', projectId: 'project', name: 'Draft' });
    expect(await getDictationStartOptions({ directory: '/draft' }))
      .toMatchObject({ correct: true, workspaceId: 'draft-workspace' });
    expect(workspaceRead).toHaveBeenCalledWith('/draft');
  });

  test('keeps recognition available when correction has no scope or scope resolution fails', async () => {
    useConfigStore.setState({ sttCorrectTranscript: true });
    expect(await getDictationStartOptions()).toMatchObject({ correct: false });
    sessionRead.mockRejectedValueOnce(new Error('Unavailable'));
    expect(await getDictationStartOptions({ sessionId: 'missing', directory: '/shared/path' }))
      .toMatchObject({ correct: false });
    expect(workspaceRead).not.toHaveBeenCalled();
  });
});

describe('dictation scope preparation', () => {
  test('waits for scope, forwards it and retires canceled pending starts', async () => {
    const start = spyOn(dictationClient, 'startDictationStream').mockResolvedValue(undefined);
    try {
      const scope = Promise.withResolvers<{ workspaceId: string }>();
      const sender = new DictationStreamSender({ client: dictationClient, getStartOptions: () => scope.promise, createDictationId: () => 'dictation' });
      const preparing = sender.restartStream();
      expect(start).not.toHaveBeenCalled();
      scope.resolve({ workspaceId: 'workspace' });
      await preparing;
      expect(start).toHaveBeenCalledWith('dictation', 'audio/pcm;rate=16000;bits=16', { workspaceId: 'workspace' });
      start.mockClear();
      const late = Promise.withResolvers<{ workspaceId: string }>();
      const canceled = new DictationStreamSender({ client: dictationClient, getStartOptions: () => late.promise });
      const pending = canceled.restartStream();
      canceled.clearAll();
      late.resolve({ workspaceId: 'retired' });
      await pending;
      expect(start).not.toHaveBeenCalled();
    } finally {
      start.mockRestore();
    }
  });

  test('retains recorded audio when preparing a scope fails', async () => {
    const sender = new DictationStreamSender({ client: dictationClient, getStartOptions: async () => { throw new Error('Runtime changed'); } });
    sender.enqueueSegment('audio');
    await expect(sender.restartStream()).rejects.toThrow('Runtime changed');
    expect(sender.getDictationId()).toBeNull();
    expect(sender.hasSegments()).toBe(true);
  });
});
