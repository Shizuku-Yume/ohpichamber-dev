import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UsageStatsSchema, UsageToolsResponseSchema, type UsageQuery } from '@openchamber/agent-contract';
import type { FileEntry, SessionEntry, SessionMessageEntry } from '@oh-my-pi/pi-coding-agent/session/session-entries';
import { loadSessionFile } from '@oh-my-pi/pi-coding-agent/session/session-loader';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import type { UsageSessionReference } from '../protocol.ts';
import { getUsageStats, getUsageTools } from './usage.ts';

let directory: string;
const start = Date.parse('2026-03-07T05:00:00Z');
const end = Date.parse('2026-03-10T04:00:00Z');
const query: UsageQuery = { from: start, to: end, timezone: 'America/New_York' };

beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'native-usage-')); await mkdir(join(directory, 'sessions')); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

function assistant(id: string, parentId: string | null, time: number, amount = 10, model = 'model-a', provider = 'provider-a'): SessionMessageEntry {
  return { type: 'message', id, parentId, timestamp: new Date(time).toISOString(), message: {
    role: 'assistant', api: 'openai-completions', provider, model, stopReason: 'stop', timestamp: time,
    content: [{ type: 'text', text: 'Persisted native response' }], usage: { input: amount, output: 2, cacheRead: 3, cacheWrite: 1, totalTokens: amount + 6,
      cost: { input: 0.1, output: 0.02, cacheRead: 0.03, cacheWrite: 0.01, total: 0.16 } },
  } };
}
function user(id: string, parentId: string | null, time: number): SessionMessageEntry {
  return { type: 'message', id, parentId, timestamp: new Date(time).toISOString(), message: { role: 'user', content: 'Persisted native prompt', timestamp: time } };
}
async function transcript(id: string, entries: SessionEntry[], options: { parentSession?: string; workspaceId?: string; projectId?: string; rootSessionId?: string } = {}): Promise<UsageSessionReference> {
  const sessionFile = join(directory, 'sessions', `${id}.jsonl`);
  const records: FileEntry[] = [{ type: 'session', version: 3, id: `native-${id}`, cwd: directory, timestamp: new Date(start).toISOString(),
    ...(options.parentSession ? { parentSession: options.parentSession } : {}) }, ...entries];
  await writeFile(sessionFile, records.map(entry => JSON.stringify(entry)).join('\n') + '\n');
  return { sessionId: id, rootSessionId: options.rootSessionId ?? id, workspaceId: options.workspaceId ?? 'workspace-a', projectId: options.projectId ?? 'project-a',
    cwd: directory, agentDirectory: join(directory, 'agent'), sessionsDirectory: join(directory, 'sessions'), sessionFile };
}

test('cold persisted native sessions aggregate accounting and models without changing transcript files', async () => {
  const first = await transcript('first', [user('00000001', null, start), assistant('00000002', '00000001', start + 1)]);
  // Persist an additional turn through the actual native writer, not a mocked loader/session manager.
  const manager = await SessionManager.open(first.sessionFile, first.sessionsDirectory, undefined, { initialCwd: directory, suppressBreadcrumb: true, throwIfMissing: true });
  manager.appendMessage(assistant('unused-id', null, start + 2, 20).message);
  await manager.flush();
  await manager.close();
  const second = await transcript('second', [user('00000003', null, start + 3), assistant('00000004', '00000003', start + 4, 30, 'model-b', 'provider-b')]);
  const before = await readFile(first.sessionFile, 'utf8');
  const native = await loadSessionFile(first.sessionFile, undefined, { throwIfMissing: true });
  expect(native.malformedRecords).toBe(0);
  expect(native.invalidHeader).toBe(false);
  const stats = UsageStatsSchema.parse(await getUsageStats(query, [first, second]));
  expect(stats).toMatchObject({ sessions: 2, subagents: 0, prompts: 2, steps: 3, partial: false, activeDays: 1, streak: 1,
    tokens: { input: 60, output: 6, cacheRead: 9, cacheWrite: 3, total: 78, reasoning: null }, tools: { mode: 'none' } });
  expect(stats.cost).toBeCloseTo(0.48);
  expect(stats.models.map(model => [model.providerId, model.modelId, model.tokens.total, model.variant])).toEqual([
    ['provider-a', 'model-a', 42, null], ['provider-b', 'model-b', 36, null],
  ]);
  expect(await readFile(first.sessionFile, 'utf8')).toBe(before);
});

test('viewer calendar activity and streak survive New York spring DST with exact inclusive/exclusive bounds', async () => {
  const times = [start - 1, start, Date.parse('2026-03-08T06:59:59Z'), Date.parse('2026-03-08T07:00:00Z'), Date.parse('2026-03-09T04:00:00Z'), end];
  const entries = times.map((time, index) => assistant(`dst${index}`, index === 0 ? null : `dst${index - 1}`, time));
  const source = await transcript('dst', entries);
  const stats = await getUsageStats(query, [source]);
  expect(stats.steps).toBe(4);
  expect(stats.range).toEqual({ from: start, to: end });
  expect(stats.activity).toEqual([{ date: '2026-03-07', steps: 1 }, { date: '2026-03-08', steps: 2 }, { date: '2026-03-09', steps: 1 }]);
  expect(stats.activeDays).toBe(3);
  expect(stats.streak).toBe(3);
});

test('London autumn DST repeated hour stays in one viewer day and UTC has independent buckets', async () => {
  const times = ['2026-10-24T23:30:00Z', '2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z', '2026-10-26T00:30:00Z'].map(Date.parse);
  const source = await transcript('london', times.map((time, index) => assistant(`london${index}`, index === 0 ? null : `london${index - 1}`, time)));
  const window: UsageQuery = { timezone: 'Europe/London', to: Date.parse('2026-10-27T00:00:00Z') };
  const local = await getUsageStats(window, [source]);
  expect(local.activity).toEqual([{ date: '2026-10-25', steps: 3 }, { date: '2026-10-26', steps: 1 }]);
  expect(local.streak).toBe(2);
  const utc = await getUsageStats({ ...window, timezone: 'UTC' }, [source]);
  expect(utc.activity).toEqual([{ date: '2026-10-24', steps: 1 }, { date: '2026-10-25', steps: 2 }, { date: '2026-10-26', steps: 1 }]);
});

test('all/workspace/project scopes inspect only the supplied authorized references', async () => {
  const first = await transcript('scope-a', [assistant('a', null, start)]);
  const second = await transcript('scope-b', [assistant('b', null, start)], { projectId: 'project-b' });
  const third = await transcript('scope-c', [assistant('c', null, start)], { workspaceId: 'workspace-b', projectId: 'project-c' });
  await transcript('unregistered-secret', [assistant('secret', null, start, 999_999)]);
  expect((await getUsageStats(query, [first, second, third])).steps).toBe(3);
  expect((await getUsageStats({ ...query, workspaceId: 'workspace-a' }, [first, second, third])).steps).toBe(2);
  expect((await getUsageStats({ ...query, workspaceId: 'workspace-a', projectId: 'project-a' }, [first, second, third])).steps).toBe(1);
  expect((await getUsageStats({ ...query, projectId: 'not-authorized' }, [first, second, third]))).toMatchObject({ steps: 0, partial: false, models: [] });
  expect((await getUsageStats(query, []))).toMatchObject({ steps: 0, partial: false });
});

test('malformed, truncated, empty and missing transcripts preserve siblings with sanitized canonical errors; total failure throws', async () => {
  const good = await transcript('good', [assistant('good-entry', null, start)]);
  const malformed = await transcript('malformed', [assistant('malformed-entry', null, start)]);
  const truncated = await transcript('truncated', []);
  const empty = await transcript('empty', []);
  const missing = await transcript('missing', []);
  await writeFile(malformed.sessionFile, (await readFile(malformed.sessionFile, 'utf8')) + '{not json}\n');
  await writeFile(truncated.sessionFile, (await readFile(truncated.sessionFile, 'utf8')) + '{"type":"message"');
  await writeFile(empty.sessionFile, '');
  await rm(missing.sessionFile);
  const refs = [good, malformed, truncated, empty, missing];
  const stats = await getUsageStats(query, refs);
  expect(stats).toMatchObject({ steps: 1, partial: true, errors: { malformed: 'USAGE_SESSION_CORRUPT', truncated: 'USAGE_SESSION_CORRUPT', empty: 'USAGE_SESSION_CORRUPT', missing: 'USAGE_SESSION_UNREADABLE' } });
  const tools = UsageToolsResponseSchema.parse(await getUsageTools(query, refs));
  expect(tools.partial).toBe(true);
  expect(tools.errors).toEqual(stats.errors);
  expect(JSON.stringify(stats.errors)).not.toContain(directory);
  await expect(getUsageStats(query, [malformed, missing])).rejects.toThrow('USAGE_UNAVAILABLE');
  await expect(getUsageTools(query, [truncated, empty])).rejects.toThrow('USAGE_UNAVAILABLE');
});

test('active native DAG excludes abandoned branch and deduplicates proven fork lineage, not unrelated short ID collisions', async () => {
  const prompt = user('shared-u', null, start);
  const shared = assistant('shared-a', 'shared-u', start + 1);
  const original = await transcript('original', [prompt, shared, assistant('abandoned', 'shared-a', start + 2, 900), assistant('active', 'shared-a', start + 3, 20)]);
  const fork = await transcript('fork', [prompt, shared, assistant('fork-only', 'shared-a', start + 4, 30)], { parentSession: original.sessionFile });
  const idFork = await transcript('id-fork', [prompt, shared, assistant('id-fork-only', 'shared-a', start + 5, 40)], { parentSession: 'native-original' });
  const unrelated = await transcript('unrelated', [prompt, shared]);
  const stats = await getUsageStats(query, [original, fork, idFork, unrelated]);
  expect(stats.steps).toBe(5);
  expect(stats.prompts).toBe(2);
  expect(stats.tokens.input).toBe(110);
  // An unavailable ancestor is metadata, never permission to follow and read it.
  const detached = await transcript('detached', [assistant('detached-turn', null, start)], { parentSession: join(directory, 'never-authorized.jsonl') });
  expect((await getUsageStats(query, [detached])).partial).toBe(false);
});

test('registered child direct spend is included once without inflating root prompt or turn metrics', async () => {
  const rootTurn = assistant('root-turn', 'root-user', start + 1);
  if (rootTurn.message.role !== 'assistant') throw new Error('fixture assistant expected');
  rootTurn.message.content = [{ type: 'toolCall', id: 'task-call', name: 'task', arguments: {} }];
  const childTurn = assistant('child-turn', 'child-user', start + 2, 50);
  if (childTurn.message.role !== 'assistant') throw new Error('fixture assistant expected');
  const taskResult: SessionMessageEntry = { type: 'message', id: 'task-result', parentId: 'root-turn', timestamp: new Date(start + 3).toISOString(), message: {
    role: 'toolResult', toolCallId: 'task-call', toolName: 'task', content: [], isError: false, timestamp: start + 3, details: { usage: childTurn.message.usage },
  } };
  const root = await transcript('root', [user('root-user', null, start), rootTurn, taskResult]);
  const child = await transcript('child', [user('child-user', null, start), childTurn], { rootSessionId: root.sessionId });
  const stats = await getUsageStats(query, [root, child]);
  expect(stats).toMatchObject({ sessions: 1, subagents: 1, prompts: 1, steps: 1, tokens: { input: 60, total: 72, reasoning: null } });
  expect(stats.cost).toBeCloseTo(0.32);
  expect(stats.models[0]?.steps).toBe(2);
  expect(stats.activity).toEqual([{ date: '2026-03-07', steps: 2 }]);
});

test('tool calls retain successful, failed, synthetic, interrupted, missing and after-window outcomes with null durations', async () => {
  const turn = assistant('tool-turn', null, start);
  if (turn.message.role !== 'assistant') throw new Error('fixture assistant expected');
  const names = ['read', 'bash', 'synthetic', 'interrupted', 'missing', 'late', 'recovered'];
  turn.message.content = names.map(name => ({ type: 'toolCall', id: `call-${name}`, name, arguments: {} }));
  const entries: SessionEntry[] = [turn];
  let parentId = turn.id;
  for (const [index, name] of names.entries()) {
    if (name === 'missing') continue;
    const time = name === 'late' ? end : start + index + 1;
    const result: SessionMessageEntry = { type: 'message', id: `result-${name}`, parentId, timestamp: new Date(time).toISOString(), message: {
      role: 'toolResult', toolCallId: `call-${name}`, toolName: name, isError: name !== 'read' && name !== 'late', timestamp: time,
      content: name === 'recovered' ? [{ type: 'text', text: 'Previous OMP process exited before this tool returned; its outcome is unknown.' }] : [],
      ...(name === 'synthetic' ? { details: { __synthetic: true, source: 'assistant_stop_aborted', executed: false } } : {}),
      ...(name === 'interrupted' ? { details: { __interrupted: true, source: 'interrupt_skipped', execution: 'started' } } : {}),
    } };
    entries.push(result); parentId = result.id;
  }
  const source = await transcript('tools', entries);
  const report = UsageToolsResponseSchema.parse(await getUsageTools(query, [source]));
  expect(report.totals).toEqual({ calls: 7, succeeded: 1, failed: 1, unfinished: 5 });
  expect(report.usage.every(row => row.durationP50 === null)).toBe(true);
  expect(report.usage.find(row => row.name === 'bash')).toMatchObject({ calls: 1, failed: 1 });
  expect(report.usage.find(row => row.name === 'synthetic')).toMatchObject({ calls: 1, unfinished: 1 });
  const later = await getUsageTools({ ...query, to: end + 1 }, [source]);
  expect(later.totals).toEqual({ calls: 7, succeeded: 2, failed: 1, unfinished: 4 });
});

test('tools on a shared fork entry count once and a distinct session collision still counts independently', async () => {
  const turn = assistant('shared-tool', null, start);
  if (turn.message.role !== 'assistant') throw new Error('fixture assistant expected');
  turn.message.content = [{ type: 'toolCall', id: 'same-call', name: 'read', arguments: {} }];
  const root = await transcript('tool-root', [turn]);
  const fork = await transcript('tool-fork', [turn], { parentSession: root.sessionFile });
  const unrelated = await transcript('tool-unrelated', [turn]);
  expect((await getUsageTools(query, [root, fork, unrelated])).totals).toEqual({ calls: 2, succeeded: 0, failed: 0, unfinished: 2 });
});

test('containment rejects an escaped registered file and symlink target without touching unauthorized transcript', async () => {
  const good = await transcript('contained', [assistant('ok', null, start)]);
  const outside = join(directory, 'outside.jsonl');
  const before = await readFile(good.sessionFile, 'utf8');
  await writeFile(outside, before);
  const escaped = { ...good, sessionId: 'escaped', rootSessionId: 'escaped', sessionFile: outside };
  const link = join(directory, 'sessions', 'link.jsonl');
  await symlink(outside, link);
  const linked = { ...escaped, sessionId: 'linked', rootSessionId: 'linked', sessionFile: link };
  const stats = await getUsageStats(query, [good, escaped, linked]);
  expect(stats).toMatchObject({ steps: 1, partial: true, errors: { escaped: 'USAGE_SESSION_UNREADABLE', linked: 'USAGE_SESSION_UNREADABLE' } });
  expect(await readFile(outside, 'utf8')).toBe(before);
});

test('accounting snapshot never resolves persisted image blob references or mutates the source', async () => {
  const prompt = user('image-user', null, start);
  if (prompt.message.role !== 'user') throw new Error('fixture user expected');
  prompt.message.content = [{ type: 'image', mimeType: 'image/png', data: `blob:sha256:${'a'.repeat(64)}` }];
  const source = await transcript('image', [prompt, assistant('image-turn', prompt.id, start + 1)]);
  const before = await readFile(source.sessionFile, 'utf8');
  expect((await getUsageStats(query, [source]))).toMatchObject({ prompts: 1, steps: 1, partial: false });
  expect((await getUsageTools(query, [source]))).toMatchObject({ totals: { calls: 0 }, partial: false });
  expect(await readFile(source.sessionFile, 'utf8')).toBe(before);
});

test('invalid semantic records, missing proven IDs, orphan and cyclic lineages cannot silently produce authoritative zeros', async () => {
  const good = await transcript('semantic-good', [assistant('good', null, start)]);
  const brokenUsage = await transcript('broken-usage', [assistant('broken', null, start)]);
  await writeFile(brokenUsage.sessionFile, (await readFile(brokenUsage.sessionFile, 'utf8')).replace('"input":10', '"input":"10"'));
  const orphan = await transcript('orphan', [assistant('orphan', 'not-present', start)]);
  const cycle = await transcript('cycle', [assistant('cycle', 'cycle', start)]);
  const legacy = await transcript('legacy', [assistant('legacy', null, start)]);
  await writeFile(legacy.sessionFile, (await readFile(legacy.sessionFile, 'utf8')).replace('"version":3', '"version":1'));
  const stats = await getUsageStats(query, [good, brokenUsage, orphan, cycle, legacy]);
  expect(stats).toMatchObject({ steps: 1, partial: true, errors: { 'broken-usage': 'USAGE_SESSION_CORRUPT', orphan: 'USAGE_SESSION_CORRUPT', cycle: 'USAGE_SESSION_CORRUPT', legacy: 'USAGE_SESSION_CORRUPT' } });
});

test('native auxiliary model_usage contributes actual provider usage and cost on the active lineage', async () => {
  const auxiliary: SessionEntry = { type: 'model_usage', id: 'auxiliary', parentId: null, timestamp: new Date(start).toISOString(), purpose: 'summary',
    api: 'openai-completions', provider: 'provider-aux', model: 'model-aux', stopReason: 'stop', usage: { input: 5, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 6,
      cost: { input: 0.01, output: 0.01, cacheRead: 0, cacheWrite: 0, total: 0.02 } } };
  const source = await transcript('auxiliary', [auxiliary]);
  expect((await getUsageStats(query, [source]))).toMatchObject({ steps: 1, cost: 0.02, tokens: { total: 6 }, models: [{ providerId: 'provider-aux', modelId: 'model-aux' }] });
});

test('all-time reports start at the earliest eligible authorized event and empty success has a bounded window', async () => {
  const source = await transcript('all-time', [user('all-user', null, start), assistant('all-turn', 'all-user', start + 1)]);
  const future = await transcript('future', [assistant('future', null, end + 1)]);
  const all: UsageQuery = { to: end, timezone: 'UTC' };
  expect((await getUsageStats(all, [source, future])).range).toEqual({ from: start, to: end });
  expect((await getUsageStats(all, [])).range).toEqual({ from: end - 1, to: end });
  expect((await getUsageStats({ ...all, from: start + 1 }, [source])).range).toEqual({ from: start + 1, to: end });
});

test('duplicate native IDs within one persisted transcript fail explicitly rather than overwrite accounting', async () => {
  const good = await transcript('duplicate-good', [assistant('good', null, start)]);
  const first = assistant('duplicate', null, start);
  const duplicate = await transcript('duplicate', [first, assistant('duplicate', null, start + 1, 999)]);
  expect(await getUsageStats(query, [good, duplicate])).toMatchObject({ steps: 1, partial: true, errors: { duplicate: 'USAGE_SESSION_CORRUPT' } });
});

test('exact registered paths without a storage directory cannot redirect through a symlink', async () => {
  const source = await transcript('exact', [assistant('exact', null, start)]);
  const exact: UsageSessionReference = { sessionId: source.sessionId, rootSessionId: source.rootSessionId, workspaceId: source.workspaceId, projectId: source.projectId,
    sessionFile: source.sessionFile, cwd: source.cwd, agentDirectory: source.agentDirectory };
  expect((await getUsageStats(query, [exact])).steps).toBe(1);
  const link = join(directory, 'redirect.jsonl');
  await symlink(source.sessionFile, link);
  const redirected = { ...exact, sessionId: 'redirected', rootSessionId: 'redirected', sessionFile: link };
  await expect(getUsageStats(query, [redirected])).rejects.toThrow('USAGE_UNAVAILABLE');
});

test('a registered path cannot redirect to an unregistered sibling inside the same storage directory', async () => {
  const good = await transcript('same-dir-good', [assistant('good-entry', null, start)]);
  const registered = await transcript('same-dir-registered', [assistant('registered-entry', null, start)]);
  const secret = await transcript('same-dir-secret', [assistant('secret-entry', null, start, 999_999)]);
  await rm(registered.sessionFile);
  await symlink(secret.sessionFile, registered.sessionFile);
  const stats = await getUsageStats(query, [good, registered]);
  expect(stats).toMatchObject({ steps: 1, tokens: { input: 10 }, partial: true, errors: { 'same-dir-registered': 'USAGE_SESSION_UNREADABLE' } });
  expect((await getUsageTools(query, [good, registered]))).toMatchObject({ partial: true, errors: stats.errors });
  await expect(getUsageStats(query, [registered])).rejects.toThrow('USAGE_UNAVAILABLE');
});

test('fork siblings deduplicate inherited tokens and tools when their shared native parent is absent, corrupt or unselected', async () => {
  const parent = await transcript('shared-parent', [], { projectId: 'parent-project' });
  const shared = assistant('shared-copied-turn', null, start);
  if (shared.message.role !== 'assistant') throw new Error('fixture assistant expected');
  shared.message.content = [{ type: 'toolCall', id: 'inherited-call', name: 'read', arguments: {} }];
  for (const [index, parentSession] of [parent.sessionFile, 'native-shared-parent'].entries()) {
    const first = await transcript(`detached-first-${index}`, [shared, assistant(`first-only-${index}`, shared.id, start + 1, 20)], { parentSession });
    const second = await transcript(`detached-second-${index}`, [shared, assistant(`second-only-${index}`, shared.id, start + 2, 30)], { parentSession });
    const unrelated = await transcript(`detached-unrelated-${index}`, [shared]);
    const healthy = await getUsageStats(query, [first, second, unrelated]);
    expect(healthy).toMatchObject({ steps: 4, tokens: { input: 70 }, partial: false });
    expect((await getUsageTools(query, [first, second, unrelated])).totals).toEqual({ calls: 2, succeeded: 0, failed: 0, unfinished: 2 });
    await rm(parent.sessionFile, { force: true });
    expect((await getUsageStats(query, [parent, first, second]))).toMatchObject({ steps: 3, tokens: { input: 60 }, partial: true, errors: { 'shared-parent': 'USAGE_SESSION_UNREADABLE' } });
    expect((await getUsageTools(query, [parent, first, second]))).toMatchObject({ totals: { calls: 1, unfinished: 1 }, partial: true });
    await writeFile(parent.sessionFile, '{corrupt parent}\n');
    expect((await getUsageStats(query, [parent, first, second]))).toMatchObject({ steps: 3, tokens: { input: 60 }, partial: true, errors: { 'shared-parent': 'USAGE_SESSION_CORRUPT' } });
    expect((await getUsageTools(query, [parent, first, second]))).toMatchObject({ totals: { calls: 1, unfinished: 1 }, partial: true });
    expect((await getUsageStats({ ...query, projectId: 'project-a' }, [parent, first, second]))).toMatchObject({ steps: 3, tokens: { input: 60 }, partial: false });
    expect((await getUsageTools({ ...query, projectId: 'project-a' }, [parent, first, second]))).toMatchObject({ totals: { calls: 1, unfinished: 1 }, partial: false });
  }
});
