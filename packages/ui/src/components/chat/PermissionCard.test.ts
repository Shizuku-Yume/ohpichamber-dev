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

<<<<<<< HEAD
  test('names the exact allowance target and treats the native wildcard as tool scope', () => {
    expect(getApprovalPolicyTitle(approval({}))).toBeUndefined();
    expect(getApprovalPolicyTitle(approval({
      policyTarget: { toolName: 'bash', pattern: 'git status' },
    }))).toBe('bash: git status');
    const toolScope = approval({ policyTarget: { toolName: 'bash', pattern: '*' } });
    expect(getApprovalPolicyTitle(toolScope)).toBe('bash: *');
    expect(isToolScopePolicy(toolScope)).toBe(true);
    expect(isToolScopePolicy(approval({ policyTarget: { toolName: 'bash', pattern: 'git status' } }))).toBe(false);
=======
  test('preserves distinct permission patterns', () => {
    const command = 'bunx eslint "src/components/session/SessionSidebar.tsx"';

    expect(getVisiblePermissionPatterns(['bunx eslint *', command], command)).toEqual(['bunx eslint *']);
  });
});

describe('summarizePermission', () => {
  test('shows an external directory without its glob and names the file that triggered it', () => {
    const metadata = permissionSummaryMetadataSchema.parse({ filepath: '/home/me/.config/app/themes/jade.json', parentDir: '/home/me/.config/app/themes' });
    const summary = summarizePermission('external_directory', ['/home/me/.config/app/themes/*'], metadata, true);
    expect(summary.titleKey).toBe('chat.permissionCard.summary.externalDirectory');
    expect(summary.targets).toEqual([{ value: '/home/me/.config/app/themes', isPath: true, file: 'jade.json' }]);
    expect(summary.metadataExplained).toBe(true);
  });

  test('keeps the raw details available for tools it cannot explain', () => {
    const summary = summarizePermission('linear_create_issue', ['*'], permissionSummaryMetadataSchema.parse({ title: 'x' }), true);
    expect(summary).toEqual({ titleKey: 'chat.permissionCard.summary.tool', tool: 'linear_create_issue', targets: [], metadataExplained: false });
  });

  test('reports a search scope and ignores malformed metadata', () => {
    expect(summarizePermission('grep', ['TODO'], permissionSummaryMetadataSchema.parse({ path: 'src' }), true).scope).toBe('src');
    expect(summarizePermission('glob', ['*.ts'], permissionSummaryMetadataSchema.parse({ path: 42 }), true).scope).toBeUndefined();
  });
});

describe('describeSavePatterns', () => {
  test('hides a whole-capability save and shows directories without globs', () => {
    expect(describeSavePatterns('read', ['*'])).toEqual([]);
    expect(describeSavePatterns('external_directory', ['/home/me/.config/*'])).toEqual(['/home/me/.config']);
    expect(describeSavePatterns('shell', ['git *'])).toEqual(['git *']);
  });
});

describe('always allow without anything to save', () => {
  // OpenCode's question tool asks with no `save`; an "always" reply then saves nothing.
  test('offers always only when the request has patterns to save', () => {
    expect(canSavePermission(undefined)).toBe(false);
    expect(canSavePermission([])).toBe(false);
    expect(canSavePermission(['*'])).toBe(true);
    expect(canSavePermission(['git *'])).toBe(true);
  });

  // SAFETY: shortcut matching reads only the fields set here.
  const press = (key: string, shiftKey = false, modifiers: Partial<KeyboardEvent> = {}) => ({
    key, code: key, shiftKey, altKey: true, metaKey: false, ctrlKey: false, ...modifiers,
  }) as KeyboardEvent;

  test('Alt+Shift+Enter sends nothing when there is nothing to save', () => {
    expect(permissionShortcutReply(press('Enter', true), false)).toBeNull();
    expect(permissionShortcutReply(press('Enter'), false)).toBe('once');
    expect(permissionShortcutReply(press('Backspace'), false)).toBe('reject');
  });

  test('Alt+Shift+Enter still answers always when there is something to save', () => {
    expect(permissionShortcutReply(press('Enter', true), true)).toBe('always');
    expect(permissionShortcutReply(press('Enter'), true)).toBe('once');
    expect(permissionShortcutReply(press('Enter', false, { altKey: false }), true)).toBeNull();
    expect(permissionShortcutReply(press('Enter', false, { metaKey: true }), true)).toBeNull();
  });

  test('rebinding moves the reply to the new key and frees the old one', () => {
    const overrides = { permission_allow_once: 'alt+y', permission_deny: '__unassigned__' };
    expect(permissionShortcutReply(press('y', false, { code: 'KeyY' }), false, overrides)).toBe('once');
    expect(permissionShortcutReply(press('Enter'), false, overrides)).toBeNull();
    expect(permissionShortcutReply(press('Backspace'), false, overrides)).toBeNull();
>>>>>>> bc50ba56a
  });
});
