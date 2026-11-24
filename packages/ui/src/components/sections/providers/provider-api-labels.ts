import type { OmpModelApi, OmpProviderApi } from '@openchamber/agent-contract';

const PROVIDER_API_LABELS = {
  'openai-completions': 'OpenAI Chat Completions',
  'openai-responses': 'OpenAI Responses',
  'openai-codex-responses': 'OpenAI Codex Responses',
  'azure-openai-responses': 'Azure OpenAI',
  'anthropic-messages': 'Anthropic Messages',
  'bedrock-converse-stream': 'AWS Bedrock',
  'google-generative-ai': 'Google Gemini',
  'google-gemini-cli': 'Google Gemini CLI',
  'google-vertex': 'Google Vertex AI',
  'openrouter-decisions': 'OpenRouter Decisions',
  'openai-decisions': 'OpenAI Decisions',
  'google-decisions': 'Google Decisions',
  'workers-ai-systemone': 'Cloudflare Workers AI',
  'liquid-systemone': 'Liquid SystemOne',
  'nace-systemone': 'NACE SystemOne',
  'typesafe': 'Typesafe',
} satisfies Record<OmpProviderApi, string>;

const MODEL_API_LABELS = {
  ...PROVIDER_API_LABELS,
  'openai-images': 'OpenAI Images',
  'openrouter-images': 'OpenRouter Images',
  'openai-speech': 'OpenAI Speech',
  'xai-tts': 'xAI TTS',
  'openai-transcriptions': 'OpenAI Transcriptions',
  'openai-embeddings': 'OpenAI Embeddings',
  'openrouter-rerank': 'OpenRouter Rerank',
  'openrouter-video': 'OpenRouter Video',
} satisfies Record<OmpModelApi, string>;

const PROVIDER_API_LABEL_MAP: ReadonlyMap<string, string> = new Map(Object.entries(PROVIDER_API_LABELS));
const MODEL_API_LABEL_MAP: ReadonlyMap<string, string> = new Map(Object.entries(MODEL_API_LABELS));

export function apiDisplayLabel(api: string): string {
  return PROVIDER_API_LABEL_MAP.get(api) ?? api;
}

export function modelApiDisplayLabel(api: string): string {
  return MODEL_API_LABEL_MAP.get(api) ?? api;
}
