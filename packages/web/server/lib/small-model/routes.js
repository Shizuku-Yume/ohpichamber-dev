export function registerSmallModelRoutes(app, { getSmallModelService }) {
  const workspaceId = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
  app.get('/api/small-model', async (req, res) => {
    try {
      const id = workspaceId(req.query.workspaceId);
      if (!id) return res.status(400).json({ error: 'workspaceId is required', code: 'INVALID_REQUEST' });
      const { describeSmallModel, listAuthenticatedProviders } = await getSmallModelService();
      const resolved = await describeSmallModel({
        workspaceId: id,
        preferredProviderID: typeof req.query.providerID === 'string' ? req.query.providerID : undefined,
        preferredModelID: typeof req.query.modelID === 'string' ? req.query.modelID : undefined,
      });
      res.json({ available: Boolean(resolved), model: resolved, authenticatedProviders: await listAuthenticatedProviders(id) });
    } catch (error) {
      const statusCode = Number(error?.statusCode ?? error?.status) || 500;
      if (statusCode >= 500) console.error('Failed to resolve small model:', error);
      res.status(statusCode).json({ error: error?.message || 'Failed to resolve small model', ...(error?.code ? { code: error.code } : {}) });
    }
  });

  app.post('/api/small-model/generate', async (req, res) => {
    try {
      const body = req.body || {};
      const id = workspaceId(body.workspaceId);
      if (!id) return res.status(400).json({ error: 'workspaceId is required', code: 'INVALID_REQUEST' });
      const { generateSmallModelText } = await getSmallModelService();
      const result = await generateSmallModelText({ ...body, workspaceId: id });
      res.json(result);
    } catch (error) {
      const statusCode = Number(error?.statusCode ?? error?.status) || 500;
      if (statusCode >= 500) console.error('Small model generation failed:', error);
      res.status(statusCode).json({ error: error?.message || 'Small model generation failed', ...(error?.code ? { code: error.code } : {}) });
    }
  });
}
