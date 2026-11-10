/** Server-side text-to-speech using the Host-selected provider credential. */
import { loadOpenAI } from './openai-sdk.js';
import { normalizeSelectedOpenAIBaseURL } from './base-url.js';
import { requireSelectedCredential } from '../quota/providers/selected-credential.js';

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
  async generateSpeechStream(options = {}) {
    const { text, voice = 'coral', model = 'gpt-4o-mini-tts', speed = 1.0, instructions, baseURL, workspaceId, agentDirectoryId, providerId, credentialRef } = options;
    if (typeof text !== 'string' || !text.trim()) throw new Error('Text is required for TTS');
    const normalized = normalizeSelectedOpenAIBaseURL(baseURL);
    if (normalized.error) throw new Error(normalized.error);
    const credentialOptions = { workspaceId, agentDirectoryId, providerId, credentialRef };
    const custom = normalized.value && !normalized.official;
    const client = await this._getClient(credentialOptions, normalized);
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
