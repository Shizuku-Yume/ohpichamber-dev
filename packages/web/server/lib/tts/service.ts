<<<<<<< HEAD:packages/web/server/lib/tts/service.js
/** Server-side text-to-speech using the Host-selected provider credential. */
||||||| bc50ba56aa:packages/web/server/lib/tts/service.js
/**
 * Server-side Text-to-Speech Service
 *
 * Uses OpenAI's TTS API to generate audio on the server and stream it to clients.
 * This bypasses mobile Safari's audio context restrictions.
 */

import { readOpenCodeCredentials } from '../opencode/auth.js';
import { loadOpenAI } from './openai-sdk.js';
import { normalizeCustomOpenAIBaseURL } from './base-url.js';
=======
import { readOpenCodeCredentials } from '../opencode/auth.js';
import { loadOpenAI } from './openai-sdk.js';
import { normalizeCustomOpenAIBaseURL } from './base-url.js';
>>>>>>> upstream/main:packages/web/server/lib/tts/service.ts
import { createEndpointPathFetch, normalizeEndpointPath } from './endpoint-path.js';
<<<<<<< HEAD:packages/web/server/lib/tts/service.js
import { loadOpenAI } from './openai-sdk.js';
import { normalizeSelectedOpenAIBaseURL } from './base-url.js';
import { requireSelectedCredential } from '../quota/providers/selected-credential.js';
||||||| bc50ba56aa:packages/web/server/lib/tts/service.js
=======
import { isRecord, isString } from '../shared/object-guards.js';
import type OpenAI from 'openai';
import type { ClientOptions } from 'openai';
import type { SpeechCreateParams } from 'openai/resources/audio/speech';

type SpeechCredential = string | {
  type?: string;
  key?: string;
  access?: string | undefined;
  token?: string;
};

export interface SpeechOptions {
  text: string;
  voice?: SpeechCreateParams['voice'];
  model?: SpeechCreateParams['model'];
  speed?: number;
  instructions?: string | undefined;
  apiKey?: string | undefined;
  baseURL?: string | undefined;
  endpointPath?: string | undefined;
}
>>>>>>> upstream/main:packages/web/server/lib/tts/service.ts

const DEFAULT_SPEECH_PATH = '/audio/speech';

<<<<<<< HEAD:packages/web/server/lib/tts/service.js
const selectedApiKey = async (resolveCredential, options) => {
  const credential = await requireSelectedCredential({ ...options, purpose: 'tts', resolveCredential });
  if (credential?.type !== 'api_key' || typeof credential.key !== 'string' || !credential.key.trim()) throw new Error('TTS requires a selected API-key credential');
  return credential.key;
};
||||||| bc50ba56aa:packages/web/server/lib/tts/service.js
// Voice options from OpenAI
/** @public */
export const TTS_VOICES = [
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable',
  'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar'
];
=======
export const TTS_VOICES = [
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable',
  'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar'
];
>>>>>>> upstream/main:packages/web/server/lib/tts/service.ts

<<<<<<< HEAD:packages/web/server/lib/tts/service.js
||||||| bc50ba56aa:packages/web/server/lib/tts/service.js
async function getOpenAIApiKey() {
  // First check environment variable
  const envKey = process.env.OPENAI_API_KEY;
  if (envKey) {
    return envKey;
  }

  // Then the OpenAI credential stored in OpenCode (same as usage tracker)
  try {
    const auth = await readOpenCodeCredentials();
    // Check for openai, codex, or chatgpt aliases
    const openaiAuth = auth.openai || auth.codex || auth.chatgpt;
    if (openaiAuth) {
      // Handle both string format (just the token) and object format
      if (typeof openaiAuth === 'string') {
        return openaiAuth;
      }
      // Try access token first (OAuth), then regular token
      if (openaiAuth.access) {
        return openaiAuth.access;
      }
      if (openaiAuth.token) {
        return openaiAuth.token;
      }
    }
  } catch (error) {
    console.warn('[TTSService] Failed to read OpenCode credentials:', error.message);
  }

  return null;
}

/** @public */
=======
async function getOpenAIApiKey() {
  const envKey = process.env.OPENAI_API_KEY;
  if (envKey) {
    return envKey;
  }

  try {
    const auth: Record<string, SpeechCredential> = await readOpenCodeCredentials();
    const openaiAuth = auth.openai || auth.codex || auth.chatgpt;
    if (openaiAuth) {
      if (isString(openaiAuth)) {
        return openaiAuth;
      }
      if (openaiAuth.access) {
        return openaiAuth.access;
      }
      if (openaiAuth.token) {
        return openaiAuth.token;
      }
    }
  } catch (error) {
    console.warn('[TTSService] Failed to read OpenCode credentials:', isRecord(error) ? error.message : undefined);
  }

  return null;
}

>>>>>>> upstream/main:packages/web/server/lib/tts/service.ts
export class TTSService {
<<<<<<< HEAD:packages/web/server/lib/tts/service.js
  constructor({ resolveCredential } = {}) {
    if (typeof resolveCredential !== 'function') throw new TypeError('TTSService requires the selected credential resolver');
    this.resolveCredential = resolveCredential;
||||||| bc50ba56aa:packages/web/server/lib/tts/service.js
  constructor() {
=======
  _client: OpenAI | null;
  _lastApiKey: string | null;

  constructor() {
>>>>>>> upstream/main:packages/web/server/lib/tts/service.ts
    this._client = null;
    this._lastApiKey = null;
  }
<<<<<<< HEAD:packages/web/server/lib/tts/service.js
  async _getClient(options, normalized = normalizeSelectedOpenAIBaseURL(options.baseURL), endpointPath = undefined) {
    if (normalized.error) throw new Error(normalized.error);
    const endpoint = this._endpointPath(endpointPath, normalized);
    const apiKey = await selectedApiKey(this.resolveCredential, options);
    if (normalized.value && !normalized.official) {
||||||| bc50ba56aa:packages/web/server/lib/tts/service.js

  async _getClient() {
    const apiKey = await getOpenAIApiKey();

    // If API key changed or client doesn't exist, create new client
    if (apiKey && (!this._client || this._lastApiKey !== apiKey)) {
=======

  async _getClient() {
    const apiKey = await getOpenAIApiKey();

    if (apiKey && (!this._client || this._lastApiKey !== apiKey)) {
>>>>>>> upstream/main:packages/web/server/lib/tts/service.ts
      const OpenAI = await loadOpenAI();
      return new OpenAI({ apiKey, baseURL: normalized.value, ...(endpoint ? { fetch: endpoint } : {}) });
    }
    if (!this._client || this._lastApiKey !== apiKey) {
      const OpenAI = await loadOpenAI();
      this._client = new OpenAI({ apiKey, ...(normalized.value ? { baseURL: normalized.value } : {}) });
      this._lastApiKey = apiKey;
    }
    return this._client;
  }
  /** A validated override needs its own server URL; the official endpoint cannot be renamed. */
  _endpointPath(value, normalized) {
    const result = normalizeEndpointPath(value);
    if (result.error) throw new Error(result.error);
    if (result.value && !normalized.value) throw new Error('A custom endpoint path needs a custom server URL');
    return result.value ? createEndpointPathFetch({ endpointPath: result.value, defaultPath: DEFAULT_SPEECH_PATH }) : undefined;
  }
<<<<<<< HEAD:packages/web/server/lib/tts/service.js
  async isAvailable(options) {
    try { await this._getClient(options); return true; } catch { return false; }
||||||| bc50ba56aa:packages/web/server/lib/tts/service.js

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

    try {
      // OpenAI-compatible servers (custom baseURL) may not support `instructions`,
      // but do support `speed`. `response_format: 'mp3'` is the documented default
      // for /v1/audio/speech, and strict servers (e.g. OpenRouter) reject requests
      // that omit it.
      const speechParams = normalizedBaseURL
        ? { model, voice, input: text, speed, response_format: 'mp3' }
        : {
            model,
            voice,
            input: text,
            speed,
            ...(instructions && { instructions }),
            response_format: 'mp3',
          };

      console.log('[TTSService] Generating speech — model:', model, 'voice:', voice, 'baseURL:', normalizedBaseURL ?? '(openai)');
      const response = await client.audio.speech.create(speechParams);

      const arrayBuffer = await response.arrayBuffer();
      // Servers that ignore `response_format` may still label the bytes
      // correctly (or return an unexpected type); pass the upstream label
      // through and only fall back to mp3 when the server omits the header.
      const contentType = response.headers.get('content-type') ?? 'audio/mpeg';
      return {
        buffer: Buffer.from(arrayBuffer),
        contentType,
      };
    } catch (error) {
      console.error('[TTSService] Error generating speech:', error);
      throw new Error(`Failed to generate speech: ${error.message || 'Unknown error'}`);
    }
=======

  async generateSpeechStream(options: SpeechOptions) {
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

    let client;
    if (normalizedBaseURL || apiKey) {
      const clientOpts: ClientOptions = {};
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

    try {
      const speechParams: SpeechCreateParams = normalizedBaseURL
        ? { model, voice, input: text, speed, response_format: 'mp3' }
        : {
            model,
            voice,
            input: text,
            speed,
            ...(instructions && { instructions }),
            response_format: 'mp3',
          };

      console.log('[TTSService] Generating speech — model:', model, 'voice:', voice, 'baseURL:', normalizedBaseURL ?? '(openai)');
      const response = await client.audio.speech.create(speechParams);

      const arrayBuffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') ?? 'audio/mpeg';
      return {
        buffer: Buffer.from(arrayBuffer),
        contentType,
      };
    } catch (error) {
      console.error('[TTSService] Error generating speech:', error);
      throw new Error(`Failed to generate speech: ${(isRecord(error) ? error.message : undefined) || 'Unknown error'}`);
    }
>>>>>>> upstream/main:packages/web/server/lib/tts/service.ts
  }
<<<<<<< HEAD:packages/web/server/lib/tts/service.js
  async generateSpeechStream(options = {}) {
    const { text, voice = 'coral', model = 'gpt-4o-mini-tts', speed = 1.0, instructions, baseURL, endpointPath, workspaceId, agentDirectoryId, providerId, credentialRef } = options;
    if (typeof text !== 'string' || !text.trim()) throw new Error('Text is required for TTS');
    const normalized = normalizeSelectedOpenAIBaseURL(baseURL);
    if (normalized.error) throw new Error(normalized.error);
    const credentialOptions = { workspaceId, agentDirectoryId, providerId, credentialRef };
    const custom = normalized.value && !normalized.official;
    const client = await this._getClient(credentialOptions, normalized, endpointPath);
||||||| bc50ba56aa:packages/web/server/lib/tts/service.js

  /**
   * Generate speech and return as a buffer (for caching)
   */
  async generateSpeechBuffer(options) {
    const client = await this._getClient();
    if (!client) {
      throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable or configure OpenAI in OpenCode.');
    }

    const {
      text,
      voice = 'coral',
      model = 'gpt-4o-mini-tts',
      speed = 1.0,
      instructions
    } = options;

=======

  async generateSpeechBuffer(options: SpeechOptions) {
    const client = await this._getClient();
    if (!client) {
      throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable or configure OpenAI in OpenCode.');
    }

    const {
      text,
      voice = 'coral',
      model = 'gpt-4o-mini-tts',
      speed = 1.0,
      instructions
    } = options;

>>>>>>> upstream/main:packages/web/server/lib/tts/service.ts
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
<<<<<<< HEAD:packages/web/server/lib/tts/service.js
export const createTTSService = (options) => new TTSService(options);
||||||| bc50ba56aa:packages/web/server/lib/tts/service.js

// Export singleton instance
/** @public */
export const ttsService = new TTSService();
=======

export const ttsService = new TTSService();
>>>>>>> upstream/main:packages/web/server/lib/tts/service.ts
