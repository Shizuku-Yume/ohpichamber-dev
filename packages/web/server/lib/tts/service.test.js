import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { TTSService } from './service.js';
import { transcribeAudio } from './stt.js';

describe('OpenAI audio SDK compatibility', () => {
  const selection = { workspaceId: 'workspace_1', agentDirectoryId: 'agent_1', providerId: 'openai', credentialRef: 'credential_1' };
  const createService = () => new TTSService({ resolveCredential: async () => ({ type: 'api_key', key: 'test-key' }) });
  let server;
  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
      server = undefined;
    }
  });

  const listen = async (handler) => {
    server = createServer(handler);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return `http://127.0.0.1:${server.address().port}/v1`;
  };

  it('sends custom speech options and returns the audio bytes', async () => {
    const audio = Buffer.from('speech-response');
    let received;
    const baseURL = await listen(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      received = { url: request.url, method: request.method, body: JSON.parse(Buffer.concat(chunks).toString()) };
      response.writeHead(200, { 'Content-Type': 'audio/mpeg' });
      response.end(audio);
    });

    const result = await createService().generateSpeechStream({ ...selection,
      text: 'Hello', model: 'custom-tts', voice: 'coral', speed: 1.2, baseURL, instructions: 'Do not send custom-server instructions',
    });

    // OpenRouter and other strict OpenAI-compatible servers reject /audio/speech
    // requests without an explicit response_format; mp3 is the documented default.
    expect(received).toEqual({
      url: '/v1/audio/speech', method: 'POST',
      body: { input: 'Hello', model: 'custom-tts', voice: 'coral', speed: 1.2, response_format: 'mp3' },
    });
    expect(result).toEqual({ buffer: audio, contentType: 'audio/mpeg' });
  });

  it('passes the upstream content type through to the caller', async () => {
    const audio = Buffer.from('wav-response');
    const baseURL = await listen(async (request, response) => {
      response.writeHead(200, { 'Content-Type': 'audio/wav' });
      response.end(audio);
    });

    const result = await createService().generateSpeechStream({ ...selection,
      text: 'Hello', model: 'custom-tts', voice: 'coral', speed: 1, baseURL,
    });

    expect(result).toEqual({ buffer: audio, contentType: 'audio/wav' });
  });

  it('falls back to audio/mpeg when the server omits the content type', async () => {
    const audio = Buffer.from('unlabelled-response');
    const baseURL = await listen(async (request, response) => {
      response.end(audio);
    });

    const result = await createService().generateSpeechStream({ ...selection,
      text: 'Hello', model: 'custom-tts', voice: 'coral', speed: 1, baseURL,
    });

    expect(result).toEqual({ buffer: audio, contentType: 'audio/mpeg' });
  });

  it('uploads transcription audio as multipart data and reads the text', async () => {
    const audio = Buffer.from('transcription-input');
    let received;
    const baseURL = await listen(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const form = await new Response(Buffer.concat(chunks), {
        headers: { 'Content-Type': request.headers['content-type'] },
      }).formData();
      const file = form.get('file');
      received = {
        url: request.url, method: request.method,
        model: form.get('model'), language: form.get('language'), format: form.get('response_format'),
        filename: file.name, audio: Buffer.from(await file.arrayBuffer()),
      };
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ text: 'Hello from transcription' }));
    });

    const result = await transcribeAudio({
      audioBuffer: audio, mimeType: 'audio/webm', model: 'whisper-1', language: 'en', baseURL,
    });

    expect(received).toEqual({
      url: '/v1/audio/transcriptions', method: 'POST', model: 'whisper-1', language: 'en',
      format: 'json', filename: 'audio.webm', audio,
    });
    expect(result).toBe('Hello from transcription');
  });
  it('never exposes upstream errors containing the selected credential', async () => {
    const baseURL = await listen(async (_request, response) => {
      response.writeHead(401, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'test-key', type: 'authentication_error' } }));
    });
    await expect(createService().generateSpeechStream({ ...selection, text: 'Hello', baseURL })).rejects.toThrow('Failed to generate speech');
  });

  it('requires all exact selected ownership fields before resolving', async () => {
    let called = false;
    const service = new TTSService({ resolveCredential: async () => { called = true; } });
    await expect(service.generateSpeechStream({ ...selection, providerId: undefined, text: 'Hello' })).rejects.toThrow('Selected credential context is required');
    expect(called).toBe(false);
  });

  it.each(['generateSpeechStream', 'generateSpeechBuffer'])('uses the trusted official endpoint and keeps instructions in %s', async (method) => {
    vi.stubEnv('OPENCHAMBER_RUNTIME', '');
    vi.stubEnv('OPENCHAMBER_ALLOW_REMOTE_OPENAI_COMPAT_URLS', 'false');
    const audio = Buffer.from('official-speech');
    const requests = [];
    vi.stubGlobal('fetch', vi.fn(async (input, init) => {
      const request = new Request(input, init);
      requests.push({ url: request.url, authorization: request.headers.get('authorization'), body: await request.json() });
      return new Response(audio, { headers: { 'Content-Type': 'audio/mpeg' } });
    }));
    const result = await createService()[method]({ ...selection, baseURL: 'https://api.openai.com/v1', text: 'Hello', instructions: 'Speak softly' });
    expect(requests).toEqual([{ url: 'https://api.openai.com/v1/audio/speech', authorization: 'Bearer test-key', body: { input: 'Hello', model: 'gpt-4o-mini-tts', voice: 'coral', speed: 1, instructions: 'Speak softly', response_format: 'mp3' } }]);
    expect(method === 'generateSpeechStream' ? result.buffer : result).toEqual(audio);
  });

  it('refuses a trusted remote official endpoint in enterprise mode before resolving its credential', async () => {
    vi.stubEnv('OPENCHAMBER_ENTERPRISE_MODE', 'true');
    vi.stubEnv('OPENCHAMBER_ALLOW_REMOTE_OPENAI_COMPAT_URLS', 'true');
    const resolveCredential = vi.fn();
    const service = new TTSService({ resolveCredential });
    await expect(service.generateSpeechStream({ ...selection, baseURL: 'https://api.openai.com/v1', text: 'Hello' })).rejects.toThrow(/enterprise mode/);
    expect(resolveCredential).not.toHaveBeenCalled();
  });
});
