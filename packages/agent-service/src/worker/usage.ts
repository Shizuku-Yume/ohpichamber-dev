import { realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { UsageQuerySchema, type UsageModel, type UsageQuery, type UsageStats, type UsageTokens, type UsageToolTotals, type UsageToolsResponse, type UsageToolUsage } from '@openchamber/agent-contract';
import type { SessionEntry, SessionHeader } from '@oh-my-pi/pi-coding-agent/session/session-entries';
import { loadSessionFile, normalizeAssistantUsage } from '@oh-my-pi/pi-coding-agent/session/session-loader';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { MemorySessionStorage } from '@oh-my-pi/pi-coding-agent/session/session-storage';
import type { UsageSessionReference } from '../protocol.ts';

const Count = z.number().int().nonnegative();
const Amount = z.number().finite().nonnegative();
const NativeUsage = z.object({ input: Count.optional(), output: Count.optional(), cacheRead: Count.optional(), cacheWrite: Count.optional(), totalTokens: Count.optional(),
  cost: z.object({ input: Amount.optional(), output: Amount.optional(), cacheRead: Amount.optional(), cacheWrite: Amount.optional(), total: Amount.optional() }).optional(),
  orchestration: z.object({ input: Count.optional(), output: Count.optional(), cacheRead: Count.optional() }).optional(),
}).passthrough();
const EntryIdentity = z.object({ type: z.string(), id: z.string().min(1), parentId: z.string().min(1).nullable(), timestamp: z.string().refine(value => Number.isFinite(Date.parse(value))) });
const Header = z.object({ type: z.literal('session'), id: z.string().min(1), version: z.number().int().min(2), timestamp: z.string(), cwd: z.string(), parentSession: z.string().optional() });
const MessageIdentity = z.object({ role: z.string(), timestamp: z.number().finite().nonnegative() });
const Assistant = MessageIdentity.extend({ role: z.literal('assistant'), provider: z.string().min(1), model: z.string().min(1), content: z.array(z.object({ type: z.string() }).passthrough()), usage: NativeUsage.optional() });
const ToolCall = z.object({ type: z.literal('toolCall'), id: z.string().min(1), name: z.string().min(1) });
const ToolResult = MessageIdentity.extend({ role: z.literal('toolResult'), toolCallId: z.string().min(1), toolName: z.string().min(1), isError: z.boolean() });
const Interrupted = z.object({ __synthetic: z.boolean().optional(), __interrupted: z.boolean().optional() });
class CorruptSession extends Error {}

type Source = { reference: UsageSessionReference; header: SessionHeader; branch: SessionEntry[] };
type Batch = { sources: Source[]; errors: Record<string, string>; families: Map<Source, string> };

/** Read only the authorized transcript. No ancestor paths, stats databases, or session directories are scanned. */
async function readSource(reference: UsageSessionReference, includeTools: boolean): Promise<Source> {
  const file = await realpath(reference.sessionFile);
  if (file !== resolve(reference.sessionFile)) throw new Error('USAGE_SESSION_UNCONTAINED');
  if (reference.sessionsDirectory !== undefined) {
    const directory = await realpath(reference.sessionsDirectory);
    const path = relative(directory, file);
    if (isAbsolute(path) || path === '..' || path.startsWith(`..${sep}`) || path === '') throw new Error('USAGE_SESSION_UNCONTAINED');
  }
  const loaded = await loadSessionFile(file, undefined, { throwIfMissing: true });
  if (loaded.malformedRecords > 0 || loaded.invalidHeader || loaded.sourceSize === null || loaded.entries.length === 0) throw new CorruptSession();
  const header = loaded.entries[0];
  if (!Header.safeParse(header).success || header?.type !== 'session') throw new CorruptSession();
  const entries: SessionEntry[] = [];
  for (let index = 1; index < loaded.entries.length; index++) {
    const entry = loaded.entries[index]!;
    if (entry.type === 'session' || !EntryIdentity.safeParse(entry).success) throw new CorruptSession();
    const base = { id: entry.id, parentId: entry.parentId, timestamp: entry.timestamp };
    if (entry.type === 'message') {
      if (!MessageIdentity.safeParse(entry.message).success) throw new CorruptSession();
      const message = entry.message;
      if (message.role === 'assistant') {
        if (!Assistant.safeParse(message).success) throw new CorruptSession();
        normalizeAssistantUsage(message);
        const content: Extract<typeof message.content[number], { type: 'toolCall' }>[] = [];
        if (includeTools) for (const block of message.content) if (block.type === 'toolCall') {
          if (!ToolCall.safeParse(block).success) throw new CorruptSession();
          content.push({ type: 'toolCall', id: block.id, name: block.name, arguments: {} });
        }
        entries.push({ ...base, type: 'message', message: { role: 'assistant', api: message.api, provider: message.provider,
          model: message.model, usage: message.usage, stopReason: message.stopReason, timestamp: message.timestamp, content } });
      } else if (message.role === 'user') {
        entries.push({ ...base, type: 'message', message: { role: 'user', content: '', synthetic: message.synthetic, timestamp: message.timestamp } });
      } else if (includeTools && message.role === 'toolResult') {
        if (!ToolResult.safeParse(message).success) throw new CorruptSession();
        const marker = Interrupted.safeParse(message.details);
        // Native recovery results predate the structured interruption discriminator.
        const recovery = message.content.some(block => block.type === 'text' && (block.text === 'The parent session may still be running this tool; its outcome is unknown.'
          || block.text === 'Previous OMP process exited before this tool returned; its outcome is unknown.'
          || block.text.startsWith('Tool was not executed because the run was aborted: ')));
        entries.push({ ...base, type: 'message', message: { role: 'toolResult', toolCallId: message.toolCallId, toolName: message.toolName,
          isError: message.isError, timestamp: message.timestamp, content: [], details: { __interrupted: recovery || (marker.success && (marker.data.__synthetic === true || marker.data.__interrupted === true)) } } });
      } else entries.push({ ...base, type: 'custom', customType: 'usage-lineage' });
    } else if (entry.type === 'model_usage') {
      if (!NativeUsage.safeParse(entry.usage).success || !entry.provider || !entry.model) throw new CorruptSession();
      const message: Extract<SessionEntry, { type: 'message' }>['message'] & { role: 'assistant' } = {
        role: 'assistant', api: entry.api, provider: entry.provider, model: entry.model, usage: entry.usage,
        stopReason: entry.stopReason, timestamp: Date.parse(entry.timestamp), content: [],
      };
      normalizeAssistantUsage(message);
      entries.push({ ...base, type: 'message', message });
    } else entries.push({ ...base, type: 'custom', customType: 'usage-lineage' });
  }
  const ids = new Map(entries.map(entry => [entry.id, entry]));
  if (ids.size !== entries.length) throw new CorruptSession();
  for (const entry of entries) if (entry.parentId !== null && !ids.has(entry.parentId)) throw new CorruptSession();
  // A reduced native snapshot avoids SessionManager's image/blob hydration and any writes to the persisted transcript.
  const storage = new MemorySessionStorage();
  storage.writeTextSync(file, [JSON.stringify({ type: 'session', id: header.id, timestamp: header.timestamp, version: 3, cwd: reference.cwd }), ...entries.map(entry => JSON.stringify(entry))].join('\n') + '\n');
  const manager = await SessionManager.open(file, dirname(file), storage, { initialCwd: reference.cwd, throwIfMissing: true, suppressBreadcrumb: true });
  const branch = manager.getBranch();
  if (branch.length > 0 && branch[0]?.parentId !== null) throw new CorruptSession();
  return { reference, header, branch };
}

async function readBatch(query: UsageQuery, references: readonly UsageSessionReference[], includeTools: boolean): Promise<Batch> {
  const sources: Source[] = [];
  const errors: Record<string, string> = Object.create(null);
  let candidates = 0;
  const files = new Set<string>();
  for (const reference of references) {
    if ((query.workspaceId !== undefined && reference.workspaceId !== query.workspaceId) || (query.projectId !== undefined && reference.projectId !== query.projectId)) continue;
    const file = resolve(reference.sessionFile);
    if (files.has(file)) continue;
    files.add(file);
    candidates++;
    try { sources.push(await readSource(reference, includeTools)); }
    catch (error) { errors[reference.sessionId] = error instanceof CorruptSession ? 'USAGE_SESSION_CORRUPT' : 'USAGE_SESSION_UNREADABLE'; }
  }
  if (candidates > 0 && sources.length === 0) throw new Error('USAGE_UNAVAILABLE');
  // Shared native parent identity proves fork lineage even when the ancestor is not readable or selected.
  // These tokens only link already-authorized sources; no header path is followed on disk.
  const byIdentity = new Map<string, Source>();
  for (const source of sources) { byIdentity.set(source.header.id, source); byIdentity.set(resolve(source.reference.sessionFile), source); }
  const byParent = new Map<string, Source>();
  const parents = new Map<Source, Source>();
  const representative = (source: Source): Source => {
    let current = source;
    while (parents.has(current)) current = parents.get(current)!;
    return current;
  };
  for (const source of sources) {
    const parentToken = source.header.parentSession;
    const parent = parentToken ? byIdentity.get(parentToken) ?? byParent.get(parentToken) : undefined;
    if (parentToken && !byParent.has(parentToken)) byParent.set(parentToken, source);
    const sameSession = byIdentity.get(source.header.id);
    for (const ancestor of [parent, sameSession]) if (ancestor) {
      const from = representative(source), to = representative(ancestor);
      if (from !== to) parents.set(from, to);
    }
  }
  const families = new Map(sources.map(source => [source, representative(source).reference.sessionId]));
  return { sources, errors, families };
}

function addTokens(target: UsageTokens, usage: Extract<SessionEntry, { type: 'message' }>['message'] & { role: 'assistant' }): void {
  target.input += usage.usage.input;
  target.output += usage.usage.output;
  target.cacheRead += usage.usage.cacheRead;
  target.cacheWrite += usage.usage.cacheWrite;
  target.total += usage.usage.totalTokens;
}
function dateKey(format: Intl.DateTimeFormat, timestamp: number): string {
  const parts = format.formatToParts(timestamp);
  return `${parts.find(part => part.type === 'year')!.value}-${parts.find(part => part.type === 'month')!.value}-${parts.find(part => part.type === 'day')!.value}`;
}

export async function getUsageStats(input: UsageQuery, references: readonly UsageSessionReference[]): Promise<UsageStats> {
  const query = UsageQuerySchema.parse(input);
  const batch = await readBatch(query, references, false);
  const partial = Object.keys(batch.errors).length > 0;
  const report: UsageStats = { range: { from: query.from ?? query.to - 1, to: query.to }, sessions: 0, subagents: 0, prompts: 0, steps: 0,
    tokens: { input: 0, output: 0, reasoning: null, cacheRead: 0, cacheWrite: 0, total: 0 }, cost: 0, tools: { mode: 'none' },
    activeDays: 0, streak: 0, activity: [], models: [], partial, ...(partial ? { errors: batch.errors } : {}) };
  const models = new Map<string, UsageModel>();
  const days = new Map<string, number>();
  const seen = new Set<string>();
  const format = new Intl.DateTimeFormat('en-US', { timeZone: query.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  for (const source of batch.sources) {
    const child = source.reference.sessionId !== source.reference.rootSessionId;
    let active = false;
    for (const entry of source.branch) {
      if (entry.type !== 'message' || entry.message.timestamp < (query.from ?? 0) || entry.message.timestamp >= query.to) continue;
      const message = entry.message;
      if (message.role !== 'assistant' && (message.role !== 'user' || message.synthetic)) continue;
      if (query.from === undefined) report.range.from = Math.min(report.range.from, message.timestamp);
      active = true;
      const identity = JSON.stringify([batch.families.get(source), entry.id]);
      if (seen.has(identity)) continue;
      seen.add(identity);
      if (message.role === 'user') { if (!child) report.prompts++; continue; }
      if (message.role !== 'assistant') continue;
      if (!child) report.steps++;
      addTokens(report.tokens, message);
      report.cost += message.usage.cost.total;
      const modelKey = JSON.stringify([message.provider, message.model]);
      let model = models.get(modelKey);
      if (!model) {
        model = { providerId: message.provider, modelId: message.model, variant: null, steps: 0,
          tokens: { input: 0, output: 0, reasoning: null, cacheRead: 0, cacheWrite: 0, total: 0 }, cost: 0 };
        models.set(modelKey, model);
      }
      model.steps++;
      addTokens(model.tokens, message);
      model.cost += message.usage.cost.total;
      const date = dateKey(format, message.timestamp);
      days.set(date, (days.get(date) ?? 0) + 1);
    }
    if (active) { if (child) report.subagents++; else report.sessions++; }
  }
  report.models = [...models.values()].sort((a, b) => b.tokens.total - a.tokens.total || a.providerId.localeCompare(b.providerId) || a.modelId.localeCompare(b.modelId));
  report.activity = [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, steps]) => ({ date, steps }));
  report.activeDays = days.size;
  let previous: number | undefined, streak = 0;
  for (const { date } of report.activity) {
    // Compare calendar ordinals, not elapsed local milliseconds (DST days need not be 24 hours).
    const ordinal = Date.parse(`${date}T00:00:00Z`) / 86_400_000;
    streak = previous !== undefined && ordinal === previous + 1 ? streak + 1 : 1;
    report.streak = Math.max(report.streak, streak);
    previous = ordinal;
  }
  return report;
}

export async function getUsageTools(input: UsageQuery, references: readonly UsageSessionReference[]): Promise<UsageToolsResponse> {
  const query = UsageQuerySchema.parse(input);
  const batch = await readBatch(query, references, true);
  const usage = new Map<string, UsageToolUsage>();
  const calls = new Map<string, { name: string; outcome: 'succeeded' | 'failed' | 'unfinished' }>();
  for (const source of batch.sources) {
    const pending = new Map<string, string>();
    for (const entry of source.branch) {
      if (entry.type !== 'message') continue;
      const message = entry.message;
      if (message.role === 'assistant') {
        for (const block of message.content) {
          if (block.type !== 'toolCall') continue;
          const identity = JSON.stringify([batch.families.get(source), entry.id, block.id]);
          pending.set(block.id, identity);
          if (message.timestamp >= (query.from ?? 0) && message.timestamp < query.to && !calls.has(identity)) calls.set(identity, { name: block.name, outcome: 'unfinished' });
        }
      } else if (message.role === 'toolResult' && message.timestamp < query.to) {
        const identity = pending.get(message.toolCallId);
        const call = identity && calls.get(identity);
        if (!call) continue;
        const marker = Interrupted.safeParse(message.details);
        if (marker.success && marker.data.__interrupted) continue;
        call.outcome = message.isError ? 'failed' : 'succeeded';
      }
    }
  }
  const totals: UsageToolTotals = { calls: 0, succeeded: 0, failed: 0, unfinished: 0 };
  for (const call of calls.values()) {
    let row = usage.get(call.name);
    if (!row) { row = { name: call.name, calls: 0, succeeded: 0, failed: 0, unfinished: 0, durationP50: null }; usage.set(call.name, row); }
    row.calls++; row[call.outcome]++;
    totals.calls++; totals[call.outcome]++;
  }
  const partial = Object.keys(batch.errors).length > 0;
  return { totals, usage: [...usage.values()].sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name)), partial, ...(partial ? { errors: batch.errors } : {}) };
}
