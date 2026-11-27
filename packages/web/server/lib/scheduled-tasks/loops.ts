import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { parseModelSelector } from '@openchamber/agent-contract';
import { asNonEmptyString } from '../shared/guards.js';
import { parseMdFile, writeMdFile, getAncestors, findWorktreeRoot } from '../host/shared.js';
import type { ParsedMarkdownFile } from '../host/shared.js';
import { MAX_TASK_NAME_LENGTH } from '../projects/task-text-limits.js';
import type { DiscoveredLoop, LoopDefinition } from '../projects/contracts.js';

const LOOP_DIR_NAME = 'loops';
const USER_LOOP_ROOT = (): string => path.join(os.homedir(), '.agents', LOOP_DIR_NAME);

export interface DiscoveredLoopFile {
  filePath: string;
  scope: 'user' | 'project';
}

const ErrorMessageSchema = z.object({
  message: z.string(),
});

const splitProviderModel = (value: string | null) => {
  const parsed = parseModelSelector(asNonEmptyString(value) ?? '');
  if (!parsed) {
    return null;
  }
  return {
    providerId: parsed.providerId,
    modelId: parsed.modelId,
    thinkingLevel: parsed.thinkingLevel,
  };
};

export const parseLoopDefinition = (filePath: string): LoopDefinition | null => {
  let rawParsed: ParsedMarkdownFile;
  try {
    rawParsed = parseMdFile(filePath);
  } catch (error) {
    const parsedError = ErrorMessageSchema.safeParse(error);
    console.warn(`[loops] skipped malformed loop file ${filePath}:`, parsedError.success ? parsedError.data.message : error);
    return null;
  }

  const frontmatter = rawParsed.frontmatter;
  const name = asNonEmptyString(frontmatter.name);
  if (!name) {
    console.warn(`[loops] skipped ${filePath}: frontmatter "name" is required`);
    return null;
  }
  if (name.length > MAX_TASK_NAME_LENGTH) {
    console.warn(`[loops] skipped ${filePath}: frontmatter "name" exceeds ${MAX_TASK_NAME_LENGTH} characters`);
    return null;
  }

  const cron = asNonEmptyString(frontmatter.schedule);
  if (!cron) {
    console.warn(`[loops] skipped ${filePath}: frontmatter "schedule" (cron expression) is required`);
    return null;
  }

  const prompt = asNonEmptyString(rawParsed.body);
  if (!prompt) {
    console.warn(`[loops] skipped ${filePath}: markdown body (the execution prompt) is required`);
    return null;
  }

  const providerModel = splitProviderModel(asNonEmptyString(frontmatter.model));
  if (!providerModel) {
    console.warn(`[loops] skipped ${filePath}: frontmatter "model" must be "provider/model"`);
    return null;
  }

  const timezone = asNonEmptyString(frontmatter.timezone);
  const agent = asNonEmptyString(frontmatter.agent);

  const schedule: LoopDefinition['schedule'] = {
    kind: 'cron',
    cron,
  };
  if (timezone) schedule.timezone = timezone;

  const execution: LoopDefinition['execution'] = {
    prompt,
    providerID: providerModel.providerId,
    modelID: providerModel.modelId,
  };
  if (agent) execution.agent = agent;

  return {
    name,
    enabled: frontmatter.enabled === true,
    schedule,
    execution,
  };
};

export const loopFingerprint = (definition: LoopDefinition): string => createHash('sha256')
  .update(JSON.stringify({ name: definition.name, schedule: definition.schedule, execution: definition.execution }))
  .digest('hex');

export const setLoopFileEnabled = (filePath: string, enabled: boolean): boolean => {
  if (!parseLoopDefinition(filePath)) {
    return false;
  }
  const parsed = parseMdFile(filePath);
  writeMdFile(filePath, { ...parsed.frontmatter, enabled: Boolean(enabled) }, parsed.body);
  return true;
};

const walkLoopMdFiles = (rootDir: string): string[] => {
  if (!rootDir || !fs.existsSync(rootDir)) {
    return [];
  }
  try {
    return fs.readdirSync(rootDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => path.join(rootDir, entry.name))
      .sort();
  } catch {
    return [];
  }
};

export const discoverLoopFiles = (projectPath: string | null | undefined): DiscoveredLoopFile[] => {
  const files: DiscoveredLoopFile[] = [];
  for (const filePath of walkLoopMdFiles(USER_LOOP_ROOT())) {
    files.push({ filePath, scope: 'user' });
  }
  if (projectPath) {
    const worktreeRoot = findWorktreeRoot(projectPath) || path.resolve(projectPath);
    for (const ancestor of getAncestors(projectPath, worktreeRoot)) {
      const root = path.join(ancestor, '.agents', LOOP_DIR_NAME);
      for (const filePath of walkLoopMdFiles(root)) {
        files.push({ filePath, scope: 'project' });
      }
    }
  }
  return files;
};

type ResolvedDiscoveredLoop = Extract<DiscoveredLoop, { definition: LoopDefinition }>;

export const discoverLoops = (projectPath: string | null | undefined): DiscoveredLoop[] => {
  const byName = new Map<string, ResolvedDiscoveredLoop>();
  const loops: DiscoveredLoop[] = [];
  for (const { filePath, scope } of discoverLoopFiles(projectPath)) {
    const definition = parseLoopDefinition(filePath);
    if (!definition) {
      loops.push({ scope, filePath, definition: null });
      continue;
    }
    const existing = byName.get(definition.name);
    if (existing && (existing.scope === 'project' || scope === 'user')) {
      continue;
    }
    byName.set(definition.name, { scope, filePath, definition, fingerprint: loopFingerprint(definition) });
  }
  for (const entry of byName.values()) {
    loops.push(entry);
  }
  return loops;
};
