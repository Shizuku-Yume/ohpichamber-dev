import { z } from 'zod';
import * as C from '@openchamber/agent-contract';
import type { ExpressFactory, Router } from '../shared/http-contracts.js';
import type { SkillCatalogOwner } from './skill-catalog-owner.js';
import { SkillFileError, type SkillFileErrorCode, type SkillFileScope } from './skill-file-owner.js';

const ErrorDetailsSchema = z.object({ details: C.JsonObjectSchema });

interface SkillProblemPayload {
  type: string;
  title: string;
  status: number;
  code: SkillFileErrorCode;
  detail: string;
  retryable: boolean;
  details?: C.JsonObject;
}

export interface SkillRepositoryRoutesDependencies {
  express: ExpressFactory;
  catalogOwner: SkillCatalogOwner;
  resolveWorkspaceScope: (workspaceId: string) => Promise<SkillFileScope | null | undefined>;
}

export function registerSkillRepositoryRoutes(
  router: Router,
  { express, catalogOwner, resolveWorkspaceScope }: SkillRepositoryRoutesDependencies,
): void {
  const json = express.json({ limit: '1mb', strict: true });
  const repositoryPath = /^\/workspaces\/[^/]+\/skills\/repositories(?:\/|$)/;
  router.use((req, res, next) => (repositoryPath.test(req.path) ? json(req, res, next) : next()));
  router.use(async (req, res, next) => {
    const match = /^\/workspaces\/([^/]+)\/skills\/repositories(?:\/(source|scan|install))?$/.exec(req.path);
    const rawWorkspaceId = match?.[1];
    if (!match || rawWorkspaceId === undefined) return next();
    try {
      const workspaceId = C.EntityIdSchema.parse(decodeURIComponent(rawWorkspaceId));
      const scope = await resolveWorkspaceScope(workspaceId);
      if (!scope || scope.workspaceId !== workspaceId) {
        throw new SkillFileError(403, 'UNAUTHORIZED', 'The selected workspace is not authorized.');
      }
      z.strictObject({}).parse(req.query);
      if (req.method === 'GET' && !match[2]) return res.json(await catalogOwner.catalog(scope));
      if (req.method !== 'POST' || !match[2]) {
        throw new SkillFileError(404, 'NOT_IMPLEMENTED', 'No repository operation matches this request.');
      }
      if (!req.is('application/json')) throw new SkillFileError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send an application/json request body.');
      if (match[2] === 'source') return res.json(await catalogOwner.source(scope, C.SkillRepositorySourceRequestSchema.parse(req.body)));
      if (match[2] === 'scan') return res.json(await catalogOwner.scan(scope, C.SkillRepositoryScanRequestSchema.parse(req.body)));
      return res.json(await catalogOwner.install(scope, C.SkillRepositoryInstallRequestSchema.parse(req.body)));
    } catch (error) {
      const invalid = error instanceof z.ZodError || error instanceof URIError;
      const status = error instanceof SkillFileError ? error.status : invalid ? 400 : 503;
      const code: SkillFileErrorCode = error instanceof SkillFileError
        ? error.code
        : invalid ? 'INVALID_REQUEST' : 'SKILL_INSTALL_FAILED';
      const problem: SkillProblemPayload = {
        type: `urn:ohpichamber:problem:${code}`,
        title: 'Skill repository request incomplete',
        status,
        code,
        detail: error instanceof SkillFileError
          ? error.message
          : invalid ? 'The skill repository request is invalid.' : 'The skill repository operation failed.',
        retryable: status >= 500,
      };
      const parsedDetails = error instanceof SkillFileError && error.details !== undefined
        ? { success: true as const, data: { details: error.details } }
        : ErrorDetailsSchema.safeParse(error);
      if (parsedDetails.success) problem.details = parsedDetails.data.details;
      return res.status(status).type('application/problem+json').json(C.ProblemDetailsSchema.parse(problem));
    }
  });
}
