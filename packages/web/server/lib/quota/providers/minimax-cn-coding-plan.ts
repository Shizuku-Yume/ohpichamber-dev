import { createMiniMaxCodingPlanProvider } from './minimax-shared.js';

const provider = createMiniMaxCodingPlanProvider({
  providerId: 'minimax-cn-coding-plan',
  providerName: 'MiniMax Coding Plan (minimaxi.com)',
  tokenPlanUrl: 'https://api.minimaxi.com/v1/token_plan/remains',
  codingPlanUrl: 'https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains',
});

export const providerId = provider.providerId;
export const providerName = provider.providerName;
<<<<<<< HEAD:packages/web/server/lib/quota/providers/minimax-cn-coding-plan.js

||||||| bc50ba56aa:packages/web/server/lib/quota/providers/minimax-cn-coding-plan.js
const aliases = provider.aliases;
=======
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/minimax-cn-coding-plan.ts
export const isConfigured = provider.isConfigured;
export const fetchQuota = provider.fetchQuota;
