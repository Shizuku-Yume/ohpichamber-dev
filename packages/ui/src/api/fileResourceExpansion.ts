import type { FileResourceExpandResult } from '@openchamber/agent-contract';
import { canonicalClient } from './canonicalClient';
import { getRuntimeKey } from '@/lib/runtime-switch';

/** Resolve a leading native file invocation without interpreting its arguments in the renderer. */
export async function expandNativeFileResource(text: string, directory: string | null | undefined): Promise<FileResourceExpandResult | null> {
  if (!text.startsWith('/')) return null;
  if (!directory) throw new Error('A workspace directory is required to expand a file resource');
  const runtimeKey = getRuntimeKey();
  const workspace = await canonicalClient.resolveWorkspace(directory);
  if (runtimeKey !== getRuntimeKey()) throw new Error('File resource runtime changed');
  const result = await canonicalClient.fileResources.expandPromptInput(workspace.workspaceId, { text });
  if (runtimeKey !== getRuntimeKey()) throw new Error('File resource runtime changed');
  return result.kind === 'text' ? null : result;
}

/** Draft queues have no active root catalog yet; expansion still belongs to the workspace worker. */
export async function expandWorkspaceSkillNames(directory: string | null | undefined, names: readonly string[], argumentsText = ''): Promise<string | null> {
  if (!names.length) return null;
  if (!directory) throw new Error('A workspace directory is required to expand skills');
  const runtimeKey = getRuntimeKey();
  const workspace = await canonicalClient.resolveWorkspace(directory);
  if (runtimeKey !== getRuntimeKey()) throw new Error('Skill expansion runtime changed');
  const catalog = await canonicalClient.fileResources.getSkills(workspace.workspaceId);
  const messages: string[] = [];
  for (const name of new Set(names)) {
    if (runtimeKey !== getRuntimeKey()) throw new Error('Skill expansion runtime changed');
    const skill = catalog.skills.find(entry => entry.name === name);
    if (!skill) throw new Error(`Skill "${name}" is unavailable in the workspace catalog`);
    const result = await canonicalClient.fileResources.expandSkills(workspace.workspaceId, { skillId: skill.skillId, arguments: argumentsText });
    if (runtimeKey !== getRuntimeKey()) throw new Error('Skill expansion runtime changed');
    messages.push(result.content);
  }
  return messages.join('\n\n');
}
