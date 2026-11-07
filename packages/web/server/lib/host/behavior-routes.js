// Behavior rules editor endpoints.
//
// The Behavior page edits two AGENTS.md files that OMP itself reads as context
// files: the global one in OMP's agent directory and the project one in the
// root of an authorized workspace. Writes are atomic and refuse to replace a
// file that changed after the editor loaded it, so an edit made in another
// editor is never silently lost.
import path from 'node:path';

const MAX_BEHAVIOR_FILE_BYTES = 1024 * 1024;
const AGENTS_FILE_NAME = 'AGENTS.md';

const asError = (message, status = 400) => Object.assign(new Error(message), { status });

/**
 * OMP's own agent directory: `PI_CODING_AGENT_DIR` when the Host was started
 * with one, then `PI_CONFIG_DIR` relocating the config root, otherwise the
 * default `~/.omp/agent`. `PI_CONFIG_DIR` is a name relative to home in OMP; an
 * absolute value is the relocated root itself.
 */
const resolveGlobalAgentsPath = ({ os, pathModule = path, env = process.env }) => {
  const configured = typeof env.PI_CODING_AGENT_DIR === 'string' ? env.PI_CODING_AGENT_DIR.trim() : '';
  if (configured) return pathModule.join(pathModule.resolve(configured), AGENTS_FILE_NAME);
  const configDir = typeof env.PI_CONFIG_DIR === 'string' ? env.PI_CONFIG_DIR.trim() : '';
  const configRoot = !configDir
    ? pathModule.join(os.homedir(), '.omp')
    : pathModule.isAbsolute(configDir) ? pathModule.resolve(configDir) : pathModule.join(os.homedir(), configDir);
  return pathModule.join(configRoot, 'agent', AGENTS_FILE_NAME);
};

const resolveRequest = async ({ req, resolveWorkspaceDirectory, os }) => {
  const source = req.query?.scope ?? req.body?.scope;
  if (source === 'global') {
    return { scope: 'global', filePath: resolveGlobalAgentsPath({ os }) };
  }
  if (source !== 'project') throw asError('Behavior scope must be "global" or "project"');
  const directory = req.query?.directory ?? req.body?.directory;
  if (typeof directory !== 'string' || !directory.trim()) throw asError('A project directory is required');
  const workspace = await resolveWorkspaceDirectory(directory);
  if (!workspace?.cwd) throw asError('The project directory is not an authorized workspace', 403);
  return { scope: 'project', filePath: path.join(workspace.cwd, AGENTS_FILE_NAME), directory: workspace.cwd };
};

const readCurrent = async (fsPromises, filePath) => {
  try {
    return { exists: true, content: await fsPromises.readFile(filePath, 'utf8') };
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, content: '' };
    throw error;
  }
};

const writeAtomic = async (fsPromises, filePath, content) => {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await fsPromises.writeFile(temporary, content, 'utf8');
    await fsPromises.rename(temporary, filePath);
  } catch (error) {
    await fsPromises.unlink(temporary).catch(() => {});
    throw error;
  }
};

export const registerBehaviorRoutes = (app, dependencies) => {
  const { fsPromises, os, resolveWorkspaceDirectory } = dependencies;
  if (!resolveWorkspaceDirectory) throw new TypeError('behavior routes require workspace resolution');

  const sendFailure = (res, error) => {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    if (status === 500) console.error('Failed to handle the behavior rules request:', error);
    return res.status(status).json({ error: error?.message || 'Failed to handle the behavior rules request' });
  };

  app.get('/api/behavior/agents-md', async (req, res) => {
    try {
      const { filePath } = await resolveRequest({ req, resolveWorkspaceDirectory, os });
      const current = await readCurrent(fsPromises, filePath);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ content: current.content, exists: current.exists });
    } catch (error) {
      return sendFailure(res, error);
    }
  });

  app.put('/api/behavior/agents-md', async (req, res) => {
    try {
      const { filePath } = await resolveRequest({ req, resolveWorkspaceDirectory, os });
      const content = req.body?.content;
      if (typeof content !== 'string') throw asError('Behavior content must be a string');
      if (Buffer.byteLength(content, 'utf8') > MAX_BEHAVIOR_FILE_BYTES) throw asError('Behavior content is too large', 413);

      // `expectedContent` is what the editor loaded (null: no file). A file
      // edited elsewhere since then is reported instead of overwritten.
      if (req.body && Object.hasOwn(req.body, 'expectedContent')) {
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
      return sendFailure(res, error);
    }
  });
};

export { resolveGlobalAgentsPath };
