import type fsPromisesType from 'node:fs/promises';
import type nodeOs from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import type { Application, Request, Response } from '../shared/http-contracts.js';
import { isRecord, isString } from '../shared/guards.js';

const MAX_BEHAVIOR_FILE_BYTES = 1024 * 1024;
const AGENTS_FILE_NAME = 'AGENTS.md';

const ErrorCodeSchema = z.object({ code: z.string() });
const ErrorStatusSchema = z.object({
  status: z.number().int().optional(),
  message: z.string().optional(),
});
const ScopeRequestSchema = z.object({
  scope: z.enum(['global', 'project']).optional(),
  directory: z.string().optional(),
});
const PutBodySchema = z.object({
  content: z.string(),
});

interface HttpTaggedError extends Error {
  status: number;
}

export interface BehaviorFileSystem {
  readFile: typeof fsPromisesType.readFile;
  writeFile: typeof fsPromisesType.writeFile;
  mkdir: typeof fsPromisesType.mkdir;
  rename: typeof fsPromisesType.rename;
  unlink: typeof fsPromisesType.unlink;
}

export interface BehaviorWorkspaceDirectory {
  workspaceId?: string | undefined;
}

export interface BehaviorWorkspaceScope {
  cwd?: string | undefined;
}

export interface BehaviorRoutesDependencies {
  fsPromises: BehaviorFileSystem;
  os: Pick<typeof nodeOs, 'homedir'>;
  resolveWorkspaceDirectory: (directory: string) => Promise<BehaviorWorkspaceDirectory | null | undefined>;
  resolveWorkspaceScope: (workspaceId: string) => Promise<BehaviorWorkspaceScope | null | undefined>;
}

export interface ResolveGlobalAgentsPathOptions {
  os: Pick<typeof nodeOs, 'homedir'>;
  pathModule?: Pick<typeof path, 'resolve' | 'join'> | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

const asError = (message: string, status = 400): HttpTaggedError =>
  Object.assign(new Error(message), { status });

const resolveGlobalAgentsPath = ({ os, pathModule = path, env = process.env }: ResolveGlobalAgentsPathOptions): string => {
  const configured = isString(env.PI_CODING_AGENT_DIR) ? env.PI_CODING_AGENT_DIR.trim() : '';
  const agentDirectory = configured ? pathModule.resolve(configured) : pathModule.join(os.homedir(), '.omp', 'agent');
  return pathModule.join(agentDirectory, AGENTS_FILE_NAME);
};

interface ResolvedBehaviorTarget {
  scope: 'global' | 'project';
  filePath: string;
  directory?: string;
}

const resolveRequest = async ({
  req,
  resolveWorkspaceDirectory,
  resolveWorkspaceScope,
  os,
}: {
  req: Request;
  resolveWorkspaceDirectory: BehaviorRoutesDependencies['resolveWorkspaceDirectory'];
  resolveWorkspaceScope: BehaviorRoutesDependencies['resolveWorkspaceScope'];
  os: Pick<typeof nodeOs, 'homedir'>;
}): Promise<ResolvedBehaviorTarget> => {
  const queryFields = ScopeRequestSchema.safeParse(req.query);
  const bodyFields = ScopeRequestSchema.safeParse(req.body);
  const querySource = isRecord(req.query) ? req.query.scope : undefined;
  const bodySource = isRecord(req.body) ? req.body.scope : undefined;
  const source = querySource ?? bodySource;
  if (source === 'global') {
    return { scope: 'global', filePath: resolveGlobalAgentsPath({ os }) };
  }
  if (source !== 'project') throw asError('Behavior scope must be "global" or "project"');
  const queryDir = queryFields.success ? queryFields.data.directory : undefined;
  const bodyDir = bodyFields.success ? bodyFields.data.directory : undefined;
  const rawQueryDir = isRecord(req.query) ? req.query.directory : undefined;
  const rawBodyDir = isRecord(req.body) ? req.body.directory : undefined;
  const directory = rawQueryDir !== undefined ? queryDir : bodyDir;
  if (rawQueryDir === undefined && rawBodyDir === undefined && directory === undefined) {
    throw asError('A project directory is required');
  }
  if (!isString(directory) || !directory.trim()) throw asError('A project directory is required');
  const workspace = await resolveWorkspaceDirectory(directory);
  if (!workspace?.workspaceId) throw asError('The project directory is not an authorized workspace', 403);
  const scope = await resolveWorkspaceScope(workspace.workspaceId);
  if (!scope?.cwd) throw asError('The project directory is not an authorized workspace', 403);
  return { scope: 'project', filePath: path.join(scope.cwd, AGENTS_FILE_NAME), directory: scope.cwd };
};

const readCurrent = async (
  fsPromises: BehaviorFileSystem,
  filePath: string,
): Promise<{ exists: boolean; content: string }> => {
  try {
    return { exists: true, content: await fsPromises.readFile(filePath, 'utf8') };
  } catch (error) {
    const parsed = ErrorCodeSchema.safeParse(error);
    if (parsed.success && parsed.data.code === 'ENOENT') return { exists: false, content: '' };
    throw error;
  }
};

const writeAtomic = async (
  fsPromises: BehaviorFileSystem,
  filePath: string,
  content: string,
): Promise<void> => {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await fsPromises.writeFile(temporary, content, 'utf8');
    await fsPromises.rename(temporary, filePath);
  } catch (error) {
    await fsPromises.unlink(temporary).catch(() => { });
    throw error;
  }
};

export const registerBehaviorRoutes = (app: Application, dependencies: BehaviorRoutesDependencies): void => {
  const { fsPromises, os, resolveWorkspaceDirectory, resolveWorkspaceScope } = dependencies;
  if (!resolveWorkspaceDirectory || !resolveWorkspaceScope) throw new TypeError('behavior routes require workspace resolution');

  const sendFailure = (res: Response, status: number, message: string) =>
    res.status(status).json({ error: message });

  const logAndSendFailure = (res: Response, error: Error | string) => {
    const parsedError = ErrorStatusSchema.safeParse(error);
    const status = parsedError.success && parsedError.data.status !== undefined ? parsedError.data.status : 500;
    if (status === 500) console.error('Failed to handle the behavior rules request:', error);
    const message = parsedError.success && parsedError.data.message ? parsedError.data.message : 'Failed to handle the behavior rules request';
    return sendFailure(res, status, message);
  };

  app.get('/api/behavior/agents-md', async (req, res) => {
    try {
      const { filePath } = await resolveRequest({ req, resolveWorkspaceDirectory, resolveWorkspaceScope, os });
      const current = await readCurrent(fsPromises, filePath);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ content: current.content, exists: current.exists });
    } catch (error) {
      return logAndSendFailure(res, error instanceof Error ? error : String(error));
    }
  });

  app.put('/api/behavior/agents-md', async (req, res) => {
    try {
      const { filePath } = await resolveRequest({ req, resolveWorkspaceDirectory, resolveWorkspaceScope, os });
      const bodyParsed = PutBodySchema.safeParse(req.body);
      if (!bodyParsed.success) throw asError('Behavior content must be a string');
      const content = bodyParsed.data.content;
      if (Buffer.byteLength(content, 'utf8') > MAX_BEHAVIOR_FILE_BYTES) throw asError('Behavior content is too large', 413);

      if (isRecord(req.body) && Object.hasOwn(req.body, 'expectedContent')) {
        const current = await readCurrent(fsPromises, filePath);
        const expected = req.body.expectedContent;
        const onDisk = current.exists ? current.content : null;
        if (onDisk !== expected) {
          return res.status(409).json({ error: 'AGENTS.md changed on disk since it was loaded', code: 'AGENTS_MD_CONFLICT' });
        }
      }

      await writeAtomic(fsPromises, filePath, content);
      return res.json({ success: true });
    } catch (error) {
      return logAndSendFailure(res, error instanceof Error ? error : String(error));
    }
  });
};

export { resolveGlobalAgentsPath };
