export const isWorkflowFeatureAvailable = () => true;
import express from 'express';
import { z } from 'zod';

import { asControlError } from '../openchamber-control/error.js';
<<<<<<< HEAD:packages/web/server/lib/workflows/routes.js
import { createWorkflowAgentSessions } from './agent-session.js';
import { createWorkflowRuntime } from './runtime.js';
import { createWorkflowRunStore } from './store.js';
||||||| bc50ba56aa:packages/web/server/lib/workflows/routes.js
=======
import type { Application } from '../shared/http-contracts.js';
import type { createWorkflowRuntime } from './runtime.js';
>>>>>>> upstream/main:packages/web/server/lib/workflows/routes.ts

const ACTIONS = new Set(['approve', 'decline', 'stop', 'resume']);
type WorkflowAction = 'approve' | 'decline' | 'stop' | 'resume';
const isWorkflowAction = (action: string): action is WorkflowAction => ACTIONS.has(action);
const listQuerySchema = z.union([
  z.object({ sessionId: z.string().trim().min(1) }),
  z.object({ directory: z.union([z.string().trim().min(1), z.array(z.string().trim().min(1)).min(1).max(100)]) }),
]);
const directoryQuerySchema = z.object({ directory: z.string().trim().min(1) });
const startBodySchema = z.object({
  directory: z.string().trim().min(1),
  scriptDirectory: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).nullish(),
  name: z.string().trim().min(1),
  args: z.json().optional(),
});

<<<<<<< HEAD:packages/web/server/lib/workflows/routes.js
/**
 * The user's side of workflow runs: the runs of a session for the chat, the
 * work-status panel and the Workflows panel, one run's log, script and result
 * and one agent's prompt and answer for that panel, and the approve, decline,
 * stop and resume buttons.
 * Registered only in builds with workflows.
 */
const registerWorkflowRoutes = (app, runtime) => {
||||||| bc50ba56aa:packages/web/server/lib/workflows/routes.js
/**
 * The user's side of workflow runs: the runs of a session for the chat, the
 * work-status panel and the Workflows panel, one run's log, script and result
 * and one agent's prompt and answer for that panel, and the approve, decline,
 * stop and resume buttons.
 * Registered only in builds with workflows.
 */
export const registerWorkflowRoutes = (app, runtime) => {
=======
export const registerWorkflowRoutes = (app: Application, runtime: ReturnType<typeof createWorkflowRuntime>) => {
>>>>>>> upstream/main:packages/web/server/lib/workflows/routes.ts
  app.get('/api/openchamber/workflows', async (req, res) => {
    const query = listQuerySchema.safeParse(req.query);
    if (!query.success) return res.status(400).json({ error: 'sessionId or directory is required' });
    try {
      const runs = 'sessionId' in query.data
        ? await runtime.list({ sessionId: query.data.sessionId })
        : await runtime.listByDirectory({ directories: [query.data.directory].flat() });
      return res.json({ runs });
    } catch (error) {
      const controlError = asControlError(error, 'Could not read workflow runs');
      return res.status(controlError.statusCode).json({ error: controlError.message });
    }
  });

  app.get('/api/openchamber/workflows/saved', async (req, res) => {
    const query = directoryQuerySchema.safeParse(req.query);
    if (!query.success) return res.status(400).json({ error: 'directory is required' });
    try {
      return res.json(await runtime.listSaved({ directory: query.data.directory }));
    } catch (error) {
      const controlError = asControlError(error, 'Could not read saved workflows');
      return res.status(controlError.statusCode).json({ error: controlError.message });
    }
  });

  app.post('/api/openchamber/workflows/start', express.json({ limit: '64kb' }), async (req, res) => {
    const body = startBodySchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'directory and name are required' });
    try {
      return res.json(await runtime.startSaved(body.data));
    } catch (error) {
      const controlError = asControlError(error, 'Could not start the workflow');
      return res.status(controlError.statusCode).json({ error: controlError.message });
    }
  });

  app.get<unknown, { runId: string }>('/api/openchamber/workflows/:runId', async (req, res) => {
    try {
      return res.json(await runtime.detail({ runId: req.params.runId }));
    } catch (error) {
      const controlError = asControlError(error, 'Could not read the workflow run');
      return res.status(controlError.statusCode).json({ error: controlError.message });
    }
  });

  app.get<unknown, { runId: string; key: string }>('/api/openchamber/workflows/:runId/agents/:key', async (req, res) => {
    try {
      return res.json(await runtime.agentDetail({ runId: req.params.runId, key: req.params.key }));
    } catch (error) {
      const controlError = asControlError(error, 'Could not read the workflow agent');
      return res.status(controlError.statusCode).json({ error: controlError.message });
    }
  });

  app.delete<unknown, { runId: string }>('/api/openchamber/workflows/:runId', async (req, res) => {
    try {
      return res.json(await runtime.remove({ runId: req.params.runId }));
    } catch (error) {
      const controlError = asControlError(error, 'Could not delete the workflow run');
      return res.status(controlError.statusCode).json({ error: controlError.message });
    }
  });

  app.post<unknown, { runId: string; action: string }>('/api/openchamber/workflows/:runId/:action', express.json({ limit: '4kb' }), async (req, res) => {
    const { runId, action } = req.params;
    if (!isWorkflowAction(action)) return res.status(404).json({ error: `Unknown workflow action: ${action}` });
    try {
      return res.json(await runtime[action]({ runId }));
    } catch (error) {
      const controlError = asControlError(error, `Could not ${action} the workflow`);
      return res.status(controlError.statusCode).json({ error: controlError.message });
    }
  });
};

/**
 * The workflow runtime and its routes, built together because the agent tool
 * reaches the runtime through the control service. Absent entirely unless the
 * build flag is set: `OPENCHAMBER_WORKFLOWS_ENABLE`, unset in every build that
 * has not opted in.
 */
export const createWorkflowsModule = ({
  sessionService,
  resolveWorkspaceScope,
  listWorkspaceScopes,
  dataDir,
  fsPromises,
  path,
  broadcast,
  isEnabled = async () => isWorkflowFeatureAvailable(),
}) => {
  if (!isWorkflowFeatureAvailable()) return { available: false, workflowRuntime: null, register() {} };
  // Canonical workspaces are registered per directory; a workflow's run names
  // the session's folder, so its agents are created in the same workspace.
  const resolveWorkspace = async (directory) => {
    const listed = await listWorkspaceScopes();
    for (const item of listed.items) {
      const scope = await resolveWorkspaceScope(item.workspaceId);
      if (scope && scope.cwd === directory) return scope;
    }
    return null;
  };
  const agentSessions = createWorkflowAgentSessions({ sessionService, resolveWorkspace });
  const workflowRuntime = createWorkflowRuntime({
    store: createWorkflowRunStore({ fsPromises, path, dataDir }),
    agentSessions,
    postSynthetic: agentSessions.postSynthetic,
    broadcast,
    isEnabled,
    fsPromises,
    path,
  });
  void workflowRuntime.start().catch((error) => {
    console.warn('[workflows] failed to restore runs:', error?.message ?? error);
  });
  return {
    available: true,
    workflowRuntime,
    register(app) {
      registerWorkflowRoutes(app, workflowRuntime);
    },
    /** Sends every saved report once the Agent Service can take prompts. */
    deliverPending() {
      return workflowRuntime.deliverPending();
    },
  };
};
