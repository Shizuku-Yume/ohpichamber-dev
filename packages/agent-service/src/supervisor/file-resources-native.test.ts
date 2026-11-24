import { afterEach, expect, test } from 'bun:test';
import { once } from 'node:events';
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { parseFrontmatter } from '@oh-my-pi/pi-utils';
import { CommandCatalogStateSchema, FileResourceExpandResultSchema, FileResourceSkillCatalogSchema, PromptTemplateCatalogStateSchema, type ExtensionToggleRequest } from '@openchamber/agent-contract';
import type { FileResourceOperation } from '../catalogs/file-resources-protocol.ts';
import { WorkerOperationError, WorkerRegistry } from './workers.ts';
import { WorkspaceCatalogs } from './workspaces.ts';
import { lookupBuiltinSlashCommand } from '@oh-my-pi/pi-coding-agent/slash-commands/builtin-registry';
import { bucketRules } from '@oh-my-pi/pi-coding-agent/capability/rule-buckets';
import { createSourceMeta, discoverRuleFromMarkdown } from '@oh-my-pi/pi-coding-agent/discovery/helpers';
import { TtsrManager } from '@oh-my-pi/pi-coding-agent/export/ttsr';
import { initializeWithSettings, loadCapability } from '@oh-my-pi/pi-coding-agent/discovery';
import { Settings } from '@oh-my-pi/pi-coding-agent/config/settings';
import { reset as resetCapabilities } from '@oh-my-pi/pi-coding-agent/capability';
import { ruleCapability, type Rule } from '@oh-my-pi/pi-coding-agent/capability/rule';
import { systemPromptCapability, type SystemPrompt } from '@oh-my-pi/pi-coding-agent/capability/system-prompt';
import { ALLOWED_BUILTIN_COMMANDS } from '../worker/builtin-commands.ts';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
async function fixture(nested = false) {
  const root = await mkdtemp(join(tmpdir(), 'native-file-resources-'));
  const project = join(root, 'workspace');
  const cwd = nested ? join(project, 'nested') : project; const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true }); await mkdir(agentDirectory);
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
  return {
    root, cwd, agentDirectory, workers, operation,
    settings: () => catalogs.operation('workspace', { type: 'catalog.settings.read' }),
    extensions: () => catalogs.operation('workspace', { type: 'extensions.read' }),
    toggleExtension: (request: ExtensionToggleRequest) => catalogs.operation('workspace', { type: 'extensions.toggle', request }),
    updateSettings: (revision: string, changes: Array<{ id: string; value: boolean }>) =>
      catalogs.operation('workspace', { type: 'catalog.settings.write', request: { expectedRevision: revision, changes } }),
    reopen: async () => {
      for (const worker of workers.list()) await workers.stop(worker.rootSessionId);
      catalogs = new WorkspaceCatalogs(stateDirectory, workers);
      await catalogs.initialize(); await catalogs.register('workspace', registration);
    },
  };
}

test('behavior file edits preserve native rule metadata, both fixed scopes, and strict legacy catalogs', async () => {
  const h = await fixture();
  const root = join(h.cwd, '.omp');
  const rule = join(root, 'rules', 'greeting.mdc');
  const header = '---\r\nenabled: false\r\ncondition: "hello"\r\nfuture: "true <!-- note -->"\r\n---\r\n';
  await mkdir(join(root, 'rules'), { recursive: true });
  await writeFile(rule, header + 'Old.\r\n');
  const legacy = await h.operation({ action: 'commands.read' });
  if (legacy.kind !== 'commands') throw new Error('Expected command catalog');
  expect(Object.keys(legacy.catalog).sort()).toEqual(['builtinCommands', 'commands', 'revision', 'workspaceId']);
  const read = async () => {
    const result = await h.operation({ action: 'behavior.read' });
    if (result.kind !== 'behavior') throw new Error('Expected Behavior catalog');
    return result.catalog;
  };
  const initial = await read();
  const entry = initial.files[0];
  expect(entry).toMatchObject({ scope: 'workspace', name: 'greeting.mdc', content: 'Old.\r\n', fields: { enabled: false, condition: 'hello' } });
  const bodyOnly = await h.operation({
    action: 'behavior.write', request: {
      kind: entry.kind, name: entry.name, scope: entry.scope, expectedVersion: entry.version, expectedRevision: initial.revision, content: 'New.\r\n',
    }
  });
  expect(await readFile(rule, 'utf8')).toBe(header + 'New.\r\n');
  if (bodyOnly.kind !== 'behavior') throw new Error('Expected Behavior catalog');
  await h.operation({
    action: 'behavior.write', request: {
      kind: entry.kind, name: entry.name, scope: entry.scope, expectedVersion: bodyOnly.catalog.files[0].version,
      expectedRevision: bodyOnly.catalog.revision, content: 'New.\r\n',
      fields: { enabled: null, description: 'A note <!-- literal -->', astCondition: ['return $VALUE;'], scope: ['tool:edit(**/*.ts)'], repeatMode: 'after-gap' },
    }
  });
  expect(parseFrontmatter(await readFile(rule, 'utf8'), { level: 'fatal' }).frontmatter).toEqual({
    condition: 'hello', future: 'true <!-- note -->', description: 'A note <!-- literal -->',
    astCondition: ['return $VALUE;'], scope: ['tool:edit(**/*.ts)'], repeatMode: 'after-gap',
  });
  for (const scope of ['agent', 'workspace'] as const) {
    const base = scope === 'workspace' ? root : h.agentDirectory;
    for (const [kind, name] of [['system', 'SYSTEM.md'], ['sticky-rules', 'RULES.md']] as const) {
      const { revision } = await read();
      const content = `# ${scope} ${name}\n`;
      await h.operation({ action: 'behavior.write', request: { kind, scope, name, content, expectedVersion: null, expectedRevision: revision } });
      expect(await readFile(join(base, name), 'utf8')).toBe(content);
    }
    const { revision } = await read();
    const content = 'Use a greeting.\n';
    await h.operation({
      action: 'behavior.write', request: {
        kind: 'instruction', scope, name: 'greeting.instructions.md', content, expectedVersion: null, expectedRevision: revision, fields: { applyTo: '**/*.ts' },
      }
    });
    expect(parseFrontmatter(await readFile(join(base, 'instructions', 'greeting.instructions.md'), 'utf8'))).toEqual({
      body: 'Use a greeting.', frontmatter: { applyTo: '**/*.ts' },
    });
  }
  const inventory = await h.extensions();
  if (inventory.type !== 'extensions.inventory') throw new Error('Expected native Extensions inventory');
  expect(inventory.state.extensions.items.filter(entry => entry.kind === 'instruction' && entry.name === 'greeting').map(entry => entry.scope).sort()).toEqual(['project', 'user']);
  const catalog = await read();
  const target = catalog.files.find(file => file.scope === 'agent' && file.kind === 'system')!;
  await h.operation({ action: 'behavior.delete', request: { kind: target.kind, scope: target.scope, name: target.name, expectedVersion: target.version, expectedRevision: catalog.revision } });
  expect((await read()).files.some(file => file.scope === 'agent' && file.kind === 'system')).toBe(false);
}, 60000);

test('new enabled Behavior rules must be usable by OMP', async () => {
  const h = await fixture();
  const request = { kind: 'rule', scope: 'workspace' as const, name: 'new.mdc', content: 'Use a greeting.', expectedRevision: '0', expectedVersion: null };
  const path = join(h.cwd, request.name);
  const rule = discoverRuleFromMarkdown(request.name, request.content, path, createSourceMeta('native', path, 'project'));
  expect(rule).not.toBeNull();
  const manager = new TtsrManager();
  expect(bucketRules([rule!], manager)).toEqual({ rulebookRules: [], alwaysApplyRules: [] });
  expect(manager.getRules()).toEqual([]);
  for (const fields of [undefined, { globs: ['*.md'] }, { condition: ['['] }]) {
    await expect(h.operation({ action: 'behavior.write', request: { ...request, fields } })).rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
  }
  const created = await h.operation({ action: 'behavior.write', request: { ...request, fields: { condition: ['*.md'] } } });
  if (created.kind !== 'behavior') throw new Error('Expected Behavior catalog');
  expect(created.catalog.files).toHaveLength(1);
}, 60000);

test('scoped Behavior writes do not shadow inherited OMP system and sticky rules', async () => {
  const h = await fixture(true);
  const parent = join(h.root, 'workspace', '.omp');
  await mkdir(parent);
  await writeFile(join(parent, 'SYSTEM.md'), 'Inherited system.');
  await writeFile(join(parent, 'RULES.md'), 'Inherited rules.');
  const checkInherited = async () => {
    resetCapabilities();
    const options = { cwd: h.cwd, agentDir: h.agentDirectory };
    const systems = await loadCapability<SystemPrompt>(systemPromptCapability.id, options);
    const rules = await loadCapability<Rule>(ruleCapability.id, options);
    expect(systems.items.find(item => item.level === 'project')?.path).toBe(join(parent, 'SYSTEM.md'));
    expect(rules.items.find(item => item.name === 'RULES@project')?._source?.path).toBe(join(parent, 'RULES.md'));
  };
  await checkInherited();
  const request = { scope: 'workspace' as const, content: 'Use a greeting.', expectedRevision: '0', expectedVersion: null };
  const outcome = await h.operation({ action: 'behavior.write', request: { ...request, kind: 'instruction', name: 'new.md' } }).catch(error => error as unknown);
  await checkInherited();
  expect(outcome).toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
  await expect(h.operation({ action: 'behavior.write', request: { ...request, kind: 'rule', name: 'new.mdc', fields: { alwaysApply: true } } })).rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
  expect(await readdir(h.cwd)).not.toContain('.omp');
}, 60000);

test('an inherited sticky rule disabled in Extensions does not block a local Behavior write', async () => {
  const h = await fixture(true);
  const parent = join(h.root, 'workspace', '.omp');
  await mkdir(parent);
  const path = join(parent, 'RULES.md');
  await writeFile(path, 'Inherited rules.');
  const initial = await h.extensions();
  if (initial.type !== 'extensions.inventory') throw new Error('Expected Extensions inventory');
  const sticky = initial.state.extensions.items.find(item => item.kind === 'rule' && item.name === 'RULES@project');
  expect(sticky).toMatchObject({ enabled: true, providerId: 'native', toggleable: true });
  const request = { kind: 'instruction', name: 'new.md', scope: 'workspace' as const, content: 'Use a greeting.', expectedVersion: null };
  await expect(h.operation({ action: 'behavior.write', request: { ...request, expectedRevision: initial.state.revision } })).rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
  const disabled = await h.toggleExtension({
    providerId: sticky!.providerId, extensionId: sticky!.id, enabled: false, expectedRevision: initial.state.revision,
  });
  if (disabled.type !== 'extensions.inventory') throw new Error('Expected Extensions inventory');
  expect(disabled.state.extensions.items.find(item => item.id === sticky!.id)).toMatchObject({ enabled: false, disabledReason: 'item-disabled' });
  resetCapabilities();
  const release = initializeWithSettings(await Settings.init({ cwd: h.cwd, agentDir: h.agentDirectory }));
  try {
    const rules = await loadCapability<Rule>(ruleCapability.id, { cwd: h.cwd, agentDir: h.agentDirectory });
    expect(rules.items.find(item => item.name === 'RULES@project')).toBeUndefined();
  } finally { release(); }
  const result = await h.operation({ action: 'behavior.write', request: { ...request, expectedRevision: disabled.state.revision } });
  if (result.kind !== 'behavior') throw new Error('Expected Behavior catalog');
  expect(result.catalog.files).toMatchObject([{ name: request.name, content: request.content }]);
  expect(await readFile(path, 'utf8')).toBe('Inherited rules.');
}, 60000);

test('clearing a Behavior condition removes the native fallback triggers', async () => {
  const h = await fixture();
  const directory = join(h.cwd, '.omp', 'rules');
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'legacy.mdc');
  const source = createSourceMeta('native', path, 'project');
  const header = '---\ndescription: Still in the rulebook\nttsr_trigger: first\nttsrTrigger: second\nttsr-trigger: third\n---\n';
  const content = 'Use a greeting.';
  await writeFile(path, header + content);
  expect(discoverRuleFromMarkdown('legacy.mdc', header + content, path, source)?.condition).toEqual(['first']);
  const initial = await h.operation({ action: 'behavior.read' });
  if (initial.kind !== 'behavior') throw new Error('Expected Behavior catalog');
  const entry = initial.catalog.files[0];
  await h.operation({
    action: 'behavior.write', request: {
      kind: entry.kind, scope: entry.scope, name: entry.name, content, expectedVersion: entry.version,
      expectedRevision: initial.catalog.revision, fields: { condition: null },
    }
  });
  const saved = await readFile(path, 'utf8');
  expect(discoverRuleFromMarkdown('legacy.mdc', saved, path, source)?.condition).toBeUndefined();
  expect(entry.fields.condition).toBe('first');
  expect(parseFrontmatter(saved, { rawKeys: true }).frontmatter).toEqual({ description: 'Still in the rulebook' });
}, 60000);

test('behavior file targets refuse escapes, executable hooks, SSH, symlinks and stale writes', async () => {
  const h = await fixture();
  const outside = join(h.root, 'outside.md');
  await writeFile(outside, 'Do not replace.\n');
  const root = join(h.cwd, '.omp');
  await mkdir(join(root, 'rules'), { recursive: true });
  await symlink(outside, join(root, 'rules', 'escape.md'));
  const request = { scope: 'workspace' as const, content: 'Benign.\n', expectedRevision: '0', expectedVersion: null };
  for (const [kind, name] of [
    ['rule', '../outside.md'], ['rule', outside], ['rule', 'C:\\outside.md'], ['rule', 'escape.md'],
    ['hook', 'hook.md'], ['ssh', 'ssh.json'], ['system', 'APPEND_SYSTEM.md'], ['rule', 'ssh.json'],
  ]) {
    await expect(h.operation({ action: 'behavior.write', request: { ...request, kind, name } })).rejects.toMatchObject({ status: 403, code: 'UNAUTHORIZED' });
  }
  expect(await readFile(outside, 'utf8')).toBe('Do not replace.\n');
  const created = await h.operation({ action: 'behavior.write', request: { ...request, kind: 'rule', name: 'local.md', fields: { alwaysApply: true } } });
  if (created.kind !== 'behavior') throw new Error('Expected Behavior catalog');
  expect(created.catalog.files.map(file => file.name)).toEqual(['local.md']);
  const entry = created.catalog.files[0];
  await expect(h.operation({ action: 'behavior.write', request: { ...request, kind: 'rule', name: entry.name, expectedVersion: entry.version } })).rejects.toMatchObject({ status: 409, code: 'CATALOG_CONFLICT' });
  await writeFile(join(root, 'rules', entry.name), 'Outside edit.\n');
  await expect(h.operation({ action: 'behavior.write', request: { ...request, kind: 'rule', name: entry.name, expectedRevision: created.catalog.revision, expectedVersion: entry.version } })).rejects.toMatchObject({ status: 409, code: 'CATALOG_CONFLICT' });
  expect(await readFile(join(root, 'rules', entry.name), 'utf8')).toBe('Outside edit.\n');
}, 60000);

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

test('settings writes change native discovery without changing the resource response schemas', async () => {
  const h = await fixture();
  const claudeCommands = join(h.cwd, '.claude', 'commands');
  const skill = join(h.cwd, '.omp', 'skills', 'example');
  await mkdir(claudeCommands, { recursive: true });
  await mkdir(skill, { recursive: true });
  await writeFile(join(claudeCommands, 'hello.md'), 'Say hello.');
  await writeFile(join(skill, 'SKILL.md'), '---\nname: example\ndescription: A hello example\n---\nSay hello.\n');
  const read = await h.settings();
  if (read.type !== 'catalog.settings') throw new Error('Expected OMP settings');
  const changes = [{ id: 'commands.enableClaudeProject', value: false }, { id: 'skills.enabled', value: false }];
  const commandsBefore = await h.operation({ action: 'commands.read' });
  const skillsBefore = await h.operation({ action: 'skills.read' });
  if (commandsBefore.kind !== 'commands' || skillsBefore.kind !== 'skills') throw new Error('Expected native catalogs');
  expect(CommandCatalogStateSchema.parse(commandsBefore.catalog).commands.some(command => command.name === 'hello')).toBe(true);
  expect(FileResourceSkillCatalogSchema.parse(skillsBefore.catalog).skills.some(skill => skill.name === 'example')).toBe(true);
  await h.updateSettings(read.state.revision, changes);
  const after = await h.operation({ action: 'commands.read' });
  const skillsAfter = await h.operation({ action: 'skills.read' });
  if (after.kind !== 'commands' || skillsAfter.kind !== 'skills') throw new Error('Expected native catalogs');
  expect(CommandCatalogStateSchema.parse(after.catalog).commands.some(command => command.name === 'hello')).toBe(false);
  expect(FileResourceSkillCatalogSchema.parse(skillsAfter.catalog).skills).toEqual([]);
}, 60000);

test('foreign user discovery opt-ins can load resources independently of capability switches', async () => {
  const h = await fixture();
  for (const [source, name] of [['.claude', 'claude-example'], ['.config/opencode', 'opencode-example']]) {
    const directory = join(h.root, source, 'commands');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${name}.md`), 'Say hello.');
  }
  for (const [source, name] of [['.claude', 'claude-example'], ['.codex', 'codex-example']]) {
    const directory = join(h.root, source, 'skills', name);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'SKILL.md'), `---\nname: ${name}\ndescription: A hello example\n---\nSay hello.\n`);
  }
  const config = join(h.agentDirectory, 'config.yml');
  const capabilitySwitches = 'commands:\n  enableClaudeUser: false\n  enableOpencodeUser: false\nskills:\n  enableClaudeUser: false\n  enableCodexUser: false\n';
  await writeFile(config, capabilitySwitches);
  const discover = async () => {
    const result = await h.extensions();
    if (result.type !== 'extensions.inventory') throw new Error('Expected extension inventory');
    const items = result.state.extensions.items.filter(item => item.enabled && item.name.endsWith('-example'));
    return {
      commands: items.filter(item => item.kind === 'slash-command').map(item => item.name).sort(),
      skills: items.filter(item => item.kind === 'skill').map(item => item.name).sort(),
    };
  };
  expect(await discover()).toEqual({ commands: [], skills: [] });
  await writeFile(config, capabilitySwitches.replace('enableOpencodeUser: false', 'enableOpencodeUser: true'));
  const commands = await h.operation({ action: 'commands.read' });
  if (commands.kind !== 'commands') throw new Error('Expected native command catalog');
  expect(commands.catalog.commands.some(command => command.name === 'opencode-example')).toBe(true);
  await writeFile(config, capabilitySwitches + 'enabledProviders: [claude, opencode, codex]\n');
  await h.settings();
  expect(await discover()).toEqual({
    commands: ['claude-example', 'opencode-example'],
    skills: ['claude-example', 'codex-example'],
  });
  const settings = await h.settings();
  if (settings.type !== 'catalog.settings') throw new Error('Expected OMP settings');
  const exposed = settings.state.settings.filter(({ id }) => [
    'commands.enableClaudeUser', 'commands.enableOpencodeUser', 'skills.enableClaudeUser', 'skills.enableCodexUser',
  ].includes(id));
  expect(exposed).toEqual([]);
}, 60000);

test('command editing preserves native side, raw keys and unrelated metadata', async () => {
  const h = await fixture();
  const dir = join(h.cwd, '.omp', 'commands');
  await mkdir(dir, { recursive: true });
  const path = join(dir, 'hello.md');
  const header = '---\r\n# Keep this on a body-only edit\r\nside: true\r\nargumentHint: a name\r\nnative-key: {inner-key: [keep, true]}\r\nopenchamber: {future-key: keep}\r\n---\r\n';
  await writeFile(path, header + 'Say hello.\r\n');
  const read = await h.operation({ action: 'commands.read' });
  if (read.kind !== 'commands') throw new Error('Expected command catalog');
  const command = read.catalog.commands.find(entry => entry.name === 'hello' && entry.editable);
  if (!command) throw new Error('Expected authored command');
  const { commandId, name, description, argumentHint } = command;
  const updated = await h.operation({
    action: 'commands.update', request: {
      expectedRevision: read.catalog.revision, commandId, name, scope: 'workspace', description, argumentHint, content: 'Say hello again.\n',
    }
  });
  if (updated.kind !== 'commands') throw new Error('Expected updated command catalog');
  expect(await readFile(path, 'utf8')).toBe(header + 'Say hello again.\n');
  await h.operation({
    action: 'commands.update', request: {
      expectedRevision: updated.catalog.revision, commandId, name, scope: 'workspace', description: 'A greeting', content: 'Say hello again.\n',
    }
  });
  const file = await readFile(path, 'utf8');
  expect(parseFrontmatter(file, { rawKeys: true }).frontmatter).toEqual({
    description: 'A greeting', side: true, argumentHint: 'a name', 'native-key': { 'inner-key': ['keep', true] }, openchamber: { 'future-key': 'keep' },
  });
}, 60000);

test('description edits preserve literal native metadata without OMP repair', async () => {
  const h = await fixture();
  const directory = join(h.cwd, '.omp', 'commands');
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'hello.md');
  const nativeValue = 'keep <!-- literal -->\tand a tab';
  const content = 'Say hello.\n';
  await writeFile(path, `<!-- Header note -->\n---\ndescription: Original\nnative-key: "${nativeValue}"\n---\n${content}`);
  const read = await h.operation({ action: 'commands.read' });
  if (read.kind !== 'commands') throw new Error('Expected command catalog');
  const command = read.catalog.commands.find(entry => entry.name === 'hello' && entry.editable);
  if (!command) throw new Error('Expected authored command');
  await h.operation({
    action: 'commands.update', request: {
      expectedRevision: read.catalog.revision, commandId: command.commandId, name: command.name, scope: 'workspace',
      description: 'Edited', content,
    }
  });
  const text = await readFile(path, 'utf8');
  const prefix = '<!-- Header note -->\n';
  expect(text.startsWith(prefix)).toBe(true);
  expect(parseFrontmatter(text.slice(prefix.length), { repair: false, rawKeys: true }).frontmatter).toEqual({
    description: 'Edited', 'native-key': nativeValue,
  });
}, 60000);

test.each([
  ['HTML comment scalar', 'native-key: "true <!-- x -->"\n', 'true <!-- x -->', 'Edited <!-- y -->'],
  ['repairable colon scalar', 'native-key: before: after\n', 'before: after', 'Edited'],
])('description edits round-trip a %s through OMP discovery', async (_name, metadata, nativeValue, description) => {
  const h = await fixture();
  const directory = join(h.cwd, '.omp', 'commands');
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'hello.md');
  const content = 'Say hello.\n';
  await writeFile(path, `---\ndescription: Original\n${metadata}---\n${content}`);
  const read = await h.operation({ action: 'commands.read' });
  if (read.kind !== 'commands') throw new Error('Expected command catalog');
  const command = read.catalog.commands.find(entry => entry.name === 'hello' && entry.editable);
  if (!command) throw new Error('Expected authored command');
  await h.operation({
    action: 'commands.update', request: {
      expectedRevision: read.catalog.revision, commandId: command.commandId, name: command.name, scope: 'workspace',
      description, content,
    }
  });
  const reloaded = await h.operation({ action: 'commands.read' });
  if (reloaded.kind !== 'commands') throw new Error('Expected command catalog');
  expect(parseFrontmatter(await readFile(path, 'utf8'), { level: 'fatal', rawKeys: true }).frontmatter).toEqual({
    description, 'native-key': nativeValue,
  });
  expect(reloaded.catalog.commands.find(entry => entry.commandId === command.commandId)).toMatchObject({ description, content });
}, 60000);

test('native delimiters separate metadata from the editable body', async () => {
  const h = await fixture();
  const dir = join(h.cwd, '.omp', 'commands');
  await mkdir(dir, { recursive: true });
  const fixtures = [
    { name: 'commented', header: '--- # metadata\r\nside: true\r\n---\r\n', body: 'Say hello.\r\n' },
    { name: 'repaired', header: '<!-- Note -->\r  ---\rside: true\r---', body: ' # Native body starts here\r' },
  ];
  for (const { name, header, body } of fixtures) {
    expect(parseFrontmatter(header + body)).toEqual({ frontmatter: { side: true }, body: body.trim() });
    await writeFile(join(dir, `${name}.md`), header + body);
  }
  const read = await h.operation({ action: 'commands.read' });
  if (read.kind !== 'commands') throw new Error('Expected command catalog');
  let revision = read.catalog.revision;
  for (const { name, header, body } of fixtures) {
    const command = read.catalog.commands.find(entry => entry.name === name && entry.editable);
    if (!command) throw new Error('Expected authored command');
    expect(command.content).toBe(body);
    const content = body.replace(/hello|starts/, 'again');
    const updated = await h.operation({
      action: 'commands.update', request: {
        expectedRevision: revision, commandId: command.commandId, name, scope: 'workspace', content,
      }
    });
    if (updated.kind !== 'commands') throw new Error('Expected updated command catalog');
    expect(await readFile(join(dir, `${name}.md`), 'utf8')).toBe(header + content);
    revision = updated.catalog.revision;
  }
}, 60000);

test('a native command with many leading comments and no frontmatter does not block discovery', async () => {
  const h = await fixture();
  await h.operation({ action: 'commands.read' });
  const directory = join(h.cwd, '.omp', 'commands');
  await mkdir(directory, { recursive: true });
  const content = '<!-- Note -->\n'.repeat(1_000) + 'Say hello.\n';
  await writeFile(join(directory, 'commented.md'), content);
  const result = await Promise.race([
    h.operation({ action: 'commands.read' }),
    once(AbortSignal.timeout(3_000), 'abort').then(() => { throw new Error('Comment-only command discovery exceeded the worker watchdog'); }),
  ]);
  if (result.kind !== 'commands') throw new Error('Expected command catalog');
  expect(result.catalog.commands.find(entry => entry.name === 'commented' && entry.editable)?.content).toBe(content);
}, 60000);

test('nested native prompt creation and body editing preserve the folder and native metadata', async () => {
  const h = await fixture();
  const created = await h.operation({
    action: 'templates.create', request: {
      expectedRevision: '0', name: 'reviews/backend/hello', scope: 'workspace', content: 'Say hello.',
    }
  });
  if (created.kind !== 'templates') throw new Error('Expected template catalog');
  const entry = created.catalog.templates.find(template => template.editable);
  if (!entry) throw new Error('Expected authored template');
  expect(entry).toMatchObject({ name: 'hello', group: 'reviews/backend', source: '(project:reviews:backend)' });
  const path = join(h.cwd, '.omp', 'prompts', 'reviews', 'backend', 'hello.md');
  const header = '---\ncustom-key: {inner-key: true}\n---\n';
  await writeFile(path, header + 'Say hello.');
  await h.operation({
    action: 'templates.update', request: {
      expectedRevision: created.catalog.revision, templateId: entry.templateId, name: entry.name, scope: 'workspace',
      description: entry.description, group: entry.group, content: 'Say hello again.',
    }
  });
  expect(await readFile(path, 'utf8')).toBe(header + 'Say hello again.');
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

test('all 30 ALLOWED_BUILTIN_COMMANDS are projected as read-only inherited entries and file-backed commands remain editable', async () => {
  const h = await fixture();
  const catalogResult = await h.operation({ action: 'commands.read' });
  if (catalogResult.kind !== 'commands') throw new Error('Expected command catalog');
  const catalog = CommandCatalogStateSchema.parse(catalogResult.catalog);

  expect(catalog.builtinCommands).toEqual([...ALLOWED_BUILTIN_COMMANDS]);
  for (const name of ALLOWED_BUILTIN_COMMANDS) {
    const entry = catalog.commands.find(cmd => cmd.name === name && cmd.source === 'builtin');
    if (!entry) throw new Error(`Missing projected builtin command: ${name}`);
    expect(entry.editable).toBe(false);
    expect(entry.scope).toBe('inherited');
    expect(entry.source).toBe('builtin');
    expect(typeof entry.description).toBe('string');
    expect(entry.description.length).toBeGreaterThan(0);

    const spec = lookupBuiltinSlashCommand(name);
    if (!spec) throw new Error(`Missing builtin spec: ${name}`);
    // OMP resolves the TUI copy through the active theme, so `Esc`/`Shift+Tab`
    // become `⎋`/`⇧⇥` depending on what loaded first. The catalog hands clients
    // the ACP copy, which names no key at all.
    if (spec.acpDescription) {
      expect(entry.description).toBe(spec.acpDescription);
      expect(entry.description).not.toContain('Shift+Tab');
      expect(entry.description).not.toContain('⇧⇥');
    }
    const expectedHint = spec.acpInputHint ?? spec.inlineHint ?? undefined;
    expect(entry.argumentHint).toBe(expectedHint);
  }
  // Assert dedicated /btw is also projected read-only without modifying the 29-command execution allowlist
  const btwEntry = catalog.commands.find(cmd => cmd.name === 'btw' && cmd.source === 'builtin');
  if (!btwEntry) throw new Error('Missing projected builtin command: btw');
  expect(btwEntry.editable).toBe(false);
  expect(btwEntry.scope).toBe('inherited');
  expect(catalog.builtinCommands).not.toContain('btw');

  const compactBuiltin = catalog.commands.find(cmd => cmd.name === 'compact' && cmd.source === 'builtin');
  if (!compactBuiltin) throw new Error('Missing compact builtin');
  await expect(h.operation({ action: 'commands.update', request: { expectedRevision: catalog.revision, commandId: compactBuiltin.commandId, name: 'compact', scope: 'workspace', content: 'should fail' } })).rejects.toMatchObject({ status: 403 });
  await expect(h.operation({ action: 'commands.delete', request: { expectedRevision: catalog.revision, commandId: compactBuiltin.commandId } })).rejects.toMatchObject({ status: 403 });

  // Assert synthetic builtin expansion returns literal command without erasing input
  const expandedLiteral = await h.operation({ action: 'commands.expand', request: { commandId: compactBuiltin.commandId, arguments: 'soft' } });
  if (expandedLiteral.kind !== 'expanded') throw new Error('Expected expanded result');
  expect(expandedLiteral.result.content).toBe('/compact soft');
  const expandedBare = await h.operation({ action: 'commands.expand', request: { commandId: compactBuiltin.commandId, arguments: '' } });
  if (expandedBare.kind !== 'expanded') throw new Error('Expected expanded result');
  expect(expandedBare.result.content).toBe('/compact');

  const created = await h.operation({
    action: 'commands.create',
    request: {
      expectedRevision: catalog.revision,
      name: 'compact',
      scope: 'workspace',
      description: 'Custom compact override',
      content: 'Custom compact template\n',
    },
  });
  if (created.kind !== 'commands') throw new Error('Expected command catalog after create');
  const updatedCatalog = CommandCatalogStateSchema.parse(created.catalog);
  const fileBacked = updatedCatalog.commands.find(cmd => cmd.name === 'compact' && cmd.editable);
  if (!fileBacked) throw new Error('Expected file-backed compact command to be present and editable');
  expect(fileBacked.editable).toBe(true);
  expect(fileBacked.scope).toBe('workspace');
  expect(fileBacked.content).toBe('Custom compact template\n');
  expect(fileBacked.description).toBe('Custom compact override');

  const builtinStillPresent = updatedCatalog.commands.find(cmd => cmd.name === 'compact' && !cmd.editable);
  if (!builtinStillPresent) throw new Error('Expected builtin compact to remain present');
  expect(builtinStillPresent.editable).toBe(false);
  expect(builtinStillPresent.scope).toBe('inherited');
}, 60000);
