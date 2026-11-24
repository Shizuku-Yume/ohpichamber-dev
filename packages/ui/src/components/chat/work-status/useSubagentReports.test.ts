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

  test('extracts clean markdown from vibe async_job_result and vibe_wait results while ignoring vibe_spawn acks', () => {
    const spawnAndWait = assistantMessage('a1', [
      {
        type: 'tool_call',
        partId: 'c1',
        toolCallId: 'call-vibe-spawn',
        toolName: 'vibe_spawn',
        status: 'completed',
        input: { cli: 'fast', name: 'home-disk-usage', prompt: 'Inspect $HOME' },
      },
      {
        type: 'tool_result',
        partId: 'r1',
        toolCallId: 'call-vibe-spawn',
        toolName: 'vibe_spawn',
        isError: false,
        output: {
          content: [{ type: 'text', text: 'Spawned fast session `home-disk-usage-2` (turn job `home-disk-usage-2-t1`).' }],
          details: { op: 'spawn', spawned: { id: 'home-disk-usage-2', cli: 'fast', jobId: 'home-disk-usage-2-t1' } },
        },
      },
      {
        type: 'tool_call',
        partId: 'c2',
        toolCallId: 'call-vibe-wait',
        toolName: 'vibe_wait',
        status: 'completed',
        input: { sessions: ['home-disk-usage-2'] },
      },
      {
        type: 'tool_result',
        partId: 'r2',
        toolCallId: 'call-vibe-wait',
        toolName: 'vibe_wait',
        isError: false,
        output: {
          content: [{
            type: 'text',
            text: [
              '## `home-disk-usage-2` — completed',
              '<vibe-turn session="home-disk-usage-2" cli="fast" turn="1" status="completed" duration="1.5s">',
              '<activity tool-calls="2" requests="2">',
              '- bash(du -sh ~/*)',
              '</activity>',
              '<response>',
              '### Disk Usage',
              'Top directory is `~/Downloads`.',
              '</response>',
              'Session `home-disk-usage-2` is idle and retains this conversation — continue it with vibe_send. Transcript: history://home-disk-usage-2',
              '</vibe-turn>',
            ].join('\n'),
          }],
          details: {
            op: 'wait',
            wait: {
              settled: [{ id: 'home-disk-usage-2', jobId: 'home-disk-usage-2-t1', status: 'completed' }],
              stillRunning: [],
              timedOut: false,
            },
          },
        },
      },
    ]);

    const waitReports = collectSubagentReports([spawnAndWait]);
    const foundWait = findSubagentReport(waitReports, {
      subagentId: 'home-disk-usage-2',
      toolCallId: 'call-vibe-spawn',
    });
    expect(foundWait?.state).toBe('completed');
    expect(foundWait?.output).toBe('### Disk Usage\nTop directory is `~/Downloads`.');

    const asyncVibeNotice: Message = {
      messageId: 'n-vibe',
      sessionId: 'parent',
      turnId: 'turn-2',
      role: 'system',
      createdAt: 2,
      parts: [
        {
          type: 'notice',
          partId: 'np-vibe',
          noticeType: 'async_job_result',
          level: 'info',
          details: {
            jobs: [
              {
                jobId: 'home-disk-usage-2-t1',
                subagentId: 'home-disk-usage-2',
                childSessionId: 'uuid-vibe-2',
                type: 'task',
                status: 'completed',
                label: 'vibe fast home-disk-usage-2: Inspect $HOME',
                durationMs: 1500,
                reportText: [
                  '<vibe-turn session="home-disk-usage-2" cli="fast" turn="1" status="completed" duration="1.5s">',
                  '<response>',
                  '### Final Summary',
                  '12.4 GB total.',
                  '</response>',
                  '</vibe-turn>',
                ].join('\n'),
              },
            ],
          },
        },
      ],
    };

    const noticeReports = collectSubagentReports([spawnAndWait, asyncVibeNotice]);
    const foundNotice = findSubagentReport(noticeReports, {
      subagentId: 'home-disk-usage-2',
      childSessionId: 'uuid-vibe-2',
      toolCallId: 'call-vibe-spawn',
    });
    expect(foundNotice?.output).toBe('### Final Summary\n12.4 GB total.');
    expect(foundNotice?.durationMs).toBe(1500);

    const proseWithVibeExample: Message = {
      messageId: 'n-prose',
      sessionId: 'parent',
      turnId: 'turn-3',
      role: 'system',
      createdAt: 3,
      parts: [
        {
          type: 'notice',
          partId: 'np-prose',
          noticeType: 'async_job_result',
          level: 'info',
          details: {
            jobs: [
              {
                jobId: 'task-1',
                subagentId: 'TaskScout',
                type: 'task',
                status: 'completed',
                reportText: 'Found parser bug.\n\nExample:\n<vibe-turn session="ex"><response>sample</response></vibe-turn>',
              },
            ],
          },
        },
      ],
    };
    const proseReports = collectSubagentReports([proseWithVibeExample]);
    expect(findSubagentReport(proseReports, { subagentId: 'TaskScout' })?.output).toBe(
      'Found parser bug.\n\nExample:\n<vibe-turn session="ex"><response>sample</response></vibe-turn>',
    );
  });
});
