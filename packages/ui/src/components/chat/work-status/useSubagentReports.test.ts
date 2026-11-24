import { describe, expect, test } from 'bun:test';

import type { Message } from '@openchamber/agent-contract';
import { collectSubagentReports, findSubagentReport } from './useSubagentReports';

const assistantMessage = (messageId: string, parts: Message['parts']): Message => ({
  messageId,
  sessionId: 'parent',
  turnId: 'turn-1',
  role: 'assistant',
  createdAt: 1,
  parts,
});

describe('collectSubagentReports', () => {
  test('reads foreground <task-result> blocks and strips harness wrapper tags', () => {
    const message = assistantMessage('a1', [
      {
        type: 'tool_call',
        partId: 'c1',
        toolCallId: 'call-1',
        toolName: 'task',
        status: 'completed',
        input: { name: 'ForegroundScout', agent: 'scout', task: 'Inspect' },
      },
      {
        type: 'tool_result',
        partId: 'r1',
        toolCallId: 'call-1',
        toolName: 'task',
        isError: false,
        output: '<task-result id="ForegroundScout" agent="scout" status="completed" duration="1.2s">\n<output>\n## Answer first\n\nAll clear.\n</output>\n</task-result>',
      },
    ]);

    const reports = collectSubagentReports([message]);
    const found = findSubagentReport(reports, { subagentId: 'ForegroundScout', toolCallId: 'call-1' });
    expect(found?.output).toBe('## Answer first\n\nAll clear.');
    expect(found?.state).toBe('completed');
  });

  test('ignores async spawn acknowledgements and reads async_job_result notice parts', () => {
    const spawnMessage = assistantMessage('a1', [
      {
        type: 'tool_call',
        partId: 'c1',
        toolCallId: 'call-async',
        toolName: 'task',
        status: 'completed',
        input: { name: 'AsyncScout', agent: 'scout', task: 'Inspect' },
      },
      {
        type: 'tool_result',
        partId: 'r1',
        toolCallId: 'call-async',
        toolName: 'task',
        isError: false,
        output: 'Spawned agent `AsyncScout` in background.',
      },
    ]);

    expect(
      findSubagentReport(collectSubagentReports([spawnMessage]), {
        subagentId: 'AsyncScout',
        toolCallId: 'call-async',
      }),
    ).toBeNull();

    const asyncNoticeMessage: Message = {
      messageId: 'n1',
      sessionId: 'parent',
      turnId: 'turn-2',
      role: 'system',
      createdAt: 2,
      parts: [
        {
          type: 'notice',
          partId: 'np1',
          noticeType: 'async_job_result',
          level: 'info',
          details: {
            jobs: [
              {
                jobId: 'AsyncScout',
                subagentId: 'AsyncScout',
                childSessionId: 'uuid-child-1',
                type: 'task',
                status: 'completed',
                label: 'AsyncScout',
                durationMs: 4200,
                reportText: '### Summary\nFound 2 matches.',
              },
              {
                jobId: 'bash-1',
                type: 'bash',
                status: 'completed',
                reportText: 'should be ignored for subagent reports',
              },
            ],
          },
        },
      ],
    };

    const reports = collectSubagentReports([spawnMessage, asyncNoticeMessage]);
    expect(findSubagentReport(reports, { subagentId: 'AsyncScout' })?.output).toBe('### Summary\nFound 2 matches.');
    expect(findSubagentReport(reports, { subagentId: 'other', childSessionId: 'uuid-child-1' })?.durationMs).toBe(4200);
    expect(findSubagentReport(reports, { subagentId: 'bash-1' })).toBeNull();
  });

  test('later report for the same subagent replaces the earlier one', () => {
    const first: Message = {
      messageId: 'm1',
      sessionId: 'parent',
      turnId: 't1',
      role: 'system',
      createdAt: 1,
      parts: [
        {
          type: 'notice',
          partId: 'p1',
          noticeType: 'async_job_result',
          level: 'info',
          details: { jobs: [{ jobId: 'S1', subagentId: 'S1', type: 'task', status: 'completed', reportText: 'First' }] },
        },
      ],
    };
    const second: Message = {
      messageId: 'm2',
      sessionId: 'parent',
      turnId: 't2',
      role: 'system',
      createdAt: 2,
      parts: [
        {
          type: 'notice',
          partId: 'p2',
          noticeType: 'async_job_result',
          level: 'error',
          details: { jobs: [{ jobId: 'S1', subagentId: 'S1', type: 'task', status: 'failed', reportText: 'Second' }] },
        },
      ],
    };

    const reports = collectSubagentReports([first, second]);
    const report = findSubagentReport(reports, { subagentId: 'S1' });
    expect(report?.output).toBe('Second');
    expect(report?.state).toBe('failed');
  });
});
