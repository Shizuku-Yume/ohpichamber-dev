import React from 'react';
import { z } from 'zod';

import type { Message, ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';
import { isSubagentTool } from '@/lib/toolPresentation';
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

const TASK_RESULT_BLOCK_RE = /<task-result\b([^>]*)>([\s\S]*?)<\/task-result>/g;
const ATTR_ID_RE = /\bid="([^"]+)"/;
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

const mapTaskStatus = (rawStatus: string | undefined, isError: boolean): SubagentReport['state'] => {
  const normalized = (rawStatus ?? '').trim().toLowerCase();
  if (normalized === 'cancelled' || normalized === 'aborted') return 'cancelled';
  if (normalized === 'running') return 'running';
  if (normalized.startsWith('failed') || normalized.includes('failed') || isError) return 'failed';
  return 'completed';
};

const collectForegroundTaskReports = (
  calls: readonly ToolCallPart[],
  resultsByCallId: ReadonlyMap<string, ToolResultPart>,
  target: Map<string, SubagentReport>,
): void => {
  for (const call of calls) {
    if (!isSubagentTool(call.toolName)) continue;
    const result = resultsByCallId.get(call.toolCallId);
    if (!result) continue;

    const rawText = z.string().safeParse(result.output).data ?? (result.error ?? '');
    if (!rawText.trim()) continue;

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
          output: job.reportText,
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
