/** Server-side text-to-speech using the Host-selected provider credential. */
import { loadOpenAI } from './openai-sdk.js';
<<<<<<< HEAD
import { normalizeSelectedOpenAIBaseURL } from './base-url.js';
import { requireSelectedCredential } from '../quota/providers/selected-credential.js';
=======
import { normalizeCustomOpenAIBaseURL } from './base-url.js';
import { createEndpointPathFetch, normalizeEndpointPath } from './endpoint-path.js';

const DEFAULT_SPEECH_PATH = '/audio/speech';
>>>>>>> bc50ba56a

const selectedApiKey = async (resolveCredential, options) => {
  const credential = await requireSelectedCredential({ ...options, purpose: 'tts', resolveCredential });
  if (credential?.type !== 'api_key' || typeof credential.key !== 'string' || !credential.key.trim()) throw new Error('TTS requires a selected API-key credential');
  return credential.key;
};

export class TTSService {
  constructor({ resolveCredential } = {}) {
    if (typeof resolveCredential !== 'function') throw new TypeError('TTSService requires the selected credential resolver');
    this.resolveCredential = resolveCredential;
    this._client = null;
    this._lastApiKey = null;
  }
  async _getClient(options, normalized = normalizeSelectedOpenAIBaseURL(options.baseURL)) {
    if (normalized.error) throw new Error(normalized.error);
    const apiKey = await selectedApiKey(this.resolveCredential, options);
    if (normalized.value && !normalized.official) {
      const OpenAI = await loadOpenAI();
      return new OpenAI({ apiKey, baseURL: normalized.value });
    }
    if (!this._client || this._lastApiKey !== apiKey) {
      const OpenAI = await loadOpenAI();
      this._client = new OpenAI({ apiKey, ...(normalized.value ? { baseURL: normalized.value } : {}) });
      this._lastApiKey = apiKey;
    }
    return this._client;
  }
  async isAvailable(options) {
    try { await this._getClient(options); return true; } catch { return false; }
  }
<<<<<<< HEAD
  async generateSpeechStream(options = {}) {
    const { text, voice = 'coral', model = 'gpt-4o-mini-tts', speed = 1.0, instructions, baseURL, workspaceId, agentDirectoryId, providerId, credentialRef } = options;
    if (typeof text !== 'string' || !text.trim()) throw new Error('Text is required for TTS');
    const normalized = normalizeSelectedOpenAIBaseURL(baseURL);
    if (normalized.error) throw new Error(normalized.error);
    const credentialOptions = { workspaceId, agentDirectoryId, providerId, credentialRef };
    const custom = normalized.value && !normalized.official;
    const client = await this._getClient(credentialOptions, normalized);
=======

  /**
   * Generate speech and return as a stream
   */
  async generateSpeechStream(options) {
    const {
      text,
      voice = 'coral',
      model = 'gpt-4o-mini-tts',
      speed = 1.0,
      instructions,
      apiKey,
      baseURL,
      endpointPath,
    } = options;

    const normalizedBaseURLResult = normalizeCustomOpenAIBaseURL(baseURL);
    if (normalizedBaseURLResult.error) {
      throw new Error(normalizedBaseURLResult.error);
    }
    const normalizedBaseURL = normalizedBaseURLResult.value;

    const endpointPathResult = normalizeEndpointPath(endpointPath);
    if (endpointPathResult.error) {
      throw new Error(endpointPathResult.error);
    }
    const normalizedEndpointPath = endpointPathResult.value;
    if (normalizedEndpointPath && !normalizedBaseURL) {
      throw new Error('A custom endpoint path needs a custom server URL');
    }

    // Use provided API key / baseURL or fall back to configured key
    let client;
    if (normalizedBaseURL || apiKey) {
      const clientOpts = {};
      if (apiKey) clientOpts.apiKey = apiKey;
      if (!apiKey) clientOpts.apiKey = 'not-required';
      if (normalizedBaseURL) clientOpts.baseURL = normalizedBaseURL;
      if (normalizedEndpointPath) {
        clientOpts.fetch = createEndpointPathFetch({
          endpointPath: normalizedEndpointPath,
          defaultPath: DEFAULT_SPEECH_PATH,
        });
      }
      const OpenAI = await loadOpenAI();
      client = new OpenAI(clientOpts);
    } else {
      client = await this._getClient();
    }

    if (!client) {
      throw new Error('TTS service not available. Configure OpenAI in OpenCode, provide an API key, or set a custom server URL in settings.');
    }

    if (!text.trim()) {
      throw new Error('Text is required for TTS');
    }

>>>>>>> bc50ba56a
    try {
      const response = await client.audio.speech.create({ model, voice, input: text.trim(), speed, ...(custom ? {} : instructions ? { instructions } : {}), response_format: 'mp3' });
      return { buffer: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type') ?? 'audio/mpeg' };
    } catch { throw new Error('Failed to generate speech'); }
  }
  async generateSpeechBuffer(options = {}) {
    const { text, voice = 'coral', model = 'gpt-4o-mini-tts', speed = 1.0, instructions, baseURL, workspaceId, agentDirectoryId, providerId, credentialRef } = options;
    if (typeof text !== 'string' || !text.trim()) throw new Error('Text is required for TTS');
    const normalized = normalizeSelectedOpenAIBaseURL(baseURL);
    const custom = normalized.value && !normalized.official;
    const client = await this._getClient({ workspaceId, agentDirectoryId, providerId, credentialRef }, normalized);
    try {
      const response = await client.audio.speech.create({ model, voice, input: text.trim(), speed, ...(custom ? {} : instructions ? { instructions } : {}), response_format: 'mp3' });
      return Buffer.from(await response.arrayBuffer());
    } catch { throw new Error('Failed to generate speech'); }
  }
}
export const createTTSService = (options) => new TTSService(options);
