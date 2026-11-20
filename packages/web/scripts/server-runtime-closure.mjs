import fs from 'node:fs/promises';
import path from 'node:path';

export async function assertServerRuntimeClosure(outputDirectory, modules) {
  const pending = [...modules].map((file) => path.resolve(outputDirectory, file));
  const visited = new Set();
  for (let index = 0; index < pending.length; index += 1) {
    const file = pending[index];
    if (visited.has(file)) continue;
    const relative = path.relative(outputDirectory, file);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Server runtime import escapes the build: ${file}`);
    }
    const exists = await fs.stat(file).then((entry) => entry.isFile(), (error) => {
      if (error.code === 'ENOENT') return false;
      throw error;
    });
    if (!exists) throw new Error(`Server build is missing runtime module: ${relative}`);
    visited.add(file);
  }
  return visited.size;
}
