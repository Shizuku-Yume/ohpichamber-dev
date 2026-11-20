import { describe, expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { I18nProvider } from '@/lib/i18n';
import { ReadToolGroup, type ReadToolGroupItem } from './ReadToolGroup';

describe('ReadToolGroup component', () => {
  test('renders collapsible header with count and preview', () => {
    const items: ReadToolGroupItem[] = [
      {
        part: { type: 'tool_call', partId: 'p1', toolCallId: 'c1', toolName: 'read', input: { path: 'src/a.ts' }, status: 'completed' },
        path: 'src/a.ts',
        isError: false,
        isRunning: false,
      },
      {
        part: { type: 'tool_call', partId: 'p2', toolCallId: 'c2', toolName: 'read', input: { path: 'src/b.ts' }, status: 'completed' },
        path: 'src/b.ts',
        isError: false,
        isRunning: false,
      },
    ];

    const html = renderToString(<I18nProvider><ReadToolGroup items={items} directory="/repo" /></I18nProvider>);
    expect(html).toContain('data-read-tool-group');
    expect(html).toContain('Read (2)');
    expect(html).toContain('src/a.ts');
  });

  test('internal URIs like proc:// and agent:// are rendered as non-interactive labels', () => {
    const items: ReadToolGroupItem[] = [
      {
        part: { type: 'tool_call', partId: 'p1', toolCallId: 'c1', toolName: 'read', input: { path: 'proc://bg_1' }, status: 'completed' },
        path: 'proc://bg_1',
        isError: false,
        isRunning: false,
      },
      {
        part: { type: 'tool_result', partId: 'p2', toolCallId: 'c2', toolName: 'read', isError: true, error: 'Permission denied', output: {} },
        path: 'src/secret.ts',
        isError: true,
        isRunning: false,
        errorMessage: 'Permission denied',
      },
    ];

    const html = renderToString(<I18nProvider><ReadToolGroup items={items} directory="/repo" initialExpanded /></I18nProvider>);
    expect(html).toContain('Read (2)');
    expect(html).toContain('failed');
    expect(html).toContain('proc://bg_1');
    expect(html).toContain('src/secret.ts');
    expect(html).toContain('Permission denied');
  });
});
