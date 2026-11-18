import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import {
  UsageAccountsSchema, UsageQuerySchema, type UsageAccounts, type UsageAuthHistoryEntry, type UsageAuthLimit,
  type UsageAuthReport, type UsageModel, type UsagePricing, type UsageProvider, type UsageQuery, type UsageQueryResult,
  type UsageStats, type UsageToolTotals, type UsageToolsResponse, type UsageToolUsage,
} from '@openchamber/agent-contract';
import type { SessionEntry, SessionHeader } from '@oh-my-pi/pi-coding-agent/session/session-entries';
import { loadSessionFile, normalizeAssistantUsage } from '@oh-my-pi/pi-coding-agent/session/session-loader';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { MemorySessionStorage } from '@oh-my-pi/pi-coding-agent/session/session-storage';
import type { AuthStorage } from '@oh-my-pi/pi-coding-agent/session/auth-storage';
import { ModelRegistry } from '@oh-my-pi/pi-coding-agent/config/model-registry';
import { discoverAuthStorage } from '@oh-my-pi/pi-coding-agent/sdk';
import type { AssistantMessage, UsageHistoryEntry, UsageLimit, UsageReport } from '@oh-my-pi/pi-ai';
import { getAgentDir, getProjectDir } from '@oh-my-pi/pi-utils';
import type { UsageScopeFile, UsageSessionReference } from '../protocol.ts';
import { initDb } from '@oh-my-pi/omp-stats/db';
import { syncAllSessions } from '@oh-my-pi/omp-stats';
import { getModelPricingStatus } from '@oh-my-pi/pi-catalog';

const Count = z.number().int().nonnegative();
const Amount = z.number().finite().nonnegative();
const NativeUsage = z.object({
  input: Count.optional(), output: Count.optional(), cacheRead: Count.optional(), cacheWrite: Count.optional(),
  totalTokens: Count.optional(), reasoningTokens: Count.optional(),
  cost: z.object({ input: Amount.optional(), output: Amount.optional(), cacheRead: Amount.optional(), cacheWrite: Amount.optional(), total: Amount.optional() }).optional(),
  orchestration: z.object({ input: Count.optional(), output: Count.optional(), cacheRead: Count.optional() }).optional(),
}).passthrough();
const ReasoningUsage = z.object({ reasoningTokens: Count.optional() }).passthrough();
const EntryIdentity = z.object({ type: z.string(), id: z.string().min(1), parentId: z.string().min(1).nullable(), timestamp: z.string().refine(value => Number.isFinite(Date.parse(value))) });
const Header = z.object({ type: z.literal('session'), id: z.string().min(1), version: z.number().int().min(2), timestamp: z.string(), cwd: z.string(), parentSession: z.string().optional() });
const MessageIdentity = z.object({ role: z.string(), timestamp: z.number().finite().nonnegative() });
const Assistant = MessageIdentity.extend({
  role: z.literal('assistant'), provider: z.string().min(1), model: z.string().min(1),
  content: z.array(z.object({ type: z.string() }).passthrough()), usage: NativeUsage.optional(),
  duration: z.number().nullable().optional(), ttft: z.number().nullable().optional(),
});
const ToolCall = z.object({ type: z.literal('toolCall'), id: z.string().min(1), name: z.string().min(1) });
const ToolResult = MessageIdentity.extend({ role: z.literal('toolResult'), toolCallId: z.string().min(1), toolName: z.string().min(1), isError: z.boolean() });
const Interrupted = z.object({ __synthetic: z.boolean().optional(), __interrupted: z.boolean().optional() });
class CorruptSession extends Error { }

type Source = { reference: UsageSessionReference; header: SessionHeader; branch: SessionEntry[] };
type Batch = { sources: Source[]; errors: Record<string, string>; families: Map<Source, string> };

/**
 * Validated transcripts for the tool report, keyed by file.
 *
 * Tool outcomes are scoped to the authorized references the Host admitted, and
 * an outcome's arrival time decides whether it falls inside `[from, to)`. Neither
 * fact is stored in OMP's `stats.db` (its `tool_calls` table records only a call
 * time), so the tool report stays a projection of the validated native branch.
 * A warm reference costs one `stat` and no JSONL parse.
 */
const validatedSources = new Map<string, { size: number; mtimeMs: number; tools: boolean; source: Source }>();

/** Read only the authorized transcript. No ancestor paths, stats databases, or session directories are scanned. */
async function readSource(reference: UsageSessionReference, includeTools: boolean): Promise<Source> {
  const file = await realpath(reference.sessionFile);
  // Containment below must run on every call: a symlink swapped in after a
  // cached read would otherwise be trusted.

  if (file !== resolve(reference.sessionFile)) throw new Error('USAGE_SESSION_UNCONTAINED');
  if (reference.sessionsDirectory !== undefined) {
    const directory = await realpath(reference.sessionsDirectory);
    const path = relative(directory, file);
    if (isAbsolute(path) || path === '..' || path.startsWith(`..${sep}`) || path === '') throw new Error('USAGE_SESSION_UNCONTAINED');
  }
  // Reuse a validated read while the file is byte-identical, so the steady
  // state never re-parses the JSONL on a subsequent request.
  const cached = validatedSources.get(file);
  if (cached !== undefined) {
    const info = await stat(file).catch(() => null);
    if (info && info.size === cached.size && info.mtimeMs === cached.mtimeMs && (cached.tools || !includeTools)) {
      return { ...cached.source, reference };
    }
    validatedSources.delete(file);
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
        const parsedAssistant = Assistant.safeParse(message);
        if (!parsedAssistant.success) throw new CorruptSession();
        normalizeAssistantUsage(message);
        const content: Extract<typeof message.content[number], { type: 'toolCall' }>[] = [];
        if (includeTools) for (const block of message.content) if (block.type === 'toolCall') {
          if (!ToolCall.safeParse(block).success) throw new CorruptSession();
          content.push({ type: 'toolCall', id: block.id, name: block.name, arguments: {} });
        }
        const messageData: AssistantMessage = {
          role: 'assistant',
          api: message.api,
          provider: message.provider,
          model: message.model,
          usage: message.usage,
          stopReason: message.stopReason,
          timestamp: message.timestamp,
          content,
        };
        if (parsedAssistant.data.duration !== null && parsedAssistant.data.duration !== undefined) {
          messageData.duration = parsedAssistant.data.duration;
        }
        if (parsedAssistant.data.ttft !== null && parsedAssistant.data.ttft !== undefined) {
          messageData.ttft = parsedAssistant.data.ttft;
        }
        entries.push({ ...base, type: 'message', message: messageData });
      } else if (message.role === 'user') {
        entries.push({ ...base, type: 'message', message: { role: 'user', content: '', synthetic: message.synthetic, timestamp: message.timestamp } });
      } else if (includeTools && message.role === 'toolResult') {
        if (!ToolResult.safeParse(message).success) throw new CorruptSession();
        const marker = Interrupted.safeParse(message.details);
        // Native recovery results predate the structured interruption discriminator.
        const recovery = message.content.some(block => block.type === 'text' && (block.text === 'The parent session may still be running this tool; its outcome is unknown.'
          || block.text === 'Previous OMP process exited before this tool returned; its outcome is unknown.'
          || block.text.startsWith('Tool was not executed because the run was aborted: ')));
        entries.push({
          ...base, type: 'message', message: {
            role: 'toolResult', toolCallId: message.toolCallId, toolName: message.toolName,
            isError: message.isError, timestamp: message.timestamp, content: [], details: { __interrupted: recovery || (marker.success && (marker.data.__synthetic === true || marker.data.__interrupted === true)) }
          }
        });
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
  try {
    const branch = manager.getBranch();
    if (branch.length > 0 && branch[0]?.parentId !== null) throw new CorruptSession();
    const info = await stat(file).catch(() => null);
    if (info) validatedSources.set(file, { size: info.size, mtimeMs: info.mtimeMs, tools: includeTools, source: { reference, header, branch } });
    return { reference, header, branch };
  } finally {
    await manager.close();
  }
}

async function readBatch(query: UsageQueryResult, references: readonly UsageSessionReference[], includeTools: boolean): Promise<Batch> {
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

function dateKey(format: Intl.DateTimeFormat, timestamp: number): string {
  const parts = format.formatToParts(timestamp);
  return `${parts.find(part => part.type === 'year')!.value}-${parts.find(part => part.type === 'month')!.value}-${parts.find(part => part.type === 'day')!.value}`;
}

/**
 * Settle one native transcript into `@oh-my-pi/omp-stats`' SQLite index
 * (`stats.db`). Turn settlement calls this, so the analytics database follows
 * live work incrementally instead of being rebuilt by a raw JSONL rescan.
 *
 * The tool report still projects the validated native branch (see
 * `getUsageTools`): the stats parser indexes every persisted entry and has no
 * notion of the Host's authorized reference set or an abandoned branch.
 */
export async function settleUsageSession(sessionFile: string): Promise<void> {
  await initDb();
  // One worker: the settlement runs inside the session worker process, where a
  // Bun worker pool would cost more than the tail read it replaces.
  await syncAllSessions({ files: [resolve(sessionFile)], workers: 1 });
}

/** OMP's configured model registry and credential store for the default agent directory, where TUI sessions write. */
interface UsageRuntime { readonly authStorage: AuthStorage; readonly modelRegistry: ModelRegistry }

/**
 * Open per request, so an edit to `models.yml` prices the next report. The caller
 * closes `authStorage`. Opening reads configuration and credentials; it sends no request.
 */
async function openUsageRuntime(): Promise<UsageRuntime> {
  const agentDirectory = getAgentDir();
  const authStorage = await discoverAuthStorage(agentDirectory, { cwd: getProjectDir() });
  try {
    const modelRegistry = new ModelRegistry(authStorage, join(agentDirectory, 'models.yml'));
    await modelRegistry.refresh('offline');
    return { authStorage, modelRegistry };
  } catch (error) {
    authStorage.close();
    throw error;
  }
}

/** Unknown pricing is `null`, never zero: unpriced requests, unpriced providers and models with no configured rates. */
function resolvePricing(registry: ModelRegistry, provider: string, model: string, unpriced: number): UsagePricing | null {
  if (unpriced > 0 || provider === 'xai-oauth') return null;
  const configured = registry.find(provider, model);
  if (!configured) return null;
  const status = getModelPricingStatus(configured);
  const c = configured.cost;
  const hasRates = c.input >= 0 && c.output >= 0 && c.cacheRead >= 0 && c.cacheWrite >= 0 && (status === 'fixed' || status === 'free');
  if (!hasRates) return null;
  return {
    inputPerMillionTokens: c.input,
    outputPerMillionTokens: c.output,
    cacheReadPerMillionTokens: c.cacheRead,
    cacheWritePerMillionTokens: c.cacheWrite,
  };
}

type Binding = string | number;
interface WindowFilter { where: string; params: Binding[] }

/**
 * The window and scope of one aggregate. `scopeFiles` undefined means no
 * project scope; a list is the exact set the Host authorized, so a sessions
 * folder shared with another workspace cannot leak its transcripts into this
 * report.
 */
function windowFilter(query: UsageQueryResult, scopeFiles: readonly UsageScopeFile[] | undefined, role: 'root' | 'subagent' | 'any' = 'any'): WindowFilter {
  const clauses = ['timestamp < ?'];
  const params: Binding[] = [query.to];
  if (query.from !== undefined) { clauses.push('timestamp >= ?'); params.push(query.from); }
  if (query.providerId !== undefined) { clauses.push('provider = ?'); params.push(query.providerId); }
  if (scopeFiles !== undefined) {
    const scoped = role === 'any' ? scopeFiles : scopeFiles.filter(entry => entry.role === role);
    if (scoped.length === 0) clauses.push('0');
    else {
      clauses.push(`session_file IN (${scoped.map(() => '?').join(', ')})`);
      params.push(...scoped.map(entry => resolve(entry.file)));
    }
  }
  return { where: `WHERE ${clauses.join(' AND ')}`, params };
}

const ModelRow = z.object({
  provider: z.string(), model: z.string(), steps: Count, failed: Count,
  input_tokens: Count, output_tokens: Count, cache_read_tokens: Count, cache_write_tokens: Count, total_tokens: Count,
  cost_total: Amount, unpriced: Count, ttft_sum: Amount, ttft_count: Count, timed_output_tokens: Count, duration_sum: Amount,
});
const SummaryRow = z.object({ sessions: Count, subagents: Count });
const RequestRow = z.object({
  session_file: z.string().min(1), entry_id: z.string().min(1), provider: z.string(), model: z.string(), timestamp: Count,
});

/**
 * Additive totals of one or more (provider, model) groups. TTFT and tokens per
 * second are kept as sums and counts, so a provider's average weights every
 * request equally rather than averaging its models' averages.
 */
interface Sample {
  steps: number; failed: number; input: number; output: number; cacheRead: number; cacheWrite: number; total: number;
  cost: number; unpriced: number; ttftSum: number; ttftCount: number; timedOutput: number; durationSum: number;
  reasoning: number | null;
}
const EMPTY_SAMPLE: Sample = {
  steps: 0, failed: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: 0, unpriced: 0,
  ttftSum: 0, ttftCount: 0, timedOutput: 0, durationSum: 0, reasoning: null,
};
function combine(samples: readonly Sample[]): Sample {
  return samples.reduce<Sample>((sum, sample) => ({
    steps: sum.steps + sample.steps, failed: sum.failed + sample.failed, input: sum.input + sample.input,
    output: sum.output + sample.output, cacheRead: sum.cacheRead + sample.cacheRead, cacheWrite: sum.cacheWrite + sample.cacheWrite,
    total: sum.total + sample.total, cost: sum.cost + sample.cost, unpriced: sum.unpriced + sample.unpriced,
    ttftSum: sum.ttftSum + sample.ttftSum, ttftCount: sum.ttftCount + sample.ttftCount,
    timedOutput: sum.timedOutput + sample.timedOutput, durationSum: sum.durationSum + sample.durationSum,
    reasoning: sample.reasoning === null ? sum.reasoning : (sum.reasoning ?? 0) + sample.reasoning,
  }), EMPTY_SAMPLE);
}
const averageTtft = (sample: Sample): number | null => (sample.ttftCount > 0 ? sample.ttftSum / sample.ttftCount : null);
const tokensPerSecond = (sample: Sample): number | null => (sample.durationSum > 0 ? (sample.timedOutput * 1000) / sample.durationSum : null);
const errorRate = (sample: Sample): number => (sample.steps > 0 ? sample.failed / sample.steps : 0);
const tokensOf = (sample: Sample) => ({
  input: sample.input, output: sample.output, reasoning: sample.reasoning, cacheRead: sample.cacheRead, cacheWrite: sample.cacheWrite, total: sample.total,
});

/** One persisted line's reasoning tokens. OMP's `output` already includes them, so callers never add them again. */
const ReasoningLine = z.object({
  id: z.string().min(1), type: z.string(),
  usage: ReasoningUsage.optional(),
  message: z.object({ role: z.string(), usage: ReasoningUsage.optional() }).passthrough().optional(),
}).passthrough();

/**
 * Reasoning per (provider, model) for the requests in the window. `stats.db` does
 * not store reasoning, so each request's transcript entry supplies it. Assistant
 * turns and `model_usage` auxiliary calls both carry it. The join is by
 * (session file, entry id), so a request is counted once even when a fork copies its parent's entries.
 */
async function readReasoning(requests: readonly z.infer<typeof RequestRow>[]): Promise<{ byModel: Map<string, number>; errors: Record<string, string> }> {
  const byFile = new Map<string, z.infer<typeof RequestRow>[]>();
  for (const request of requests) {
    const group = byFile.get(request.session_file);
    if (group) group.push(request); else byFile.set(request.session_file, [request]);
  }
  const byModel = new Map<string, number>();
  const errors: Record<string, string> = Object.create(null);
  for (const [file, group] of byFile) {
    let reasoningByEntry: Map<string, number>;
    try {
      reasoningByEntry = new Map();
      for (const line of (await readFile(file, 'utf8')).split('\n')) {
        if (!line.trim()) continue;
        let json: unknown;
        try { json = JSON.parse(line); } catch { continue; }
        const entry = ReasoningLine.safeParse(json);
        if (!entry.success) continue;
        const tokens = entry.data.type === 'model_usage' ? entry.data.usage?.reasoningTokens
          : entry.data.message?.role === 'assistant' ? entry.data.message.usage?.reasoningTokens : undefined;
        if (tokens !== undefined) reasoningByEntry.set(entry.data.id, tokens);
      }
    } catch {
      errors[basename(file, '.jsonl') || 'session'] = 'USAGE_SESSION_UNREADABLE';
      continue;
    }
    for (const request of group) {
      const tokens = reasoningByEntry.get(request.entry_id);
      if (tokens === undefined) continue;
      const key = JSON.stringify([request.provider, request.model]);
      byModel.set(key, (byModel.get(key) ?? 0) + tokens);
    }
  }
  return { byModel, errors };
}

/**
 * Validate every authorized transcript, keyed by session identity. The sync
 * ingests what it can parse, so this is what tells a viewer that a session it
 * asked about could not be read — never an empty success.
 */
async function validateScopeFiles(scopeFiles: readonly UsageScopeFile[]): Promise<Record<string, string>> {
  const errors: Record<string, string> = Object.create(null);
  for (const entry of scopeFiles) {
    try {
      const loaded = await loadSessionFile(entry.file, undefined, { throwIfMissing: true });
      if (loaded.malformedRecords > 0 || loaded.invalidHeader || loaded.sourceSize === null || loaded.entries.length === 0
        || !Header.safeParse(loaded.entries[0]).success) throw new CorruptSession();
    } catch (error) {
      errors[entry.sessionId] = error instanceof CorruptSession ? 'USAGE_SESSION_CORRUPT' : 'USAGE_SESSION_UNREADABLE';
    }
  }
  return errors;
}

export interface UsageAccountsResult {
  accounts: UsageAccounts;
  /** Sources that could not be read, keyed by a source name. Their absence from `accounts` is never an empty success. */
  errors: Record<string, string>;
}

/**
 * Stats for every OMP session in the default agent directory, including TUI
 * sessions. Runs OMP's incremental sync first, so transcripts that were never
 * settled by a turn are counted. Every aggregate reads `stats.db` with the same
 * window and scope. A failed database read or sync throws; it is never reported
 * as an empty result.
 *
 * `sessionFiles` undefined means no project scope. A list is the resolved project
 * scope: the exact transcripts of the Host-authorized roots and their subagents
 * in the workspaces or projects the viewer selected.
 */
export async function getUsageStats(input: UsageQuery, scopeFiles?: readonly UsageScopeFile[]): Promise<UsageStats> {
  const query = UsageQuerySchema.parse(input);
  // The sync follows the report's scope. OMP's own sync walks only its default
  // sessions folder, and a project's transcripts live under that workspace's
  // agent directory — a worktree, an imported project, an isolated data
  // directory — which nothing else ever ingests. Reading the database after an
  // unscoped sync reported zero for sessions that plainly exist.
  await syncAllSessions(scopeFiles === undefined ? undefined : { files: scopeFiles.map(entry => entry.file), workers: 1 });
  const db = await initDb();
  const runtime = await openUsageRuntime();
  try {
    const filter = windowFilter(query, scopeFiles);
    const modelRows = z.array(ModelRow).parse(db.query(`
      SELECT provider, model,
        COUNT(*) AS steps,
        SUM(CASE WHEN stop_reason = 'error' OR error_message IS NOT NULL THEN 1 ELSE 0 END) AS failed,
        SUM(input_tokens) AS input_tokens,
        SUM(output_tokens) AS output_tokens,
        SUM(cache_read_tokens) AS cache_read_tokens,
        SUM(cache_write_tokens) AS cache_write_tokens,
        SUM(total_tokens) AS total_tokens,
        TOTAL(cost_total) AS cost_total,
        SUM(cost_unpriced) AS unpriced,
        TOTAL(ttft) AS ttft_sum,
        COUNT(ttft) AS ttft_count,
        SUM(CASE WHEN duration IS NOT NULL THEN output_tokens ELSE 0 END) AS timed_output_tokens,
        TOTAL(duration) AS duration_sum
      FROM messages ${filter.where}
      GROUP BY provider, model
    `).all(...filter.params));
    // The Host already said which of its authorized files are subagent
    // transcripts. OMP's own `agent_type` is a path-depth guess, and a subagent
    // written beside its root in the same folder reads as a main session there,
    // so a scoped report counts by the authoritative role instead. The unscoped
    // form keeps OMP's classification, which is all it has.
    const scopeRoles = scopeFiles === undefined
      ? undefined
      : new Map(scopeFiles.map(entry => [resolve(entry.file), entry.role]));
    const summary = scopeRoles === undefined
      ? SummaryRow.parse(db.query(`
        SELECT COUNT(DISTINCT session_file) AS sessions,
          COALESCE(SUM(CASE WHEN agent_type = 'subagent' THEN 1 ELSE 0 END), 0) AS subagents
        FROM messages ${filter.where}
      `).get(...filter.params))
      : (() => {
        const present = z.array(z.object({ session_file: z.string().min(1) })).parse(db.query(`
          SELECT DISTINCT session_file FROM messages ${filter.where}
        `).all(...filter.params));
        let sessions = 0; let subagents = 0;
        for (const { session_file } of present) {
          if (scopeRoles.get(resolve(session_file)) === 'subagent') subagents += 1; else sessions += 1;
        }
        return { sessions, subagents };
      })();
    // Turn-level counts describe what the user did; usage totals also include
    // the subagent work those turns spawned. OMP's own report keeps the same
    // split, so `steps`/`prompts`/`activity` count main-session turns while
    // tokens, cost and per-model usage cover the whole authorized scope.
    const turnFilter = windowFilter(query, scopeFiles, 'root');
    const requests = z.array(RequestRow).parse(db.query(`
      SELECT session_file, entry_id, provider, model, timestamp FROM messages ${turnFilter.where}
    `).all(...turnFilter.params));
    const prompts = z.object({ prompts: Count }).parse(db.query(`
      SELECT COUNT(*) AS prompts FROM user_messages ${turnFilter.where}
    `).get(...turnFilter.params));
    const reasoning = await readReasoning(
      z.array(RequestRow).parse(db.query(`
        SELECT session_file, entry_id, provider, model, timestamp FROM messages ${filter.where}
      `).all(...filter.params)));

    const samples = new Map<string, Sample>();
    const modelsByProvider = new Map<string, Sample[]>();
    const models: UsageModel[] = [];
    for (const row of modelRows) {
      const key = JSON.stringify([row.provider, row.model]);
      const sample: Sample = {
        steps: row.steps, failed: row.failed, input: row.input_tokens, output: row.output_tokens,
        cacheRead: row.cache_read_tokens, cacheWrite: row.cache_write_tokens, total: row.total_tokens, cost: row.cost_total,
        unpriced: row.unpriced, ttftSum: row.ttft_sum, ttftCount: row.ttft_count,
        timedOutput: row.timed_output_tokens, durationSum: row.duration_sum, reasoning: reasoning.byModel.get(key) ?? null,
      };
      samples.set(key, sample);
      const siblings = modelsByProvider.get(row.provider) ?? [];
      siblings.push(sample);
      modelsByProvider.set(row.provider, siblings);
      models.push({
        providerId: row.provider, modelId: row.model, variant: null, steps: sample.steps, tokens: tokensOf(sample), cost: sample.cost,
        pricing: sample.unpriced > 0 ? null : resolvePricing(runtime.modelRegistry, row.provider, row.model, 0),
        avgTtft: averageTtft(sample), avgTokensPerSecond: tokensPerSecond(sample), errorRate: errorRate(sample),
      });
    }
    models.sort((a, b) => b.tokens.total - a.tokens.total || a.providerId.localeCompare(b.providerId) || a.modelId.localeCompare(b.modelId));

    const providers: UsageProvider[] = [...modelsByProvider].map(([providerId, siblings]) => {
      const sample = combine(siblings);
      const providerModels = models.filter(model => model.providerId === providerId);
      const allPriced = providerModels.length > 0 && providerModels.every(model => model.pricing !== null);
      return {
        providerId, steps: sample.steps, failedRequests: sample.failed, errorRate: errorRate(sample), tokens: tokensOf(sample),
        cost: sample.cost, pricing: allPriced ? providerModels[0]!.pricing : null,
        avgTtft: averageTtft(sample), avgTokensPerSecond: tokensPerSecond(sample), modelsCount: siblings.length,
      };
    });
    providers.sort((a, b) => b.tokens.total - a.tokens.total || a.providerId.localeCompare(b.providerId));

    const total = combine([...samples.values()]);
    const format = new Intl.DateTimeFormat('en-US', { timeZone: query.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const days = new Map<string, number>();
    let minTimestamp: number | null = null;
    for (const request of requests) {
      days.set(dateKey(format, request.timestamp), (days.get(dateKey(format, request.timestamp)) ?? 0) + 1);
      minTimestamp = minTimestamp === null ? request.timestamp : Math.min(minTimestamp, request.timestamp);
    }
    const activity = [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, steps]) => ({ date, steps }));
    let previous: number | undefined, streak = 0, longest = 0;
    for (const { date } of activity) {
      const ordinal = Date.parse(`${date}T00:00:00Z`) / 86_400_000;
      streak = previous !== undefined && ordinal === previous + 1 ? streak + 1 : 1;
      longest = Math.max(longest, streak);
      previous = ordinal;
    }
    const allUnpriced = models.length > 0 && models.every(model => model.pricing === null);
    // A scoped report validates every authorized transcript, so a corrupt one is
    // named beside the numbers instead of silently disappearing from them: the
    // sync indexes what it can parse, and a session whose file it skipped would
    // otherwise look like a session with no activity.
    const sourceErrors = scopeFiles === undefined ? {} : await validateScopeFiles(scopeFiles);
    // A scope whose every transcript is unreadable is a failed read, not a scope
    // with no activity: returning zeros would present an outage as an answer.
    if (scopeFiles !== undefined && scopeFiles.length > 0 && Object.keys(sourceErrors).length === scopeFiles.length)
      throw new Error('USAGE_UNAVAILABLE');
    const partial = Object.keys(reasoning.errors).length > 0 || Object.keys(sourceErrors).length > 0;
    const report: UsageStats = {
      range: { from: query.from ?? minTimestamp ?? query.to - 1, to: query.to },
      sessions: summary.sessions, subagents: summary.subagents, prompts: prompts.prompts, steps: requests.length,
      tokens: tokensOf(total), cost: total.cost, tools: { mode: 'none' },
      activeDays: days.size, streak: longest, activity, providers, models,
      avgTtft: averageTtft(total), avgTokensPerSecond: tokensPerSecond(total), errorRate: errorRate(total),
      pricing: allUnpriced ? null : (models.length === 1 ? models[0]!.pricing : null),
      partial,
    };
    if (partial) report.errors = { ...sourceErrors, ...reasoning.errors };
    return report;
  } finally {
    runtime.authStorage.close();
  }
}

/** Quota and usage fields of one native limit. Scope identities, account identity and raw payloads are not copied. */
function projectLimit(limit: UsageLimit): UsageAuthLimit {
  const { scope, window, amount } = limit;
  return {
    id: limit.id, label: limit.label,
    scope: { provider: scope.provider, modelId: scope.modelId, tier: scope.tier, windowId: scope.windowId, shared: scope.shared },
    window: window && { id: window.id, label: window.label, durationMs: window.durationMs, resetsAt: window.resetsAt },
    amount: {
      used: amount.used, limit: amount.limit, remaining: amount.remaining, usedFraction: amount.usedFraction,
      remainingFraction: amount.remainingFraction, unit: amount.unit,
    },
    status: limit.status,
  };
}

function projectReport(report: UsageReport): UsageAuthReport {
  const credits = report.resetCredits;
  const result: UsageAuthReport = {
    provider: report.provider,
    fetchedAt: report.fetchedAt,
    limits: report.limits.map(projectLimit),
  };
  if (credits) {
    result.resetCredits = { availableCount: credits.availableCount, redeemableCount: credits.redeemableCount };
  }
  return result;
}

function projectHistory(entry: UsageHistoryEntry): UsageAuthHistoryEntry {
  return {
    recordedAt: entry.recordedAt, provider: entry.provider, limitId: entry.limitId, label: entry.label,
    windowLabel: entry.windowLabel, usedFraction: entry.usedFraction, status: entry.status, resetsAt: entry.resetsAt,
  };
}

/** Bound on one native usage probe; the TUI's own probes are cached, and a slow provider must not hold the page. */
const USAGE_REPORT_TIMEOUT_MS = 15_000;

/**
 * OMP's native usage reports and recorded usage history, projected to quota
 * fields. Reads go through the default agent's AuthStorage: the report probes
 * configured providers as the TUI does, and history is read from its durable
 * store. Credentials, account identity and raw provider payloads never leave
 * this function.
 *
 * Each source fails on its own. A failed or unavailable source is `null` and
 * named in `errors`; the other source still returns its data.
 */
export async function getUsageAccounts(input: UsageQuery): Promise<UsageAccountsResult> {
  const query = UsageQuerySchema.parse(input);
  let runtime: UsageRuntime;
  try {
    runtime = await openUsageRuntime();
  } catch {
    return { accounts: { reports: null, history: null }, errors: { 'auth-storage': 'USAGE_AUTH_UNAVAILABLE' } };
  }
  const errors: Record<string, string> = {};
  let reports: UsageAuthReport[] | null = null;
  let history: UsageAuthHistoryEntry[] | null = null;
  try {
    try {
      const native = await runtime.authStorage.usage.reports({
        provider: query.providerId,
        baseUrlResolver: provider => runtime.modelRegistry.getProviderBaseUrl(provider),
        signal: AbortSignal.timeout(USAGE_REPORT_TIMEOUT_MS),
      });
      if (native === null) errors['auth-reports'] = 'USAGE_AUTH_REPORTS_UNAVAILABLE';
      else reports = native.map(projectReport);
    } catch {
      errors['auth-reports'] = 'USAGE_AUTH_REPORTS_UNAVAILABLE';
    }
    try {
      history = runtime.authStorage.usage.history({ provider: query.providerId, sinceMs: query.from })
        .filter(entry => entry.recordedAt < query.to)
        .map(projectHistory);
    } catch {
      errors['auth-history'] = 'USAGE_AUTH_HISTORY_UNAVAILABLE';
    }
  } finally {
    runtime.authStorage.close();
  }
  return { accounts: UsageAccountsSchema.parse({ reports, history }), errors };
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
  const response: UsageToolsResponse = { totals, usage: [...usage.values()].sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name)), partial };
  if (partial) response.errors = batch.errors;
  return response;
}
