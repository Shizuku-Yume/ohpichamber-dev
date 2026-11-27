import { z } from 'zod';
import {
  EntityIdSchema, FileResourcePromptInputResultSchema, FileResourceExpandTextRequestSchema,
  ProblemDetailsSchema, PromptRequestSchema,
} from '@openchamber/agent-contract';
import type { PromptRequest } from '@openchamber/agent-contract';
import { OpenChamberControlError } from '../openchamber-control/error.js';
import type { JsonValue } from '../shared/json-values.js';

export interface ScheduledPromptScope {
  projectId: string;
  workspaceId: string;
  hostProjectId?: string | undefined;
  cwd: string;
  agentDirectory?: string | undefined;
  agentDirectoryId?: string | undefined;
}

export interface ScheduledPromptServiceClient {
  request: (pathname: string, init?: RequestInit) => Promise<globalThis.Response>;
}

export interface ScheduledPromptExpanderDependencies {
  service?: ScheduledPromptServiceClient | undefined;
  resolveWorkspaceScope?: ((workspaceId: string) => Promise<ScheduledPromptScope | null>) | undefined;
}

export const createScheduledPromptExpander = ({
  service,
  resolveWorkspaceScope,
}: ScheduledPromptExpanderDependencies) => async (
  scope: ScheduledPromptScope,
  input: PromptRequest | JsonValue,
): Promise<PromptRequest> => {
    const prompt = PromptRequestSchema.parse(input);
    if (!prompt.input.text.startsWith('/')) return prompt;
    if (!(service?.request instanceof Function) || !(resolveWorkspaceScope instanceof Function)) {
      throw new OpenChamberControlError('Native scheduled prompt expansion is unavailable', 503);
    }
    const workspaceId = EntityIdSchema.parse(scope?.workspaceId);
    const workspace = await resolveWorkspaceScope(workspaceId);
    if (!workspace || workspace.workspaceId !== workspaceId || workspace.projectId !== scope.projectId
      || workspace.cwd !== scope.cwd || workspace.hostProjectId !== scope.hostProjectId
      || workspace.agentDirectoryId !== scope.agentDirectoryId || workspace.agentDirectory !== scope.agentDirectory) {
      throw new OpenChamberControlError('Scheduled prompt workspace is not authorized', 403);
    }
    const response = await service.request(`/api/agent/v1/workspaces/${encodeURIComponent(workspaceId)}/commands/expand-text`, {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(FileResourceExpandTextRequestSchema.parse({ text: prompt.input.text })),
    });
    const payload = z.json().parse(await response.json());
    if (!response.ok) {
      const problem = ProblemDetailsSchema.safeParse(payload);
      if (!problem.success) throw new OpenChamberControlError('Native scheduled prompt expansion failed', 503);
      throw new OpenChamberControlError(problem.data.detail, response.status, { code: problem.data.code });
    }
    const expansion = FileResourcePromptInputResultSchema.parse(payload);
    const options = { ...prompt.options };
    if (expansion.kind !== 'text') {
      if (expansion.modelSelection) {
        options.providerId = expansion.modelSelection.providerId;
        options.modelId = expansion.modelSelection.modelId;
      }
    }
    return PromptRequestSchema.parse({ input: { ...prompt.input, text: expansion.content }, options });
  };
