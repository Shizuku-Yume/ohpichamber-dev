import { resolvePrimaryWorktreeRoot } from '../git/service.js';
import { createProjectIdFromPath } from './project-id.js';

export async function resolveProjectContextId(directory: string | null | undefined) {
  if (!directory) return null;
  const primary = await resolvePrimaryWorktreeRoot(directory).catch(() => null);
  return createProjectIdFromPath(primary?.root ?? directory);
}
