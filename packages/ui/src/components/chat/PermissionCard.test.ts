import { describe, expect, test } from 'bun:test';
import { ApprovalRequestSchema, type ApprovalRequest } from '@openchamber/agent-contract';
import { getApprovalPolicyTitle, getApprovalPresentation, isToolScopePolicy } from './permissionPresentation';

const approval = (patch: Partial<ApprovalRequest>): ApprovalRequest => ApprovalRequestSchema.parse({
  approvalId: 'approval-1',
  sessionId: 'session-1',
  turnId: 'turn-1',
  toolCallId: 'tool-1',
  toolName: 'bash',
  actionType: 'bash_command',
  commandSummary: 'Run the command',
  details: {},
  status: 'pending',
  requestedAt: 1,
  version: '1',
  epoch: 'epoch-1',
  workerGeneration: 'worker-1',
  ...patch,
});

describe('native approval presentation', () => {
  test('names each native action type and keeps the tool as the subject', () => {
    expect(getApprovalPresentation(approval({ actionType: 'bash_command' }))).toEqual({
      titleKey: 'chat.permissionCard.summary.shell',
      icon: 'terminal-box',
    });
    expect(getApprovalPresentation(approval({ actionType: 'file_write', toolName: 'edit' }))).toEqual({
      titleKey: 'chat.permissionCard.summary.edit',
      icon: 'file-edit',
    });
    expect(getApprovalPresentation(approval({ actionType: 'network_request', toolName: 'fetch' }))).toEqual({
      titleKey: 'chat.permissionCard.summary.webfetch',
      icon: 'global',
    });
    expect(getApprovalPresentation(approval({ actionType: 'custom_tool', toolName: 'linear_create_issue' }))).toEqual({
      titleKey: 'chat.permissionCard.summary.tool',
      icon: 'tools',
    });
  });

  test('names the exact allowance target and treats the native wildcard as tool scope', () => {
    expect(getApprovalPolicyTitle(approval({}))).toBeUndefined();
    expect(getApprovalPolicyTitle(approval({
      policyTarget: { toolName: 'bash', pattern: 'git status' },
    }))).toBe('bash: git status');
    const toolScope = approval({ policyTarget: { toolName: 'bash', pattern: '*' } });
    expect(getApprovalPolicyTitle(toolScope)).toBe('bash: *');
    expect(isToolScopePolicy(toolScope)).toBe(true);
    expect(isToolScopePolicy(approval({ policyTarget: { toolName: 'bash', pattern: 'git status' } }))).toBe(false);
  });
});
