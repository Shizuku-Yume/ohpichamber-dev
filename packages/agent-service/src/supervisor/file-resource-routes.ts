import { z } from 'zod';
import type { IncomingMessage } from 'node:http';
import {
  EntityIdSchema, CommandCreateRequestSchema, CommandUpdateRequestSchema, CommandDeleteRequestSchema,
  PromptTemplateCreateRequestSchema, PromptTemplateUpdateRequestSchema, PromptTemplateDeleteRequestSchema,
  CommandExpandRequestSchema, PromptTemplateExpandRequestSchema, FileResourceExpandTextRequestSchema,
  FileResourceSkillExpandRequestSchema,
} from '@openchamber/agent-contract';
import type { WorkspaceCatalogs } from './workspaces.ts';
import type { FileResourceOperation } from '../catalogs/file-resources-protocol.ts';
import { WorkerOperationError } from './workers.ts';

/** Host authorizes the workspace first; only opaque resource IDs cross this boundary. */
export async function fileResourceRoute(
  catalogs: WorkspaceCatalogs, request: IncomingMessage, url: URL,
  readBody: <T>(request: IncomingMessage, schema: z.ZodType<T>) => Promise<T>,
) {
  const route = /^\/api\/agent\/v1\/workspaces\/([^/]+)\/(commands|prompt-templates|skills)(?:\/([^/]+))?$/.exec(url.pathname);
  if (!route) return null;
  let workspaceId: string;
  let item: string | undefined;
  try { workspaceId = EntityIdSchema.parse(decodeURIComponent(route[1])); item = route[3] === undefined ? undefined : EntityIdSchema.parse(decodeURIComponent(route[3])); }
  catch { throw new WorkerOperationError(400, 'INVALID_REQUEST'); }
  let operation: FileResourceOperation;
  let status = 200;
  if (route[2] === 'skills') {
    if (item === 'catalog' && request.method === 'GET') operation = { action: 'skills.read' };
    else if (item === 'expand' && request.method === 'POST') operation = { action: 'skills.expand', request: await readBody(request, FileResourceSkillExpandRequestSchema) };
    else return null;
  } else if (route[2] === 'commands') {
    if (item === undefined && request.method === 'GET') operation = { action: 'commands.read' };
    else if (item === undefined && request.method === 'POST') { operation = { action: 'commands.create', request: await readBody(request, CommandCreateRequestSchema) }; status = 201; }
    else if (item === 'expand' && request.method === 'POST') operation = { action: 'commands.expand', request: await readBody(request, CommandExpandRequestSchema) };
    else if (item === 'expand-text' && request.method === 'POST') operation = { action: 'input.expand', request: await readBody(request, FileResourceExpandTextRequestSchema) };
    else if (item !== undefined && request.method === 'PATCH') {
      const body = await readBody(request, CommandUpdateRequestSchema);
      if (body.commandId !== item) throw new WorkerOperationError(400, 'INVALID_REQUEST');
      operation = { action: 'commands.update', request: body };
    } else if (item !== undefined && request.method === 'DELETE') {
      const body = await readBody(request, CommandDeleteRequestSchema);
      if (body.commandId !== item) throw new WorkerOperationError(400, 'INVALID_REQUEST');
      operation = { action: 'commands.delete', request: body };
    } else return null;
  } else {
    if (item === undefined && request.method === 'GET') operation = { action: 'templates.read' };
    else if (item === undefined && request.method === 'POST') { operation = { action: 'templates.create', request: await readBody(request, PromptTemplateCreateRequestSchema) }; status = 201; }
    else if (item === 'expand' && request.method === 'POST') operation = { action: 'templates.expand', request: await readBody(request, PromptTemplateExpandRequestSchema) };
    else if (item === 'expand-text' && request.method === 'POST') operation = { action: 'templates.expand-text', request: await readBody(request, FileResourceExpandTextRequestSchema) };
    else if (item !== undefined && request.method === 'PATCH') {
      const body = await readBody(request, PromptTemplateUpdateRequestSchema);
      if (body.templateId !== item) throw new WorkerOperationError(400, 'INVALID_REQUEST');
      operation = { action: 'templates.update', request: body };
    } else if (item !== undefined && request.method === 'DELETE') {
      const body = await readBody(request, PromptTemplateDeleteRequestSchema);
      if (body.templateId !== item) throw new WorkerOperationError(400, 'INVALID_REQUEST');
      operation = { action: 'templates.delete', request: body };
    } else return null;
  }
  const result = await catalogs.operation(workspaceId, { type: 'fileResources', operation });
  if (result.type !== 'fileResources') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
  return { status, body: result.result.kind === 'expanded' || result.result.kind === 'prompt-input' ? result.result.result : result.result.catalog };
}
