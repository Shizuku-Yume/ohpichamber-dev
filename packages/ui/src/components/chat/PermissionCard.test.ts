import { describe, expect, test } from 'bun:test';
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import { I18nProvider } from '@/lib/i18n';
import { ThemeSystemContext, type ThemeContextValue } from '@/contexts/theme-system-context';
import { getDefaultTheme } from '@/lib/theme/themes';
import { PermissionRequestContent } from './PermissionCard';
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

const theme = getDefaultTheme(false);
const unexpectedThemeChange = (): never => { throw new Error('Theme must not change'); };
const themeContext: ThemeContextValue = {
  currentTheme: theme,
  availableThemes: [theme],
  setTheme: unexpectedThemeChange,
  customThemesLoading: false,
  reloadCustomThemes: unexpectedThemeChange,
  importTheme: unexpectedThemeChange,
  deleteImportedTheme: unexpectedThemeChange,
  customThemeIds: [],
  isSystemPreference: false,
  setSystemPreference: unexpectedThemeChange,
  themeMode: 'light',
  setThemeMode: unexpectedThemeChange,
  lightThemeId: theme.metadata.id,
  darkThemeId: getDefaultTheme(true).metadata.id,
  setLightThemePreference: unexpectedThemeChange,
  setDarkThemePreference: unexpectedThemeChange,
};

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

  test('renders details.input inside the expandable PermissionCard details disclosure', async () => {
    const happyWindow = new Window({ url: 'http://localhost' });
    const globals = {
      window: happyWindow,
      document: happyWindow.document,
      HTMLElement: happyWindow.HTMLElement,
      Element: happyWindow.Element,
      Node: happyWindow.Node,
      requestAnimationFrame: happyWindow.requestAnimationFrame.bind(happyWindow),
      cancelAnimationFrame: happyWindow.cancelAnimationFrame.bind(happyWindow),
      ResizeObserver: happyWindow.ResizeObserver,
      getComputedStyle: happyWindow.getComputedStyle.bind(happyWindow),
    };
    const previous = Object.keys(globals).map(
      (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
    );
    for (const [name, value] of Object.entries(globals)) {
      Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      const req = approval({
        toolName: 'edit',
        actionType: 'file_write',
        commandSummary: 'src/app.ts',
        details: {
          reason: 'Update target',
          path: 'src/app.ts',
          input: { input: '[src/app.ts#A1B2]\nPUT 1.=1:\n+next' },
        },
      });
      await act(async () => {
        root.render(
          React.createElement(
            I18nProvider,
            null,
            React.createElement(
              ThemeSystemContext.Provider,
              { value: themeContext },
              React.createElement(PermissionRequestContent, { permission: req }),
            ),
          ),
        );
      });
      const pre = container.querySelector('details pre');
      expect(pre).not.toBeNull();
      expect(pre?.textContent).toContain('"input"');
      expect(pre?.textContent).toContain('[src/app.ts#A1B2]');
    } finally {
      await act(async () => { root.unmount(); });
      await happyWindow.happyDOM.abort();
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, { ...descriptor });
        else Reflect.deleteProperty(globalThis, name);
      }
    }
  });
});
