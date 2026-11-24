import React from 'react';
import { z } from 'zod';

import type { JsonValue, Message, ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';
import { isSubagentTool, toolBaseName } from '@/lib/toolPresentation';
import { nativeToolResultContent } from '@/lib/toolResultContent';
import { useDirectorySync } from '@/sync/sync-context';
import type { State } from '@/sync/types';

export type SubagentReport = {
  subagentId: string;
  childSessionId?: string;
  state: 'running' | 'completed' | 'failed' | 'cancelled';
  output: string;
  durationMs?: number;
};

const NO_REPORTS: Map<string, SubagentReport> = new Map();
const NO_MESSAGES: readonly Message[] = [];
const reportsByMessages = new WeakMap<readonly Message[], Map<string, SubagentReport>>();

const singleTaskNameSchema = z.object({
  name: z.string().trim().min(1).optional(),
});

const vibeCallIdsSchema = z.object({
  name: z.string().trim().min(1).optional(),
  session: z.string().trim().min(1).optional(),
});

const vibeDetailsSchema = z.object({
  spawned: z.object({ id: z.string().trim().min(1) }).optional(),
  send: z.object({ id: z.string().trim().min(1) }).optional(),
  wait: z.object({
    settled: z.array(z.object({
      id: z.string().trim().min(1),
      jobId: z.string().trim().min(1).optional(),
      status: z.string().optional(),
    })).optional(),
    waiting: z.boolean().optional(),
  }).optional(),
});

const TASK_RESULT_BLOCK_RE = /<task-result\b([^>]*)>([\s\S]*?)<\/task-result>/g;
const VIBE_TURN_BLOCK_RE = /<vibe-turn\b([^>]*)>([\s\S]*?)<\/vibe-turn>/g;
const VIBE_WAIT_SECTION_RE = /^##\s+`([^`]+)`\s+[—-]\s+([^\n]+)$/gm;
const ATTR_ID_RE = /\bid="([^"]+)"/;
const ATTR_SESSION_RE = /\bsession="([^"]+)"/;
const ATTR_STATUS_RE = /\bstatus="([^"]+)"/;
const ASYNC_SPAWN_ACK_RE = /^(?:Spawned\s+(?:agent|\d+\s+agents?)\b|Running\s+.+?\s+inline;\s+\d+\s+background\s+agent)/i;

const extractTag = (body: string, tag: string): string | null => {
  const match = body.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  const text = match?.[1]?.trim();
  return text ? text : null;
};

const cleanTaskResultBody = (body: string): string => {
  const sections = [
    extractTag(body, 'abort-reason'),
    extractTag(body, 'error'),
    extractTag(body, 'output') ?? extractTag(body, 'preview'),
    extractTag(body, 'merge-summary'),
  ].filter((value): value is string => Boolean(value));
  if (sections.length > 0) return sections.join('\n\n');
  return body
    .replace(/<meta\b[^>]*\/?>/gi, '')
    .replace(/<\/?(?:output|preview|error|abort-reason|merge-summary)(?:\s[^>]*)?>/gi, '')
    .trim();
};

const cleanVibeTurnBody = (body: string): string => {
  const error = extractTag(body, 'error');
  const rawResponse = extractTag(body, 'response');
  const response = error && rawResponse === '(no output)' ? null : rawResponse;
  const sections = [error, response].filter((value): value is string => Boolean(value));
  if (sections.length > 0) return sections.join('\n\n');
  return body
    .replace(/<activity\b[^>]*>[\s\S]*?<\/activity>/gi, '')
    .replace(/<\/?(?:vibe-turn|response|error)(?:\s[^>]*)?>/gi, '')
    .replace(/^Session\s+`[^`]+`\s+is\s+idle\b[^\n]*$/gim, '')
    .trim();
};

const cleanAsyncJobReportText = (reportText: string, workerId?: string): string => {
  const trimmed = reportText.trim();
  if (!trimmed.startsWith('<vibe-turn')) return reportText;
  VIBE_TURN_BLOCK_RE.lastIndex = 0;
  const matches = [...trimmed.matchAll(VIBE_TURN_BLOCK_RE)];
  if (matches.length === 0) return reportText;
  VIBE_TURN_BLOCK_RE.lastIndex = 0;
  const onlyVibeBlocks = trimmed.replace(VIBE_TURN_BLOCK_RE, '').trim().length === 0;
  if (!onlyVibeBlocks) return reportText;
  const targeted = workerId
    ? matches.filter((match) => (match[1] ?? '').match(ATTR_SESSION_RE)?.[1]?.trim() === workerId)
    : matches;
  const activeMatches = targeted.length > 0 ? targeted : matches;
  const sections = activeMatches
    .map((match) => cleanVibeTurnBody(match[2] ?? ''))
    .filter(Boolean);
  return sections.length > 0 ? sections.join('\n\n') : reportText;
};

const mapTaskStatus = (rawStatus: string | undefined, isError: boolean): SubagentReport['state'] => {
  const normalized = (rawStatus ?? '').trim().toLowerCase();
  if (normalized === 'cancelled' || normalized === 'aborted') return 'cancelled';
  if (normalized === 'running') return 'running';
  if (normalized.startsWith('failed') || normalized.includes('failed') || isError) return 'failed';
  return 'completed';
};

const extractResultDetails = (
  result: ToolResultPart,
  nativeDetails: JsonValue | undefined,
): z.infer<typeof vibeDetailsSchema> | null => {
  if (nativeDetails !== undefined) {
    const parsed = vibeDetailsSchema.safeParse(nativeDetails);
    if (parsed.success) return parsed.data;
  }
  const direct = vibeDetailsSchema.safeParse(result.output);
  return direct.success ? direct.data : null;
};

const collectVibeWaitReports = (
  rawText: string,
  details: z.infer<typeof vibeDetailsSchema> | null,
  isError: boolean,
  target: Map<string, SubagentReport>,
): void => {
  if (details?.wait?.waiting === true) return;

  const seenIds = new Set<string>();
  VIBE_TURN_BLOCK_RE.lastIndex = 0;
  for (const match of rawText.matchAll(VIBE_TURN_BLOCK_RE)) {
    const attrs = match[1] ?? '';
    const body = match[2] ?? '';
    const sessionId = attrs.match(ATTR_SESSION_RE)?.[1]?.trim();
    if (!sessionId) continue;
    const statusAttr = attrs.match(ATTR_STATUS_RE)?.[1];
    const cleaned = cleanVibeTurnBody(body);
    if (!cleaned) continue;
    seenIds.add(sessionId);
    target.set(sessionId, {
      subagentId: sessionId,
      state: mapTaskStatus(statusAttr, isError),
      output: cleaned,
    });
  }

  const settled = details?.wait?.settled ?? [];
  if (settled.length === 0) return;

  const sectionBodies = new Map<string, string>();
  VIBE_WAIT_SECTION_RE.lastIndex = 0;
  const headers = [...rawText.matchAll(VIBE_WAIT_SECTION_RE)];
  for (const [index, header] of headers.entries()) {
    const id = header[1]?.trim();
    if (!id) continue;
    const start = header.index + header[0].length;
    const end = index + 1 < headers.length ? headers[index + 1]!.index : rawText.length;
    const slice = rawText.slice(start, end).trim();
    if (slice) sectionBodies.set(id, slice);
  }

  for (const entry of settled) {
    if (seenIds.has(entry.id)) continue;
    const body = sectionBodies.get(entry.id) ?? (settled.length === 1 ? rawText.trim() : '');
    if (!body) continue;
    const cleaned = cleanAsyncJobReportText(body).trim();
    if (!cleaned) continue;
    target.set(entry.id, {
      subagentId: entry.id,
      state: mapTaskStatus(entry.status, isError),
      output: cleaned,
    });
  }
};

const collectForegroundTaskReports = (
  calls: readonly ToolCallPart[],
  resultsByCallId: ReadonlyMap<string, ToolResultPart>,
  target: Map<string, SubagentReport>,
): void => {
  for (const call of calls) {
    const base = toolBaseName(call.toolName);
    const isTask = isSubagentTool(call.toolName);
    const isVibe = base === 'vibe_wait' || base === 'vibe_spawn' || base === 'vibe_send';
    if (!isTask && !isVibe) continue;

    const result = resultsByCallId.get(call.toolCallId);
    if (!result) continue;

    const native = nativeToolResultContent(result);
    const rawText = native.text.trim() ? native.text : (result.error ?? '');
    if (!rawText.trim()) continue;

    if (base === 'vibe_wait') {
      const details = extractResultDetails(result, native.details);
      collectVibeWaitReports(rawText, details, result.isError, target);
      continue;
    }

    if (base === 'vibe_spawn' || base === 'vibe_send') {
      if (!result.isError) continue;
      const details = extractResultDetails(result, native.details);
      const inputIds = vibeCallIdsSchema.safeParse(call.input).data;
      const id = details?.spawned?.id ?? details?.send?.id ?? inputIds?.session ?? inputIds?.name;
      const report: SubagentReport = {
        subagentId: id ?? call.toolCallId,
        state: 'failed',
        output: rawText.trim(),
      };
      if (id) target.set(id, report);
      target.set(`toolCall:${call.toolCallId}`, report);
      continue;
    }

    let matchedBlocks = false;
    TASK_RESULT_BLOCK_RE.lastIndex = 0;
    for (const match of rawText.matchAll(TASK_RESULT_BLOCK_RE)) {
      const attrs = match[1] ?? '';
      const body = match[2] ?? '';
      const id = attrs.match(ATTR_ID_RE)?.[1]?.trim();
      if (!id) continue;
      matchedBlocks = true;
      const statusAttr = attrs.match(ATTR_STATUS_RE)?.[1];
      const cleaned = cleanTaskResultBody(body);
      target.set(id, {
        subagentId: id,
        state: mapTaskStatus(statusAttr, result.isError),
        output: cleaned,
      });
    }
    if (matchedBlocks) continue;

    // Async spawns return a brief acknowledgement (`Spawned agent ...`); their real report
    // arrives later via `async_job_result`. Do not mistake that ack for a foreground report.
    if (ASYNC_SPAWN_ACK_RE.test(rawText.trim()) && !result.isError) continue;

    const parsedName = singleTaskNameSchema.safeParse(call.input).data?.name;
    const report: SubagentReport = {
      subagentId: parsedName ?? call.toolCallId,
      state: result.isError ? 'failed' : 'completed',
      output: rawText.trim(),
    };
    if (parsedName) target.set(parsedName, report);
    target.set(`toolCall:${call.toolCallId}`, report);
  }
};

export const collectSubagentReports = (messages: readonly Message[] | undefined): Map<string, SubagentReport> => {
  if (!messages || messages.length === 0) return NO_REPORTS;
  const cached = reportsByMessages.get(messages);
  if (cached) return cached;

  const byId = new Map<string, SubagentReport>();
  for (const message of messages) {
    if (message.role === 'assistant') {
      const calls: ToolCallPart[] = [];
      const resultsByCallId = new Map<string, ToolResultPart>();
      for (const part of message.parts) {
        if (part.type === 'tool_call') calls.push(part);
        else if (part.type === 'tool_result') resultsByCallId.set(part.toolCallId, part);
      }
      if (calls.length > 0 && resultsByCallId.size > 0) {
        collectForegroundTaskReports(calls, resultsByCallId, byId);
      }
    }

    for (const part of message.parts) {
      if (part.type !== 'notice' || part.noticeType !== 'async_job_result') continue;
      for (const job of part.details.jobs) {
        if (job.type && job.type !== 'task' && !job.subagentId && !job.childSessionId) continue;
        const primaryId = job.subagentId ?? job.childSessionId ?? job.jobId;
        const report: SubagentReport = {
          subagentId: primaryId,
          childSessionId: job.childSessionId,
          state: job.status ?? 'completed',
          output: cleanAsyncJobReportText(job.reportText, primaryId),
          durationMs: job.durationMs,
        };
        byId.set(primaryId, report);
        if (job.childSessionId) byId.set(job.childSessionId, report);
        if (job.jobId !== primaryId) byId.set(job.jobId, report);
      }
    }
  }

  reportsByMessages.set(messages, byId);
  return byId;
};

export const findSubagentReport = (
  reports: ReadonlyMap<string, SubagentReport>,
  target: { subagentId: string; childSessionId?: string | null; name?: string | null; toolCallId?: string | null },
): SubagentReport | null => {
  const bySubagent = reports.get(target.subagentId);
  if (bySubagent) return bySubagent;
  if (target.childSessionId) {
    const byChild = reports.get(target.childSessionId);
    if (byChild) return byChild;
  }
  if (target.name) {
    const byName = reports.get(target.name);
    if (byName) return byName;
  }
  if (target.toolCallId) {
    const byToolCall = reports.get(`toolCall:${target.toolCallId}`);
    if (byToolCall) return byToolCall;
  }
  return null;
};

export const useSubagentReports = (
  sessionId: string | null,
  directory: string | null,
  enabled: boolean,
): Map<string, SubagentReport> => {
  const messages = useDirectorySync(
    React.useCallback(
      (state: State) => (enabled && sessionId ? state.message[sessionId] ?? NO_MESSAGES : NO_MESSAGES),
      [enabled, sessionId],
    ),
    directory ?? undefined,
  );
  return React.useMemo(() => {
    if (messages.length === 0) return NO_REPORTS;
    return collectSubagentReports(messages);
  }, [messages]);
};
