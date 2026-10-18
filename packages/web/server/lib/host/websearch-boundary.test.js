import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { registerOpenCodeRoutes } from '../opencode/routes.js';
import { registerCommonRequestMiddleware } from '../opencode/core-routes.js';

describe('native web-search legacy route retirement', () => {
  it('does not expose OpenCode search configuration or provider routes', async () => {
    const app = express();
    registerCommonRequestMiddleware(app, { express });
    registerOpenCodeRoutes(app, {});
    for (const endpoint of ['/api/config/websearch', '/api/websearch/provider']) {
      const read = await request(app).get(endpoint);
      expect(read.status).toBe(404);
      const write = await request(app).put(endpoint).send({ selection: 'exa' });
      expect(write.status).toBe(404);
    }
  });
});
