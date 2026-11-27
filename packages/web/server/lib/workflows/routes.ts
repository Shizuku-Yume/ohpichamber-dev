import express from 'express';
import { z } from 'zod';
import type fs from 'node:fs/promises';
import type pathModule from 'node:path';

import { asControlError } from '../openchamber-control/error.js';
import type { Application } from '../shared/http-contracts.js';
import { createWorkflowAgentSessions } from './agent-session.js';
import type { WorkflowSessionService, WorkflowWorkspaceScope } from './agent-session.js';
import type { WorkflowRuntimeOptions } from './contracts.js';
import { createWorkflowRuntime } from './runtime.js';
import type { WorkflowRuntime } from './runtime.js';
import { createWorkflowRunStore } from './store.js';

export const isWorkflowFeatureAvailable = (): boolean => true;

type WorkflowAction = 'approve' | 'decline' | 'stop' | 'resume';

const isWorkflowAction = (action: string): action is WorkflowAction =>
  action === 'approve' || action === 'decline' || action === 'stop' || action === 'resume';

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

export const registerWorkflowRoutes = (app: Application, runtime: WorkflowRuntime): void => {
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

export interface WorkflowsModuleOptions {
  sessionService: WorkflowSessionService;
  resolveWorkspaceScope: (workspaceId: string) => Promise<WorkflowWorkspaceScope | null | undefined>;
  listWorkspaceScopes: () => Promise<{ items: { workspaceId: string }[] }>;
  dataDir: string;
  fsPromises: WorkflowRuntimeOptions['fsPromises'] & Pick<typeof fs, 'rename' | 'rm'>;
  path: WorkflowRuntimeOptions['path'] & Pick<typeof pathModule, 'join'>;
  broadcast?: WorkflowRuntimeOptions['broadcast'];
  isEnabled?: () => Promise<boolean>;
}

export type WorkflowsModule =
  | { available: false; workflowRuntime: null; register: (app: Application) => void }
  | {
    available: true;
    workflowRuntime: WorkflowRuntime;
    register: (app: Application) => void;
    deliverPending: () => Promise<void>;
  };

export const createWorkflowsModule = ({
  sessionService,
  resolveWorkspaceScope,
  listWorkspaceScopes,
  dataDir,
  fsPromises,
  path,
  broadcast,
  isEnabled = async () => isWorkflowFeatureAvailable(),
}: WorkflowsModuleOptions): WorkflowsModule => {
  if (!isWorkflowFeatureAvailable()) return { available: false, workflowRuntime: null, register() { } };
  const resolveWorkspace = async (directory: string): Promise<WorkflowWorkspaceScope | null> => {
    const listed = await listWorkspaceScopes();
    for (const item of listed.items) {
      const scope = await resolveWorkspaceScope(item.workspaceId);
      if (scope && scope.cwd === directory) return scope;
    }
    return null;
  };
  const agentSessions = createWorkflowAgentSessions({ sessionService, resolveWorkspace });
  const runtimeOptions: WorkflowRuntimeOptions = {
    store: createWorkflowRunStore({ fsPromises, path, dataDir }),
    agentSessions,
    postSynthetic: agentSessions.postSynthetic,
    isEnabled,
    fsPromises,
    path,
  };
  if (broadcast) runtimeOptions.broadcast = broadcast;
  const workflowRuntime = createWorkflowRuntime(runtimeOptions);
  void workflowRuntime.start().catch((error) => {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn('[workflows] failed to restore runs:', detail);
  });
  return {
    available: true,
    workflowRuntime,
    register(app: Application) {
      registerWorkflowRoutes(app, workflowRuntime);
    },
    deliverPending() {
      return workflowRuntime.deliverPending();
    },
  };
};
