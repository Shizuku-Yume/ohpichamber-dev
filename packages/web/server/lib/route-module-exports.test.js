import { describe, expect, it } from 'vitest';

describe('lazy-loaded route module exports', () => {
  it.each([
    ['./git/index.js', [
      'computeIntegratePlan',
      'createBranch',
      'deleteProfile',
      'getCommitSummaries',
      'listStashes',
    ]],
<<<<<<< HEAD
    ['./quota/index.js', ['fetchQuotaForProvider', 'listConfiguredQuotaProviders']],
=======
    ['./quota/index.js', ['fetchQuotaForProvider', 'listConfiguredQuotaProviders', 'listUsagePageProviders']],
    ['./tts/index.js', ['ttsService', 'TTS_VOICES']],
>>>>>>> bc50ba56a
    ['./walkthrough/index.js', ['getRepositoryRootFor']],
  ])('%s keeps the exports its routes load dynamically', async (specifier, names) => {
    const routeModule = await import(specifier);

    for (const name of names) {
      expect(routeModule[name], `${specifier} must export ${name}`).toBeDefined();
    }
  });
});
