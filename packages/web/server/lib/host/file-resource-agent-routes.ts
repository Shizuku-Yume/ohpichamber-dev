import * as C from '@openchamber/agent-contract';
import type { ZodType } from 'zod';

export interface FileResourceAgentRoute {
  method: string;
  pattern: RegExp;
  request?: ZodType | undefined;
  response: ZodType;
}

export const FILE_RESOURCE_AGENT_ROUTES: FileResourceAgentRoute[] = [
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/behavior-files$/, response: C.BehaviorFileCatalogSchema },
  { method: 'PUT', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/behavior-files$/, request: C.BehaviorFileWriteSchema, response: C.BehaviorFileCatalogSchema },
  { method: 'DELETE', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/behavior-files$/, request: C.BehaviorFileDeleteSchema, response: C.BehaviorFileCatalogSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/commands$/, response: C.CommandCatalogStateSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/commands$/, request: C.CommandCreateRequestSchema, response: C.CommandCatalogStateSchema },
  { method: 'PATCH', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/commands\/[^/]+$/, request: C.CommandUpdateRequestSchema, response: C.CommandCatalogStateSchema },
  { method: 'DELETE', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/commands\/[^/]+$/, request: C.CommandDeleteRequestSchema, response: C.CommandCatalogStateSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/commands\/expand$/, request: C.CommandExpandRequestSchema, response: C.FileResourceExpandResultSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/commands\/expand-text$/, request: C.FileResourceExpandTextRequestSchema, response: C.FileResourcePromptInputResultSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/prompt-templates$/, response: C.PromptTemplateCatalogStateSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/prompt-templates$/, request: C.PromptTemplateCreateRequestSchema, response: C.PromptTemplateCatalogStateSchema },
  { method: 'PATCH', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/prompt-templates\/[^/]+$/, request: C.PromptTemplateUpdateRequestSchema, response: C.PromptTemplateCatalogStateSchema },
  { method: 'DELETE', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/prompt-templates\/[^/]+$/, request: C.PromptTemplateDeleteRequestSchema, response: C.PromptTemplateCatalogStateSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/prompt-templates\/expand$/, request: C.PromptTemplateExpandRequestSchema, response: C.FileResourceExpandResultSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/prompt-templates\/expand-text$/, request: C.FileResourceExpandTextRequestSchema, response: C.FileResourceExpandResultSchema },
  { method: 'GET', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/skills\/catalog$/, response: C.FileResourceSkillCatalogSchema },
  { method: 'POST', pattern: /^\/workspaces\/(?<workspaceId>[^/]+)\/skills\/expand$/, request: C.FileResourceSkillExpandRequestSchema, response: C.FileResourceExpandResultSchema },
];
