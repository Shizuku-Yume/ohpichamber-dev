import { publicEnterprisePolicy } from '../enterprise-mode.js';
import { registerOpenRouterModelInfoRoute } from '../host/openrouter-model-info.js';

export const registerOpenChamberRoutes = (app, dependencies) => {
  const {
    modelsDevApiUrl,
    modelsMetadataCacheTtl,
    fetchFreeZenModels,
    getCachedZenModels,
  } = dependencies;

  // Whether an administrator turned on enterprise mode, and by which source.
  // Pinned endpoints and keys never leave the server.
  app.get('/api/openchamber/enterprise-policy', (_req, res) => {
    res.json(publicEnterprisePolicy());
  });

  // Release notes for Settings > About: `version` alone, or what an update
  // from `since` to `version` brings. Read from the changelog bundled with the
  // package, so nothing is fetched; 503 when that bundle is missing, so the
  // page never mistakes a broken install for a release without notes.
  app.get('/api/openchamber/release-notes', async (req, res) => {
    const { fetchReleaseNotes, VERSION_PATTERN } = await import('../changelog/update-notes.js');
    // Query values can be arrays; only the string form is checked and used.
    const isVersion = (value) => VERSION_PATTERN.test(value);
    const version = String(req.query.version ?? '');
    const since = req.query.since === undefined ? undefined : String(req.query.since);
    if (!isVersion(version) || (since !== undefined && !isVersion(since))) {
      return res.status(400).json({ error: 'version and since must be OhPiChamber versions' });
    }
    const { compareVersions } = await import('../version-order.js');
    const releases = await fetchReleaseNotes(version, since, compareVersions);
    if (!releases) {
      return res.status(503).json({ error: 'Release notes are unavailable' });
    }
    res.json({ releases });
  });

  // Auto-fill's second source: OpenRouter's public model list, matched to the
  // requested ids locally. Refused in enterprise mode before any request.
  registerOpenRouterModelInfoRoute(app);
  app.get('/api/openchamber/models-metadata', async (_req, res) => {
    try {
      const { getModelsMetadata, toClientModelsMetadata } = await import('../host/models-metadata.js');
      const { metadata, fromCache, stale } = await getModelsMetadata({
        url: modelsDevApiUrl,
        ttlMs: modelsMetadataCacheTtl,
      });
      res.setHeader('Cache-Control', fromCache && !stale ? 'public, max-age=60' : 'public, max-age=300');
      res.json(toClientModelsMetadata(metadata));
    } catch (error) {
      console.warn('Failed to fetch models.dev metadata via server:', error);
      const statusCode = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 504 : 502;
      res.status(statusCode).json({ error: 'Failed to retrieve model metadata' });
    }
  });

  app.get('/api/zen/models', async (_req, res) => {
    try {
      const models = await fetchFreeZenModels();
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json({ models });
    } catch (error) {
      console.warn('Failed to fetch zen models:', error);
      const cachedZenModels = getCachedZenModels();
      if (cachedZenModels) {
        res.setHeader('Cache-Control', 'public, max-age=60');
        res.json(cachedZenModels);
      } else {
        const statusCode = error?.name === 'AbortError' ? 504 : 502;
        res.status(statusCode).json({ error: 'Failed to retrieve zen models' });
      }
    }
  });
};
