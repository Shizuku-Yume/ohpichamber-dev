import { diffLineRunsWithin } from '@oh-my-pi/pi-natives';
import { z } from 'zod';

const MAX_FILE_CONTENT_CHARS = 262_144;
const MAX_RESPONSE_CONTENT_CHARS = 2 * 1024 * 1024;
const DIFF_CONTEXT_LINES = 3;
const MAX_DELTA_EDITS = 1024;

const StoredDeltaSchema = z.union([
  z.array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative(), z.array(z.string())])),
  z.string().min(1),
]);
const ChangeRecordSchema = z.strictObject({
  type: z.literal('change'),
  at: z.number().finite(),
  agent: z.string().min(1),
  parent: z.string().min(1).optional(),
  tool: z.string().min(1),
  path: z.string().min(1),
  base: z.string().min(1).nullable().optional(),
  gap: StoredDeltaSchema.optional(),
  edit: StoredDeltaSchema.optional(),
  sum: z.string().min(1).optional(),
});
const CommitRecordSchema = z.looseObject({ type: z.literal('commit') });
const JournalLineSchema = z.discriminatedUnion('type', [ChangeRecordSchema, CommitRecordSchema]);
export type TurnDiffChangeRecord = z.infer<typeof ChangeRecordSchema>;
type LineDelta = Array<[start: number, removed: number, inserted: string[]]>;


export interface TurnDiffCoreProvenance {
  tool: string;
  agent: 'session' | 'subagent';
  subagentId?: string;
  at: number;
}

export interface TurnDiffCoreFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  previousPath?: string;
  before?: string | null;
  after?: string | null;
  patch?: string;
  additions: number;
  deletions: number;
  provenance: readonly TurnDiffCoreProvenance[];
  truncated: boolean;
  incomplete: boolean;
}

export type TurnDiffCoreState = 'ready' | 'empty' | 'unsupported' | 'failed';

export interface TurnDiffCoreResult {
  readonly state: TurnDiffCoreState;
  readonly files: readonly TurnDiffCoreFile[];
  readonly error?: string;
}

function parseJournalLine(line: string): TurnDiffChangeRecord | undefined {
  try {
    const parsed = JournalLineSchema.safeParse(JSON.parse(line));
    return parsed.success && parsed.data.type === 'change' ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function parseJournalRecords(journalText: string): TurnDiffChangeRecord[] {
  const records: TurnDiffChangeRecord[] = [];
  for (const line of journalText.split('\n')) {
    if (!line) continue;
    const record = parseJournalLine(line);
    if (record !== undefined) records.push(record);
  }
  return records;
}

function toLines(text: string | null): string[] {
  return text === null ? [] : text.split('\n');
}

function fromLines(lines: readonly string[]): string | null {
  return lines.length === 0 ? null : lines.join('\n');
}

export function contentSum(text: string | null): string {
  return text === null ? '-' : Bun.hash(text).toString(36);
}

function applyDelta(lines: readonly string[], delta: LineDelta): readonly string[] | undefined {
  if (delta.length === 0) return lines;
  const parts: Array<readonly string[]> = [];
  let at = 0;
  for (const [start, removed, inserted] of delta) {
    if (start < at || start + removed > lines.length) return undefined;
    parts.push(lines.slice(at, start), inserted);
    at = start + removed;
  }
  parts.push(lines.slice(at));
  return parts.flat();
}

interface Region { i1: number; i2: number; j1: number; j2: number }

function changedRegionsWithin(a: readonly string[], b: readonly string[]): Region[] | undefined {
  if (a.length === 0 || b.length === 0) {
    return a.length === 0 && b.length === 0 ? [] : [{ i1: 0, i2: a.length, j1: 0, j2: b.length }];
  }
  const runs = diffLineRunsWithin(a.join('\n'), b.join('\n'), MAX_DELTA_EDITS);
  if (!runs) return undefined;
  const regions: Region[] = [];
  let i = 0;
  let j = 0;
  let open: Region | undefined;
  for (const run of runs) {
    if (!run.added && !run.removed) {
      if (open) regions.push(open);
      open = undefined;
      i += run.count;
      j += run.count;
      continue;
    }
    open ??= { i1: i, i2: i, j1: j, j2: j };
    if (run.removed) {
      i += run.count;
      open.i2 = i;
    } else {
      j += run.count;
      open.j2 = j;
    }
  }
  if (open) regions.push(open);
  return regions;
}

interface FileLines {
  readonly lines: string[];
  readonly finalNewline: boolean;
}

function fileLines(text: string | null): FileLines {
  if (text === null || text === '') return { lines: [], finalNewline: false };
  const finalNewline = text.endsWith('\n');
  const lines = text.split('\n');
  if (finalNewline) lines.pop();
  return { lines, finalNewline };
}

export interface UnifiedDiffResult {
  readonly patch: string;
  readonly additions: number;
  readonly deletions: number;
}

export function unifiedDiff(path: string, before: string | null, after: string | null): UnifiedDiffResult {
  const beforeFile = fileLines(before);
  const afterFile = fileLines(after);
  const NO_NEWLINE = '\0';
  const mark = (lines: readonly string[], finalNewline: boolean): readonly string[] => {
    if (finalNewline || lines.length === 0) return lines;
    return [...lines.slice(0, -1), `${lines.at(-1)}${NO_NEWLINE}`];
  };
  const unmark = (line: string): string => line.endsWith(NO_NEWLINE) ? line.slice(0, -NO_NEWLINE.length) : line;
  const markedBefore = mark(beforeFile.lines, beforeFile.finalNewline);
  const markedAfter = mark(afterFile.lines, afterFile.finalNewline);
  const regions = changedRegionsWithin(markedBefore, markedAfter) ?? [{ i1: 0, i2: markedBefore.length, j1: 0, j2: markedAfter.length }];
  const deltaRegions = regions.filter(region => region.i1 !== region.i2 || region.j1 !== region.j2);
  if (deltaRegions.length === 0) return { patch: '', additions: 0, deletions: 0 };
  const source = before === null ? '/dev/null' : `a/${path}`;
  const target = after === null ? '/dev/null' : `b/${path}`;
  let additions = 0;
  let deletions = 0;
  interface Region { start: number; removed: number; inserted: readonly string[] }
  const hunks: Region[][] = [];
  for (const region of deltaRegions) {
    const mapped: Region = { start: region.i1, removed: region.i2 - region.i1, inserted: markedAfter.slice(region.j1, region.j2) };
    const hunk = hunks.at(-1);
    const last = hunk?.at(-1);
    if (hunk && last && mapped.start - (last.start + last.removed) <= DIFF_CONTEXT_LINES * 2) {
      hunk.push(mapped);
    } else {
      hunks.push([mapped]);
    }
  }
  const emission: string[] = [];
  let netGrowth = 0;
  for (const hunk of hunks) {
    const first = hunk[0]!;
    const last = hunk.at(-1)!;
    const hunkEndBefore = last.start + last.removed;
    const startBefore0 = Math.max(0, first.start - DIFF_CONTEXT_LINES);
    const endBefore = Math.min(markedBefore.length, hunkEndBefore + DIFF_CONTEXT_LINES);
    const rows: string[] = [];
    let cursor = startBefore0;
    let countAfter = 0;
    const pushRow = (kind: string, line: string): void => {
      rows.push(`${kind}${unmark(line)}`);
      if (line.endsWith(NO_NEWLINE)) rows.push('\\ No newline at end of file');
    };
    for (const line of markedBefore.slice(cursor, first.start)) { pushRow(' ', line); countAfter++; }
    cursor = first.start;
    for (const region of hunk) {
      for (const line of markedBefore.slice(cursor, region.start)) { pushRow(' ', line); countAfter++; }
      const removedLines = markedBefore.slice(region.start, region.start + region.removed);
      for (const line of removedLines) pushRow('-', line);
      for (const line of region.inserted) { pushRow('+', line); countAfter++; }
      deletions += removedLines.length;
      additions += region.inserted.length;
      cursor = region.start + region.removed;
    }
    for (const line of markedBefore.slice(cursor, endBefore)) { pushRow(' ', line); countAfter++; }
    const countBefore = endBefore - startBefore0;
    const startBefore = countBefore === 0 ? startBefore0 : startBefore0 + 1;
    const regionAfterStart0 = first.start + netGrowth;
    const startAfter0 = Math.max(0, regionAfterStart0 - DIFF_CONTEXT_LINES);
    const startAfter = countAfter === 0 ? startAfter0 : startAfter0 + 1;
    const beforeRange = countBefore === 1 ? `${startBefore}` : `${startBefore},${countBefore}`;
    const afterRange = countAfter === 1 ? `${startAfter}` : `${startAfter},${countAfter}`;
    emission.push(`@@ -${beforeRange} +${afterRange} @@`);
    emission.push(...rows);
    for (const region of hunk) netGrowth += region.inserted.length - region.removed;
  }
  return { patch: [`--- ${source}`, `+++ ${target}`, ...emission, ''].join('\n'), additions, deletions };
}

interface ReplayableWrite {
  readonly record: TurnDiffChangeRecord;
  readonly before: string | null;
  readonly after: string | null;
}

interface Content {
  readonly lines: readonly string[];
  readonly text: string | null;
}

async function replayPathChain(
  records: readonly TurnDiffChangeRecord[],
  loadBlob: (key: string) => Promise<Uint8Array | undefined>,
): Promise<{ writes: ReplayableWrite[]; broken: boolean }> {
  const decode = (bytes: Uint8Array): string => new TextDecoder('utf-8', { ignoreBOM: true }).decode(Bun.gunzipSync(Uint8Array.from(bytes)));
  const LineDeltaSchema = z.array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative(), z.array(z.string())]));
  const loadDelta = async (stored: z.infer<typeof StoredDeltaSchema>): Promise<LineDelta | undefined> => {
    if (Array.isArray(stored)) return stored;
    const bytes = await loadBlob(stored);
    if (bytes === undefined) return undefined;
    const parsed = LineDeltaSchema.safeParse(JSON.parse(decode(bytes)));
    return parsed.success ? parsed.data : undefined;
  };
  const loadBaseText = async (key: string): Promise<string | undefined> => {
    const bytes = await loadBlob(key);
    return bytes === undefined ? undefined : decode(bytes);
  };
  const writes: ReplayableWrite[] = [];
  let tip: Content | undefined;
  let broken = false;
  for (const record of records) {
    let before: Content | undefined;
    if (record.base !== undefined) {
      const text = record.base === null ? null : await loadBaseText(record.base);
      before = text === undefined ? undefined : { lines: toLines(text), text };
    } else if (!tip || record.gap === undefined) {
      before = tip;
    } else {
      const gap = await loadDelta(record.gap);
      const lines = gap === undefined ? undefined : applyDelta(tip.lines, gap);
      before = lines === undefined ? undefined : { lines, text: fromLines(lines) };
    }
    const edit = record.edit === undefined ? undefined : await loadDelta(record.edit);
    const afterLines = before !== undefined && edit !== undefined ? applyDelta(before.lines, edit) : undefined;
    const nextTip: Content | undefined = afterLines === undefined ? undefined : { lines: afterLines, text: fromLines(afterLines) };
    tip = nextTip;
    if (before === undefined || nextTip === undefined || contentSum(nextTip.text) !== record.sum) {
      tip = undefined;
      broken = true;
      continue;
    }
    writes.push({ record, before: before.text, after: nextTip.text });
  }
  return { writes, broken };
}

function workspaceRelativePath(absolutePath: string, workspaceCwd: string): string | null {
  const normalize = (value: string): string => {
    const parts: string[] = [];
    for (const segment of value.split('/')) {
      if (segment === '' || segment === '.') continue;
      if (segment === '..') { parts.pop(); continue; }
      parts.push(segment);
    }
    return parts.join('/');
  };
  const cwd = normalize(workspaceCwd);
  const target = normalize(absolutePath);
  if (cwd === '') return target === '' ? null : target;
  if (target === cwd) return null;
  if (!target.startsWith(`${cwd}/`)) return null;
  const relative = target.slice(cwd.length + 1);
  return relative === '' ? null : relative;
}

const ErrorMessageSchema = z.object({ message: z.string() });
export function sanitizeErrorMessage(raw: string): string {
  const withoutQuoted = raw.replace(/['"](\/[^'"]*)['"]/g, "'[path]'");
  const withoutBare = withoutQuoted.replace(/\/\S+/g, '[path]');
  const sanitized = withoutBare.replace(/\s+/g, ' ').trim().slice(0, 200);
  return sanitized === '' ? 'The turn diff read failed' : sanitized;
}



export interface ComputeTurnDiffInput {
  readonly journalText: string | null;
  readonly loadBlob: (key: string) => Promise<Uint8Array | undefined>;
  readonly window: { readonly turnId: string; readonly startedAt: number; readonly finishedAt: number | undefined };
  readonly ownsRecord: (record: TurnDiffChangeRecord) => boolean;
  readonly workspaceCwd: string;
  readonly turnHasMutationEvidence: boolean;
  readonly now?: number;
}

export async function computeTurnDiff(input: ComputeTurnDiffInput): Promise<TurnDiffCoreResult> {
  let records: TurnDiffChangeRecord[];
  try {
    records = input.journalText === null ? [] : parseJournalRecords(input.journalText);
  } catch (error) {
    return { state: 'failed', files: [], error: sanitizeErrorMessage(ErrorMessageSchema.safeParse(error).data?.message ?? String(error)) };
  }
  const windowEnd = input.window.finishedAt ?? input.now ?? Date.now();
  const selected = records.filter(record =>
    input.ownsRecord(record) && record.at >= input.window.startedAt && record.at <= windowEnd);
  if (selected.length === 0) {
    return { state: input.turnHasMutationEvidence ? 'unsupported' : 'empty', files: [] };
  }

  const prefixByPath = new Map<string, TurnDiffChangeRecord[]>();
  const selectedOrder: string[] = [];
  for (const record of records) {
    if (record.at > windowEnd) continue;
    const key = record.path;
    const inWindow = input.ownsRecord(record) && record.at >= input.window.startedAt;
    let chain = prefixByPath.get(key);
    if (!chain) {
      chain = [];
      prefixByPath.set(key, chain);
    }
    chain.push(record);
    if (inWindow && !selectedOrder.includes(key)) selectedOrder.push(key);
  }

  interface PathOutcome {
    readonly absolutePath: string;
    readonly entries: readonly { readonly record: TurnDiffChangeRecord; readonly before: string | null; readonly after: string | null }[];
    readonly incomplete: boolean;
    readonly provenance: readonly TurnDiffCoreProvenance[];
  }
  const outcomes: PathOutcome[] = [];
  let readFailure: TurnDiffCoreResult | undefined;
  for (const path of selectedOrder) {
    const chain = prefixByPath.get(path)!;
    const windowRecords = chain.filter(record => input.ownsRecord(record) && record.at >= input.window.startedAt);
    let replay;
    try {
      replay = await replayPathChain(chain, input.loadBlob);
    } catch (error) {
      readFailure = { state: 'failed', files: [], error: sanitizeErrorMessage(ErrorMessageSchema.safeParse(error).data?.message ?? String(error)) };
      break;
    }
    const byRecord = new Map<TurnDiffChangeRecord, { before: string | null; after: string | null }>();
    for (const write of replay.writes) byRecord.set(write.record, { before: write.before, after: write.after });
    const entries: { record: TurnDiffChangeRecord; before: string | null; after: string | null }[] = [];
    let incomplete = false;
    for (const record of windowRecords) {
      const write = byRecord.get(record);
      if (write === undefined) {
        incomplete = true;
        continue;
      }
      entries.push({ record, before: write.before, after: write.after });
    }
    const provenance: { tool: string; agent: 'session' | 'subagent'; subagentId?: string; at: number }[] = [];
    for (const record of windowRecords) {
      const key: TurnDiffCoreProvenance = record.parent === undefined
        ? { tool: record.tool, agent: 'session', at: record.at }
        : { tool: record.tool, agent: 'subagent', subagentId: record.agent, at: record.at };
      const existing = provenance.findIndex(entry => entry.tool === key.tool && entry.agent === key.agent && entry.subagentId === key.subagentId);
      if (existing >= 0) {
        if (provenance[existing]!.at < key.at) provenance[existing] = { ...provenance[existing]!, at: key.at };
      } else {
        provenance.push(key);
      }
    }
    outcomes.push({ absolutePath: path, entries, incomplete, provenance });
  }
  if (readFailure) return readFailure;

  const rows: TurnDiffCoreFile[] = [];
  const renameTargetBySource = new Map<string, PathOutcome>();
  const renameSourceByTarget = new Map<string, PathOutcome>();
  for (const outcome of outcomes) {
    if (outcome.entries.length === 0) continue;
    if (outcome.entries.at(-1)!.after !== null) continue;
    const deletion = outcome.entries.at(-1)!;
    const deletionContent = deletion.before;
    if (deletionContent === null) continue;
    for (const candidate of outcomes) {
      if (candidate === outcome || candidate.entries.length === 0) continue;
      const initial = candidate.entries[0]!;
      if (initial.record.at < deletion.record.at) continue;
      if (initial.after !== deletionContent) continue;
      renameTargetBySource.set(outcome.absolutePath, candidate);
      renameSourceByTarget.set(candidate.absolutePath, outcome);
    }
  }
  const foldedSources = new Set<string>();
  for (const [source, target] of renameTargetBySource) {
    if (workspaceRelativePath(source, input.workspaceCwd) === null) continue;
    if (workspaceRelativePath(target.absolutePath, input.workspaceCwd) === null) continue;
    foldedSources.add(source);
  }

  let responseBudget = MAX_RESPONSE_CONTENT_CHARS;
  let netZeroLifecycle = false;
  for (const outcome of outcomes) {
    const relative = workspaceRelativePath(outcome.absolutePath, input.workspaceCwd);
    const renameSource = renameSourceByTarget.get(outcome.absolutePath);
    const mergedSource = renameSource !== undefined && relative !== null
      && workspaceRelativePath(renameSource.absolutePath, input.workspaceCwd) !== null
      ? renameSource : undefined;
    if (foldedSources.has(outcome.absolutePath)) continue;
    if (relative === null) continue;
    if (outcome.entries.length === 0) {
      rows.push({
        path: relative, status: 'modified', additions: 0, deletions: 0,
        provenance: outcome.provenance, truncated: false, incomplete: true,
      });
      continue;
    }
    const before = outcome.entries[0]!.before;
    const after = outcome.entries.at(-1)!.after;
    if (before === null && after === null && mergedSource === undefined) { netZeroLifecycle = true; continue; }
    const complete = !outcome.incomplete;
    let status: TurnDiffCoreFile['status'];
    if (mergedSource !== undefined) status = 'renamed';
    else if (before === null) status = 'added';
    else if (after === null) status = 'deleted';
    else status = 'modified';
    const contentBefore = mergedSource !== undefined ? mergedSource.entries.at(-1)!.before : before;
    let patch: string | undefined;
    let additions = 0;
    let deletions = 0;
    if (complete) {
      const computed = unifiedDiff(relative, contentBefore, after);
      additions = computed.additions;
      deletions = computed.deletions;
      patch = computed.patch === '' ? undefined : computed.patch;
    }
    let truncated = false;
    let emitBefore: string | null | undefined = contentBefore;
    let emitAfter: string | null | undefined = after;
    if (complete) {
      if ((contentBefore?.length ?? 0) > MAX_FILE_CONTENT_CHARS || (after?.length ?? 0) > MAX_FILE_CONTENT_CHARS) {
        emitBefore = undefined;
        emitAfter = undefined;
        truncated = true;
      }
      if (patch !== undefined && patch.length > MAX_FILE_CONTENT_CHARS) {
        patch = undefined;
        truncated = true;
      }
      const rowContent = (emitBefore?.length ?? 0) + (emitAfter?.length ?? 0) + (patch?.length ?? 0);
      if (rowContent > responseBudget) {
        emitBefore = undefined;
        emitAfter = undefined;
        patch = undefined;
        truncated = true;
      } else {
        responseBudget -= rowContent;
      }
    }
    const sourceRelative = mergedSource === undefined ? null : workspaceRelativePath(mergedSource.absolutePath, input.workspaceCwd);
    const row: TurnDiffCoreFile = {
      path: relative,
      status,
      additions, deletions,
      provenance: outcome.provenance,
      truncated,
      incomplete: outcome.incomplete,
    };
    if (sourceRelative !== null) row.previousPath = sourceRelative;
    if (complete && emitBefore !== undefined) row.before = emitBefore;
    if (complete && emitAfter !== undefined) row.after = emitAfter;
    if (complete && patch !== undefined) row.patch = patch;
    rows.push(row);
  }
  if (rows.length === 0) return { state: !netZeroLifecycle && input.turnHasMutationEvidence ? 'unsupported' : 'empty', files: [] };
  return { state: 'ready', files: rows };
}
