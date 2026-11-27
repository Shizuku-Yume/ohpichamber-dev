import type OpenAI from 'openai';
import type { ClientOptions } from 'openai';
import type { SpeechCreateParams } from 'openai/resources/audio/speech';
import { z } from 'zod';
import { createEndpointPathFetch, normalizeEndpointPath } from './endpoint-path.js';
import { loadOpenAI } from './openai-sdk.js';
import { normalizeSelectedOpenAIBaseURL, type NormalizedBaseUrlResult } from './base-url.js';
import type { NativeResolvedCredential } from '../quota/native.js';
import { requireSelectedCredential } from '../quota/providers/selected-credential.js';

const DEFAULT_SPEECH_PATH = '/audio/speech';
const nonEmptyString = z.string().trim().min(1);

export interface SelectedCredentialRequest {
  workspaceId: string;
  agentDirectoryId: string;
  providerId: string;
  credentialRef: string;
  purpose: string;
}

export type SelectedCredential = NativeResolvedCredential;

export type SelectedCredentialResolver = (request: SelectedCredentialRequest) => Promise<SelectedCredential>;

export interface TTSServiceDependencies {
  resolveCredential?: SelectedCredentialResolver | undefined;
}

export interface TTSSelectionOptions {
  workspaceId?: string | undefined;
  agentDirectoryId?: string | undefined;
  providerId?: string | undefined;
  credentialRef?: string | undefined;
  baseURL?: string | null | undefined;
}

export interface GenerateSpeechOptions extends TTSSelectionOptions {
  text?: string | undefined;
  voice?: string | undefined;
  model?: string | undefined;
  speed?: number | undefined;
  instructions?: string | undefined;
  endpointPath?: string | undefined;
}

export interface GeneratedSpeechStream {
  buffer: Buffer;
  contentType: string;
}

const selectedApiKey = async (resolveCredential: SelectedCredentialResolver, options: TTSSelectionOptions): Promise<string> => {
  const credential = await requireSelectedCredential({
    workspaceId: options.workspaceId,
    agentDirectoryId: options.agentDirectoryId,
    providerId: options.providerId,
    credentialRef: options.credentialRef,
    purpose: 'tts',
    resolveCredential,
  });
  const parsedKey = credential?.type === 'api_key' ? nonEmptyString.safeParse(credential.key) : null;
  if (!parsedKey?.success) throw new Error('TTS requires a selected API-key credential');
  return parsedKey.data;
};

export class TTSService {
  resolveCredential: SelectedCredentialResolver;
  _client: OpenAI | null;
  _lastApiKey: string | null;

  constructor({ resolveCredential }: TTSServiceDependencies = {}) {
    if (!resolveCredential || !z.function().safeParse(resolveCredential).success) throw new TypeError('TTSService requires the selected credential resolver');
    this.resolveCredential = resolveCredential;
    this._client = null;
    this._lastApiKey = null;
  }

  async _getClient(
    options: TTSSelectionOptions,
    normalized: NormalizedBaseUrlResult = normalizeSelectedOpenAIBaseURL(options.baseURL),
    endpointPath?: string | undefined,
  ): Promise<OpenAI> {
    if (normalized.error) throw new Error(normalized.error);
    const endpoint = this._endpointPath(endpointPath, normalized);
    const apiKey = await selectedApiKey(this.resolveCredential, options);
    if (normalized.value && !normalized.official) {
      const OpenAIClient = await loadOpenAI();
      const clientOptions: ClientOptions = {
        apiKey,
        baseURL: normalized.value,
        fetchOptions: { redirect: 'manual' },
      };
      if (endpoint) clientOptions.fetch = endpoint;
      return new OpenAIClient(clientOptions);
    }
    if (!this._client || this._lastApiKey !== apiKey) {
      const OpenAIClient = await loadOpenAI();
      const clientOptions: ClientOptions = {
        apiKey,
        fetchOptions: { redirect: 'manual' },
      };
      if (normalized.value) clientOptions.baseURL = normalized.value;
      this._client = new OpenAIClient(clientOptions);
      this._lastApiKey = apiKey;
    }
    return this._client;
  }

  _endpointPath(value: string | undefined, normalized: NormalizedBaseUrlResult): typeof fetch | undefined {
    const result = normalizeEndpointPath(value);
    if (result.error) throw new Error(result.error);
    if (result.value && !normalized.value) throw new Error('A custom endpoint path needs a custom server URL');
    return result.value ? createEndpointPathFetch({ endpointPath: result.value, defaultPath: DEFAULT_SPEECH_PATH }) : undefined;
  }

  async isAvailable(options: TTSSelectionOptions): Promise<boolean> {
    try {
      await this._getClient(options);
      return true;
    } catch {
      return false;
    }
  }

  async generateSpeechStream(options: GenerateSpeechOptions = {}): Promise<GeneratedSpeechStream> {
    const { text, voice = 'coral', model = 'gpt-4o-mini-tts', speed = 1.0, instructions, baseURL, endpointPath, workspaceId, agentDirectoryId, providerId, credentialRef } = options;
    const parsedText = nonEmptyString.safeParse(text);
    if (!parsedText.success) throw new Error('Text is required for TTS');
    const normalized = normalizeSelectedOpenAIBaseURL(baseURL);
    if (normalized.error) throw new Error(normalized.error);
    const credentialOptions: TTSSelectionOptions = { workspaceId, agentDirectoryId, providerId, credentialRef };
    const custom = Boolean(normalized.value && !normalized.official);
    const client = await this._getClient(credentialOptions, normalized, endpointPath);
    try {
      const speechParams: SpeechCreateParams = {
        model,
        voice,
        input: parsedText.data,
        speed,
        response_format: 'mp3',
      };
      if (!custom && instructions) speechParams.instructions = instructions;
      const response = await client.audio.speech.create(speechParams);
      return { buffer: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type') ?? 'audio/mpeg' };
    } catch {
      throw new Error('Failed to generate speech');
    }
  }

  async generateSpeechBuffer(options: GenerateSpeechOptions = {}): Promise<Buffer> {
    const { text, voice = 'coral', model = 'gpt-4o-mini-tts', speed = 1.0, instructions, baseURL, workspaceId, agentDirectoryId, providerId, credentialRef } = options;
    const parsedText = nonEmptyString.safeParse(text);
    if (!parsedText.success) throw new Error('Text is required for TTS');
    const normalized = normalizeSelectedOpenAIBaseURL(baseURL);
    const custom = Boolean(normalized.value && !normalized.official);
    const client = await this._getClient({ workspaceId, agentDirectoryId, providerId, credentialRef }, normalized);
    try {
      const speechParams: SpeechCreateParams = {
        model,
        voice,
        input: parsedText.data,
        speed,
        response_format: 'mp3',
      };
      if (!custom && instructions) speechParams.instructions = instructions;
      const response = await client.audio.speech.create(speechParams);
      return Buffer.from(await response.arrayBuffer());
    } catch {
      throw new Error('Failed to generate speech');
    }
  }
}

export const createTTSService = (options?: TTSServiceDependencies): TTSService => new TTSService(options);
