import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { CommandCatalogStateSchema, FileResourceExpandResultSchema, FileResourceSkillCatalogSchema, PromptTemplateCatalogStateSchema } from '@openchamber/agent-contract';
import type { FileResourceOperation } from '../catalogs/file-resources-protocol.ts';
import { WorkerOperationError, WorkerRegistry } from './workers.ts';
import { WorkspaceCatalogs } from './workspaces.ts';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'native-file-resources-'));
  const cwd = join(root, 'workspace'); const agentDirectory = join(root, 'agent');
  await mkdir(cwd); await mkdir(agentDirectory);
  const workers = new WorkerRegistry({ workerEntrypoint: fileURLToPath(new URL('../worker/index.ts', import.meta.url)), startupTimeoutMs: 30000, policyCheck: async () => ({ allowed: true }) });
  cleanups.push(async () => { await workers.close(); await rm(root, { recursive: true, force: true }); });
  const stateDirectory = join(root, 'service');
  let catalogs = new WorkspaceCatalogs(stateDirectory, workers);
  const registration = { projectId: 'project', cwd, agentDirectory, agentDirectoryId: 'agent-owner', env: { HOME: root, XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data') } };
  await catalogs.initialize(); await catalogs.register('workspace', registration);
  const operation = async (operation: FileResourceOperation) => {
    const result = await catalogs.operation('workspace', { type: 'fileResources', operation });
    if (result.type !== 'fileResources') throw new Error('Expected native file-resource result');
    return result.result;
  };
  return { root, cwd, agentDirectory, workers, operation,
    reopen: async () => {
      for (const worker of workers.list()) await workers.stop(worker.rootSessionId);
      catalogs = new WorkspaceCatalogs(stateDirectory, workers);
      await catalogs.initialize(); await catalogs.register('workspace', registration);
    },
  };
}

test('native command CRUD preserves Markdown, metadata, quoted arguments and durable CAS without a session', async () => {
  const h = await fixture();
  const body = 'Review $1 and $2.\n\n{{arguments}}\n';
  const created = await h.operation({ action: 'commands.create', request: { expectedRevision: '0', name: 'review', scope: 'workspace', description: 'Review current work', argumentHint: '<target>', content: body, agentId: 'reviewer', modelSelection: { providerId: 'provider', modelId: 'model' } } });
  if (created.kind !== 'commands') throw new Error('Expected command catalog');
  const entry = CommandCatalogStateSchema.parse(created.catalog).commands.find(entry => entry.name === 'review' && entry.editable);
  if (!entry) throw new Error('Native authored command was not discovered');
  expect(entry.content).toBe(body);
  expect(entry.argumentHint).toBe('<target>');
  expect(entry.agentId).toBe('reviewer');
  expect(entry.modelSelection).toEqual({ providerId: 'provider', modelId: 'model' });
  expect(JSON.stringify(created)).not.toContain(h.root);
  const expanded = await h.operation({ action: 'commands.expand', request: { commandId: entry.commandId, arguments: '"two words" last' } });
  if (expanded.kind !== 'expanded') throw new Error('Expected expanded command');
  expect(FileResourceExpandResultSchema.parse(expanded.result)).toMatchObject({ content: 'Review two words and last.\n\ntwo words last', agentId: 'reviewer', modelSelection: entry.modelSelection });
  const original = await readFile(join(h.cwd, '.omp', 'commands', 'review.md'), 'utf8');
  const concurrent = await Promise.allSettled([
    h.operation({ action: 'commands.update', request: { expectedRevision: '1', commandId: entry.commandId, name: 'review', scope: 'workspace', content: '**first**\n' } }),
    h.operation({ action: 'commands.delete', request: { expectedRevision: '1', commandId: entry.commandId } }),
  ]);
  expect(concurrent.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  const refused = concurrent.find(result => result.status === 'rejected');
  if (!refused || refused.status !== 'rejected' || !(refused.reason instanceof WorkerOperationError)) throw new Error('Expected a stale CAS rejection');
  expect(refused.reason.status).toBe(409);
  expect(refused.reason.code).toBe('CATALOG_CONFLICT');
  expect(await readFile(join(h.cwd, '.omp', 'commands', 'review.md'), 'utf8')).not.toBe(original);
  expect(await readdir(join(h.cwd, '.omp', 'commands'))).toEqual(['review.md']);
  await h.reopen();
  const cold = await h.operation({ action: 'commands.read' });
  if (cold.kind !== 'commands') throw new Error('Expected cold catalog');
  expect(cold.catalog.revision).toBe('2');
  expect(cold.catalog.commands.find(item => item.commandId === entry.commandId)?.content).toBe('**first**\n');
  await h.operation({ action: 'commands.delete', request: { expectedRevision: '2', commandId: entry.commandId } });
  expect(await readdir(join(h.cwd, '.omp', 'commands'))).toEqual([]);
  expect(h.workers.list().every(worker => worker.kind === 'stateless')).toBe(true);
}, 60000);

test('native templates retain scope precedence, exact ID expansion, fallback args and grouping through rename', async () => {
  const h = await fixture();
  await h.operation({ action: 'templates.create', request: { expectedRevision: '0', name: 'review', scope: 'agent', content: 'Agent review' } });
  const created = await h.operation({ action: 'templates.create', request: { expectedRevision: '1', name: 'review', scope: 'workspace', content: 'Workspace $1', group: 'Quality', agentId: 'reviewer' } });
  if (created.kind !== 'templates') throw new Error('Expected template catalog');
  const entry = PromptTemplateCatalogStateSchema.parse(created.catalog).templates.find(item => item.scope === 'workspace');
  if (!entry) throw new Error('Expected workspace template');
  const explicit = await h.operation({ action: 'templates.expand', request: { templateId: entry.templateId, arguments: '"two words"' } });
  expect(explicit).toEqual({ kind: 'expanded', result: { content: 'Workspace two words', agentId: 'reviewer' } });
  expect(await h.operation({ action: 'templates.expand-text', request: { text: '/review extra words' } })).toEqual({ kind: 'expanded', result: { content: 'Agent review\n\nextra words' } });
  expect(await h.operation({ action: 'templates.expand-text', request: { text: 'Unmatched /review text' } })).toEqual({ kind: 'expanded', result: { content: 'Unmatched /review text' } });
  const moved = await h.operation({ action: 'templates.update', request: { expectedRevision: '2', templateId: entry.templateId, name: 'renamed', scope: 'workspace', content: '# Markdown\n\n{{arguments}}', group: 'Quality', agentId: 'reviewer' } });
  if (moved.kind !== 'templates') throw new Error('Expected renamed catalog');
  expect(moved.catalog.templates.find(item => item.scope === 'workspace')).toMatchObject({ name: 'renamed', group: 'Quality', content: '# Markdown\n\n{{arguments}}' });
  expect(await readdir(join(h.cwd, '.omp', 'prompts'))).toEqual(['renamed.md']);
  expect((await readFile(join(h.cwd, '.omp', 'prompts', 'renamed.md'), 'utf8')).endsWith('# Markdown\n\n{{arguments}}')).toBe(true);
}, 60000);

test('native resource boundaries reject traversal and symlink writes while external commands stay readonly', async () => {
  const h = await fixture();
  const outside = join(h.root, 'outside'); await mkdir(outside);
  await writeFile(join(outside, 'external.md'), 'External command $1');
  await mkdir(join(h.cwd, '.omp')); await symlink(outside, join(h.cwd, '.omp', 'commands'));
  const catalog = await h.operation({ action: 'commands.read' });
  if (catalog.kind !== 'commands') throw new Error('Expected command catalog');
  const external = catalog.catalog.commands.find(item => item.name === 'external');
  if (!external) throw new Error('Expected native external command');
  expect(external.editable).toBe(false);
  expect(external.scope).toBe('inherited');
  await expect(h.operation({ action: 'commands.create', request: { expectedRevision: '0', name: 'escape', scope: 'workspace', content: 'must not write' } })).rejects.toMatchObject({ status: 403 });
  await expect(h.operation({ action: 'commands.delete', request: { expectedRevision: '0', commandId: external.commandId } })).rejects.toMatchObject({ status: 403 });
  await expect(h.operation({ action: 'templates.create', request: { expectedRevision: '0', name: '../escape', scope: 'workspace', content: 'must not write' } })).rejects.toBeInstanceOf(z.ZodError);
  expect(await readdir(outside)).toEqual(['external.md']);
  expect(await readFile(join(outside, 'external.md'), 'utf8')).toBe('External command $1');
  expect(JSON.stringify(catalog)).not.toContain(outside);
}, 60000);

test('pre-session native skill discovery retains authoring identity and SDK argument expansion without private roots', async () => {
  const h = await fixture();
  const directory = join(h.cwd, '.omp', 'skills', 'review'); await mkdir(directory, { recursive: true });
  const markdown = `---\nname: review\ndescription: Review changes\n---\n# Review\n\nUse the review checklist.\n\nAuthored path: ${directory}\n`;
  await writeFile(join(directory, 'SKILL.md'), markdown);
  const read = await h.operation({ action: 'skills.read' });
  if (read.kind !== 'skills') throw new Error('Expected native skills');
  const skill = FileResourceSkillCatalogSchema.parse(read.catalog).skills.find(item => item.authoredSkillId === 'review');
  if (!skill) throw new Error('Expected owned native skill');
  expect(skill).toMatchObject({ name: 'review', scope: 'workspace', readOnly: false });
  expect(skill.content).toBe(markdown);
  const expanded = await h.operation({ action: 'skills.expand', request: { skillId: skill.skillId, arguments: 'the current diff' } });
  if (expanded.kind !== 'expanded') throw new Error('Expected native skill prompt');
  expect(expanded.result.content).toContain('the current diff');
  expect(expanded.result.content).toContain('Use the review checklist.');
  expect(expanded.result.content).toContain('skill://review');
  expect(JSON.stringify(expanded)).not.toContain(h.root);
  expect(h.workers.list().every(worker => worker.kind === 'stateless')).toBe(true);
}, 60000);

test('shared native prompt preparation classifies no-op matches and expands each native layer only once', async () => {
  const h = await fixture();
  await h.operation({ action: 'templates.create', request: { expectedRevision: '0', name: 'first', scope: 'workspace', content: '/second', agentId: 'template-agent' } });
  await h.operation({ action: 'templates.create', request: { expectedRevision: '1', name: 'second', scope: 'workspace', content: 'Must not recursively expand' } });
  await h.operation({ action: 'commands.create', request: { expectedRevision: '2', name: 'launch', scope: 'workspace', content: '/first', agentId: 'command-agent', modelSelection: { providerId: 'bound-provider', modelId: 'bound-model' } } });
  await h.operation({ action: 'commands.create', request: { expectedRevision: '3', name: 'same', scope: 'workspace', content: '/same' } });
  expect(await h.operation({ action: 'input.expand', request: { text: '/launch' } })).toEqual({ kind: 'prompt-input', result: { kind: 'command', content: '/second', agentId: 'command-agent', modelSelection: { providerId: 'bound-provider', modelId: 'bound-model' } } });
  expect(await h.operation({ action: 'input.expand', request: { text: '/first' } })).toEqual({ kind: 'prompt-input', result: { kind: 'template', content: '/second', agentId: 'template-agent' } });
  expect(await h.operation({ action: 'input.expand', request: { text: '/same' } })).toEqual({ kind: 'prompt-input', result: { kind: 'command', content: '/same' } });
  const untouched = '/skill:unlisted\n\nuntouched args  ';
  expect(await h.operation({ action: 'input.expand', request: { text: untouched } })).toEqual({ kind: 'prompt-input', result: { kind: 'text', content: untouched } });
  expect(await h.operation({ action: 'input.expand', request: { text: '/first\targument' } })).toEqual({ kind: 'prompt-input', result: { kind: 'text', content: '/first\targument' } });
}, 60000);
