import { z } from 'zod';
import { publicEnterprisePolicy } from '../enterprise-mode.js';
import { registerOpenRouterModelInfoRoute } from '../host/openrouter-model-info.js';
import type { Application } from '../shared/http-contracts.js';

interface OpenChamberRouteDependencies {
  modelsDevApiUrl: string;
  modelsMetadataCacheTtl: number;
}

const MetadataTimeoutSchema = z.object({ name: z.enum(['TimeoutError', 'AbortError']) });

export const registerOpenChamberRoutes = (app: Application, dependencies: OpenChamberRouteDependencies) => {
  const {
    modelsDevApiUrl,
    modelsMetadataCacheTtl,
  } = dependencies;

  app.get('/api/openchamber/enterprise-policy', (_req, res) => {
    res.json(publicEnterprisePolicy());
  });

  app.get('/api/openchamber/release-notes', async (req, res) => {
    const { fetchReleaseNotes, VERSION_PATTERN } = await import('../changelog/update-notes.js');
    const isVersion = (value: string) => VERSION_PATTERN.test(value);
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

  registerOpenRouterModelInfoRoute(app);
  app.get('/api/openchamber/models-metadata', async (req, res) => {
    try {
      const { getModelsMetadata, toSerializedClientModelsMetadata } = await import('../host/models-metadata.js');
      const { metadata, fromCache, stale } = await getModelsMetadata({
        url: modelsDevApiUrl,
        ttlMs: modelsMetadataCacheTtl,
      });
      const { body, etag } = toSerializedClientModelsMetadata(metadata);
      res.setHeader('Cache-Control', fromCache && !stale ? 'public, max-age=60' : 'public, max-age=300');
      res.setHeader('ETag', etag);
      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }
      res.type('application/json').send(body);
    } catch (error) {
      console.warn('Failed to fetch models.dev metadata via server:', error);
      const statusCode = MetadataTimeoutSchema.safeParse(error).success ? 504 : 502;
      res.status(statusCode).json({ error: 'Failed to retrieve model metadata' });
    }
  });

};
