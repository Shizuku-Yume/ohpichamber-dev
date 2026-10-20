import { randomUUID } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, unlink, readdir, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { ProjectionError } from '../projection/journal.ts';

/** The authoring surface owns only flat native extension source files, never packages or arbitrary paths. */
export class PluginLocalSource {
  constructor(private readonly cwd: string) {}

  private name(extensionId: string): string {
    if (extensionId.length > 160 || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(ts|js|mts|mjs)$/.test(extensionId)) {
      throw new ProjectionError(400, 'INVALID_REQUEST', 'Extension identifier must be a flat native JavaScript or TypeScript filename');
    }
    return extensionId;
  }

  private async directory(create: boolean): Promise<string | null> {
    const root = await realpath(this.cwd);
    let directory = root;
    for (const segment of ['.omp', 'extensions']) {
      directory = join(directory, segment);
      if (create) {
        try { await mkdir(directory, { mode: 0o700 }); }
        catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error; }
      }
      try {
        const entry = await lstat(directory);
        if (!entry.isDirectory() || entry.isSymbolicLink() || await realpath(directory) !== directory) {
          throw new ProjectionError(403, 'UNAUTHORIZED', 'Extension authoring directory must not contain symbolic links');
        }
      } catch (error) {
        if (!create && error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
        throw error;
      }
    }
    return directory;
  }

  async list(): Promise<string[]> {
    const directory = await this.directory(false);
    if (directory === null) return [];
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.filter(entry => entry.isFile() && /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(ts|js|mts|mjs)$/.test(entry.name)).map(entry => entry.name).sort();
  }

  async read(extensionId: string): Promise<string> {
    const name = this.name(extensionId);
    const directory = await this.directory(false);
    if (directory === null) throw new ProjectionError(404, 'INVALID_REQUEST', 'Local extension does not exist');
    let handle: FileHandle | undefined;
    try {
      handle = await open(join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
      if (!(await handle.stat()).isFile()) throw new ProjectionError(400, 'INVALID_REQUEST', 'Local extension must be a regular file');
      return await handle.readFile('utf8');
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') throw new ProjectionError(404, 'INVALID_REQUEST', 'Local extension does not exist');
      if (error instanceof Error && 'code' in error && error.code === 'ELOOP') throw new ProjectionError(403, 'UNAUTHORIZED', 'Local extension must not be a symbolic link');
      throw error;
    } finally { await handle?.close(); }
  }

  async write(extensionId: string, content: string): Promise<void> {
    const name = this.name(extensionId);
    if (Buffer.byteLength(content, 'utf8') > 1048576) throw new ProjectionError(400, 'INVALID_REQUEST', 'Local extension source exceeds the size limit');
    // Parsing never evaluates the extension, imports dependencies, or gives uncommitted code side effects.
    try { await new Bun.Transpiler({ loader: /\.(ts|mts)$/.test(name) ? 'ts' : 'js' }).transform(content); }
    catch { throw new ProjectionError(400, 'INVALID_REQUEST', 'Local extension source contains invalid syntax'); }
    const directory = await this.directory(true);
    if (directory === null) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Extension directory is unavailable');
    const target = join(directory, name);
    try {
      const entry = await lstat(target);
      if (!entry.isFile() || entry.isSymbolicLink()) throw new ProjectionError(403, 'UNAUTHORIZED', 'Local extension must not be a symbolic link');
    } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    const temporary = join(directory, `.${randomUUID()}.tmp`);
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(content, 'utf8'); await handle.sync(); }
      finally { await handle.close(); }
      // Recheck parent identity immediately before the atomic commit.
      if (await this.directory(false) !== directory) throw new ProjectionError(403, 'UNAUTHORIZED', 'Extension directory changed');
      await rename(temporary, target);
    } finally {
      try { await unlink(temporary); }
      catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    }
  }

  async delete(extensionId: string): Promise<void> {
    const name = this.name(extensionId);
    const directory = await this.directory(false);
    if (directory === null) throw new ProjectionError(404, 'INVALID_REQUEST', 'Local extension does not exist');
    const target = join(directory, name);
    let entry: Stats;
    try { entry = await lstat(target); }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') throw new ProjectionError(404, 'INVALID_REQUEST', 'Local extension does not exist');
      throw error;
    }
    if (!entry.isFile() || entry.isSymbolicLink()) throw new ProjectionError(403, 'UNAUTHORIZED', 'Local extension must not be a symbolic link');
    await unlink(target);
  }
}
