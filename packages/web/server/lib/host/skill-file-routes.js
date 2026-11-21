import { z } from 'zod';
import * as C from '@openchamber/agent-contract';
import { SkillFileError } from './skill-file-owner.js';

const Query = z.strictObject({ scope: C.FileResourceScopeSchema });

export function registerSkillFileRoutes(router, { express, owner, resolveWorkspaceScope }) {
  const json = express.json({ limit: '1mb', strict: true });
  const skillFilesPath = /^\/workspaces\/[^/]+\/skills\/files(?:\/|$)/;
  router.use((req, res, next) => skillFilesPath.test(req.path) ? json(req, res, next) : next());
  router.use(async (req, res, next) => {
    const match = /^\/workspaces\/([^/]+)\/skills\/files(?:\/([^/]+)(?:\/(.*))?)?$/.exec(req.path);
    if (!match) return next();
    try {
      const workspaceId = C.EntityIdSchema.parse(decodeURIComponent(match[1]));
      const scope = await resolveWorkspaceScope(workspaceId);
      if (!scope || scope.workspaceId !== workspaceId) throw new SkillFileError(403, 'UNAUTHORIZED', 'The selected workspace is not authorized.');
      if (scope.checkoutRemoved) throw new SkillFileError(409, 'SESSION_READ_ONLY', 'This workspace\'s worktree was deleted, so it is read-only.');
      if (req.method === 'POST' && match[2] === 'apply' && match[3] === undefined) {
        z.strictObject({}).parse(req.query);
        if (!req.is('application/json')) throw new SkillFileError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send an application/json request body.');
        const input = C.SkillFileDeleteRequestSchema.parse(req.body);
        return res.json(await owner.apply(scope, input.scope, input.expectedSourceRevision));
      }
      const skillId = match[2] === undefined ? undefined : C.FileResourcePathSchema.parse(decodeURIComponent(match[2]));
      const filePath = match[3] === undefined ? undefined : C.FileResourcePathSchema.parse(decodeURIComponent(match[3]));
      if (req.method === 'GET') {
        if (!skillId) {
          z.strictObject({}).parse(req.query);
          return res.json(await owner.catalog(scope));
        }
        const { scope: selection } = Query.parse(req.query);
        return res.json(await owner.read(scope, selection, skillId, filePath));
      }
      if (!skillId) throw new SkillFileError(400, 'INVALID_REQUEST', 'Select a skill file to change.');
      z.strictObject({}).parse(req.query);
      if (!req.is('application/json')) throw new SkillFileError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send an application/json request body.');
      if (req.method === 'PUT' && filePath) {
        const input = C.SkillFileWriteRequestSchema.parse(req.body);
        return res.json(await owner.mutate(scope, input.scope, input.expectedSourceRevision, skillId, {
          kind: 'write', target: `${skillId}/${filePath}`, content: input.content,
        }));
      }
      if (req.method === 'DELETE') {
        const input = C.SkillFileDeleteRequestSchema.parse(req.body);
        return res.json(await owner.mutate(scope, input.scope, input.expectedSourceRevision, skillId, {
          kind: 'delete', target: filePath ? `${skillId}/${filePath}` : skillId,
        }));
      }
      if (req.method === 'POST' && filePath === 'rename') {
        const input = C.SkillFileRenameRequestSchema.parse(req.body);
        if (input.name === skillId || input.name.startsWith(`${skillId}/`) || skillId.startsWith(`${input.name}/`))
          throw new SkillFileError(400, 'INVALID_REQUEST', 'Choose a distinct skill directory.');
        return res.json(await owner.mutate(scope, input.scope, input.expectedSourceRevision, skillId, {
          kind: 'rename', target: skillId, destination: input.name,
        }));
      }
      throw new SkillFileError(404, 'NOT_IMPLEMENTED', 'No skill file operation matches this request.');
    } catch (error) {
      const invalid = error instanceof z.ZodError || error instanceof URIError;
      const missing = error.code === 'ENOENT';
      const status = error instanceof SkillFileError ? error.status : invalid ? 400 : missing ? 404 : 503;
      const code = error instanceof SkillFileError ? error.code : invalid ? 'INVALID_REQUEST' : missing ? 'NOT_FOUND' : 'SKILL_INSTALL_FAILED';
      const problem = {
        type: `urn:ohpichamber:problem:${code}`, title: status >= 500 ? 'Skill source operation incomplete' : 'Skill source request refused',
        status, code, detail: error instanceof SkillFileError ? error.message : invalid ? 'The skill file request is invalid.' : missing ? 'The skill file does not exist.' : 'The skill source could not be read or committed.',
        retryable: status >= 500,
      };
      if (error.details !== undefined) problem.details = error.details;
      return res.status(status).type('application/problem+json').json(C.ProblemDetailsSchema.parse(problem));
    }
  });
}
