import {
  EntityIdSchema, FileResourcePromptInputResultSchema, FileResourceExpandTextRequestSchema,
  ProblemDetailsSchema, PromptRequestSchema,
} from '@openchamber/agent-contract';
import { OpenChamberControlError } from '../openchamber-control/error.js';

/** Capture native content and bindings before scheduled queue persistence or session creation. */
export const createScheduledPromptExpander = ({ service, resolveWorkspaceScope }) => async (scope, input) => {
  const prompt = PromptRequestSchema.parse(input);
  if (!prompt.input.text.startsWith('/')) return prompt;
  if (typeof service?.request !== 'function' || typeof resolveWorkspaceScope !== 'function') {
    throw new OpenChamberControlError('Native scheduled prompt expansion is unavailable', 503);
  }
  const workspaceId = EntityIdSchema.parse(scope?.workspaceId);
  const workspace = await resolveWorkspaceScope(workspaceId);
  if (!workspace || workspace.workspaceId !== workspaceId || workspace.projectId !== scope.projectId
    || workspace.cwd !== scope.cwd || workspace.hostProjectId !== scope.hostProjectId
    || workspace.agentDirectoryId !== scope.agentDirectoryId || workspace.agentDirectory !== scope.agentDirectory) {
    throw new OpenChamberControlError('Scheduled prompt workspace is not authorized', 403);
  }
  // The worker owns the complete SDK command -> template pipeline, including no-match behavior.
  const response = await service.request(`/api/agent/v1/workspaces/${encodeURIComponent(workspaceId)}/commands/expand-text`, {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(FileResourceExpandTextRequestSchema.parse({ text: prompt.input.text })),
  });
  const payload = await response.json();
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
    if (expansion.agentId !== undefined) options.agentId = expansion.agentId;
  }
  return PromptRequestSchema.parse({ input: { ...prompt.input, text: expansion.content }, options });
};
