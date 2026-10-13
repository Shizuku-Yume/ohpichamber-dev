import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { Message } from '@openchamber/agent-contract';
import { resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { SessionJournal } from '../projection/journal.ts';
import { WorkerProjection } from './projection.ts';
import { WorkerSession } from './session.ts';

beforeEach(resetSettingsForTest);
afterEach(resetSettingsForTest);

const stableUserMessages = (messages: Message[]) => messages.map(({ messageId, sessionId, turnId, role, parts }) => ({ messageId, sessionId, turnId, role, parts }));

test('native skill submission and catalog descriptions hide roots, and failed discovery emits no success', async () => {
  const root = await mkdtemp(join(tmpdir(), 'session-skills-'));
  const home = process.env.HOME;
  process.env.HOME = root;
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  const directory = join(cwd, '.omp', 'skills', 'privacy-proof');
  const file = join(directory, 'SKILL.md');
  const privateRoots = [file, directory, cwd, agentDirectory];
  const rootsText = privateRoots.join(' | ');
  let worker: WorkerSession | undefined;
  let reopened: SessionManager | undefined;
  let journal: SessionJournal | undefined;
  let fatal = false;
  const terminal = Promise.withResolvers<void>();
  const catalogEvents: string[] = [];
  const submitted: string[] = [];
  const provider = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    const textContent = z.union([
      z.string().transform(text => [text]),
      z.array(z.object({ type: z.literal('text'), text: z.string() })).transform(parts => parts.map(part => part.text)),
    ]);
    const payload = z.object({ messages: z.array(z.object({ role: z.string(), content: textContent })) }).parse(await request.json());
    submitted.push(...payload.messages.filter(message => message.role === 'user').flatMap(message => message.content));
    const chunk = { id: 'skill-response', object: 'chat.completion.chunk', created: 1, model: 'skill-model',
      choices: [{ index: 0, delta: { role: 'assistant', content: 'Skill received.' }, finish_reason: null }] };
    const finish = { ...chunk, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 } };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(finish)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  } });
  try {
    await mkdir(directory, { recursive: true });
    await mkdir(agentDirectory, { recursive: true });
    await writeFile(file, `---\nname: privacy-proof\ndescription: "Useful description ${rootsText}"\n---\nSKILL_BODY_MARKER ${rootsText}\n`);
    worker = await WorkerSession.open({ type: 'bootstrap', rootSessionId: 'skill-root', workerGeneration: 'generation',
      projectId: 'project', workspaceId: 'workspace', agentDirectoryId: 'agent-source', cwd, agentDirectory,
      sessionsDirectory: join(root, 'sessions'), skillSources: { workspace: '0', agent: '0' } }, inputs => {
      journal?.append(inputs);
      for (const input of inputs) {
        if (input.event.type === 'catalog.updated' && input.event.catalog.kind === 'skills') catalogEvents.push(JSON.stringify(input.event.catalog.state));
        if (input.event.type === 'run.failed' || input.event.type === 'run.completed') terminal.resolve();
      }
    }, () => { throw new Error('This skill must not ask for interaction'); }, () => { fatal = true; }, async () => {}, async () => { throw new Error('This skill must not invoke Host actions'); }, () => {});
    journal = new SessionJournal({ sessionId: 'skill-root', rootSessionId: 'skill-root', projectId: 'project', workspaceId: 'workspace', displayPath: '.' }, worker.seed());
    await worker.operation({ type: 'catalog', revision: '1', operation: { type: 'catalog.provider.configure', request: {
      expectedRevision: '0', configuration: { providerId: 'skill-fixture', name: 'Skill fixture', endpoint: `http://127.0.0.1:${provider.port}/v1`, protocol: 'chat-completions', credentialRef: null },
    } } });
    await worker.operation({ type: 'catalog', revision: '2', operation: { type: 'catalog.model.configure', request: {
      expectedRevision: '1', model: { modelId: 'skill-model', provider: 'skill-fixture', name: 'Skill model', modalities: ['text'],
        contextWindow: 65536, maxOutputTokens: 128, reasoningEffortSupported: false, reasoningOptions: [], variants: [], toolsSupported: true, enabled: true, pricing: null },
    } } });
    const sources = { workspace: '1', agent: '0' };
    const applied = await worker.operation({ type: 'catalog', revision: '2', operation: { type: 'skills.apply', sources, catalogRevision: '2', request: { scope: 'workspace', sourceRevision: '1' } } });
    expect(applied.type === 'catalog' && applied.result.type === 'skills.applied' && applied.result.result.outcome).toBe('applied');
    expect(catalogEvents).toHaveLength(1);
    const read = await worker.operation({ type: 'catalog', revision: '2', operation: { type: 'skills.read', persistedSources: sources } });
    if (read.type !== 'catalog' || read.result.type !== 'skills.catalog') throw new Error('Skill catalog was not returned');
    const good = read.result.catalog;
    expect(good.skills.find(skill => skill.skillId === 'privacy-proof')?.description).toBe('Useful description [skill-root] | [skill-root] | [skill-root] | [skill-root]');
    for (const privateRoot of privateRoots) {
      expect(JSON.stringify(good)).not.toContain(privateRoot);
      expect(catalogEvents[0]).not.toContain(privateRoot);
    }
    await worker.operation({ type: 'prompt', runId: 'skill-run', request: {
      input: { text: '/skill:privacy-proof SKILL_ARGUMENT_MARKER', context: [], attachments: [] },
      options: { providerId: 'skill-fixture', modelId: 'skill-model', agentId: null, variant: null, reasoningEffort: null },
    } });
    await terminal.promise;
    await worker.session.settleInFlightMessagePersistence();
    await worker.session.sessionManager.flush();
    const history = await worker.operation({ type: 'history', request: { sessionId: 'skill-root' } });
    if (history.type !== 'history') throw new Error('Skill history was not returned');
    const liveUser = journal.snapshot().messages.filter(message => message.role === 'user');
    const historyUser = history.history.messages.filter(message => message.role === 'user');
    expect(liveUser).toHaveLength(1);
    expect(stableUserMessages(historyUser)).toEqual(stableUserMessages(liveUser));
    const entrySchema = z.object({ type: z.string(), message: z.object({ role: z.string(), content: z.unknown() }).optional() });
    const transcriptUsers = (await readFile(worker.sessionFile, 'utf8')).split('\n').filter(Boolean)
      .map(line => entrySchema.parse(JSON.parse(line))).filter(entry => entry.type === 'message' && entry.message?.role === 'user');
    // Inspect the complete skill block, without stripping unrelated SDK request context.
    const submittedSkills = submitted.filter(text => text.includes('SKILL_BODY_MARKER'));
    expect(submittedSkills).toHaveLength(1);
    const submittedSkill = submittedSkills[0]!;
    for (const projection of [submittedSkill, JSON.stringify(liveUser), JSON.stringify(historyUser), JSON.stringify(transcriptUsers)]) {
      expect(projection).toContain('skill://privacy-proof');
      expect(projection).toContain('SKILL_BODY_MARKER');
      expect(projection).toContain('SKILL_ARGUMENT_MARKER');
      expect(projection).toContain('[skill-root]');
      for (const privateRoot of privateRoots) expect(projection).not.toContain(privateRoot);
    }
    // EISDIR remains a real read failure when the suite runs with elevated permissions.
    await mkdir(join(cwd, '.github', 'skills', 'unreadable', 'SKILL.md'), { recursive: true });
    const newer = { workspace: '2', agent: '0' };
    const failed = await worker.operation({ type: 'catalog', revision: '2', operation: { type: 'skills.apply', sources: newer, catalogRevision: '3', request: { scope: 'workspace', sourceRevision: '2' } } });
    expect(failed.type === 'catalog' && failed.result.type === 'skills.applied' && failed.result.result.outcome).toBe('failed');
    expect(catalogEvents).toHaveLength(1);
    const retained = await worker.operation({ type: 'catalog', revision: '2', operation: { type: 'skills.read', persistedSources: newer } });
    if (retained.type !== 'catalog' || retained.result.type !== 'skills.catalog') throw new Error('Retained skill catalog was not returned');
    expect(retained.result.catalog).toEqual({ ...good, persistedSources: newer });
    const sessionFile = worker.sessionFile;
    await worker.close();
    worker = undefined;
    reopened = await SessionManager.open(sessionFile, join(root, 'sessions'), undefined, { initialCwd: cwd, throwIfMissing: true });
    expect(stableUserMessages(new WorkerProjection(reopened, 'skill-root').seed().messages.filter(message => message.role === 'user'))).toEqual(stableUserMessages(historyUser));
    expect(fatal).toBe(false);
  } finally {
    await reopened?.close();
    await worker?.close();
    provider.stop(true);
    if (home === undefined) delete process.env.HOME; else process.env.HOME = home;
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
