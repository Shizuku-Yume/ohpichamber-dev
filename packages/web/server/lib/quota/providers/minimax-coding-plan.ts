import { createMiniMaxCodingPlanProvider } from './minimax-shared.js';

const provider = createMiniMaxCodingPlanProvider({
  providerId: 'minimax-coding-plan',
  providerName: 'MiniMax Coding Plan (minimax.io)',
  tokenPlanUrl: 'https://api.minimax.io/v1/token_plan/remains',
  codingPlanUrl: 'https://api.minimax.io/v1/api/openplatform/coding_plan/remains',
});

export const providerId = provider.providerId;
export const providerName = provider.providerName;
<<<<<<< HEAD:packages/web/server/lib/quota/providers/minimax-coding-plan.js

||||||| bc50ba56aa:packages/web/server/lib/quota/providers/minimax-coding-plan.js
const aliases = provider.aliases;
=======
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/minimax-coding-plan.ts
export const isConfigured = provider.isConfigured;
export const fetchQuota = provider.fetchQuota;
