import React from 'react';
import { describe, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { UpdateInfo } from '@/lib/desktop';

const Container = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
mock.module('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: React.PropsWithChildren<{ open: boolean }>) => open ? <div>{children}</div> : null,
  DialogContent: Container,
  DialogTitle: Container,
}));
mock.module('@/components/ui/ScrollableOverlay', () => ({ ScrollableOverlay: Container }));
mock.module('@/components/chat/MarkdownRenderer', () => ({
  SimpleMarkdownRenderer: ({ content }: { content: string }) => <pre>{content}</pre>,
}));
mock.module('@/components/icon/Icon', () => ({ Icon: () => null }));
mock.module('@/components/ui/spinner', () => ({ Spinner: () => <span data-testid="spinner" /> }));
mock.module('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
  getCurrentIntlLocale: () => 'en-US',
}));
mock.module('@/lib/url', () => ({ openExternalUrl: async () => undefined }));

const { UpdateDialog } = await import('./UpdateDialog');

const info: UpdateInfo = {
  available: true,
  currentVersion: '1.0.0',
  version: '1.1.0',
};
const props = {
  open: true,
  onOpenChange: () => undefined,
  info,
  downloading: false,
  downloaded: false,
  progress: null,
  error: null,
  onDownload: () => undefined,
  onRestart: () => undefined,
};
const render = (overrides: Partial<React.ComponentProps<typeof UpdateDialog>> = {}) => (
  renderToStaticMarkup(<UpdateDialog {...props} {...overrides} />)
);

describe('stable desktop update dialog', () => {
  test('offers the fork release and download without a phantom server-update spinner', () => {
    const html = render();
    expect(html).toContain('1.0.0');
    expect(html).toContain('1.1.0');
    expect(html).toContain('https://github.com/Shizuku-Yume/ohpichamber/releases/tag/v1.1.0');
    expect(html).toContain('updateDialog.actions.downloadUpdate');
    expect(html).not.toContain('data-testid="spinner"');
    expect(html).not.toContain('installingUpdate');
  });

  test('renders sorted stable release sections and their notes', () => {
    const html = render({ info: {
      ...info,
      body: '## [1.0.1] - 2026-01-01\n### Fixes\n- Older fix.\n\n## [1.1.0] - 2026-02-01\n### New\n- New feature.',
    } });
    expect(html.indexOf('v1.1.0')).toBeLessThan(html.indexOf('v1.0.1'));
    expect(html).toContain('Older fix.');
    expect(html).toContain('New feature.');
    expect(html).not.toContain('data-testid="spinner"');
  });

  test('keeps arbitrary GitHub release notes readable', () => {
    expect(render({ info: { ...info, body: 'A plain release note.' } })).toContain('A plain release note.');
  });

  test.each([null, { ...info, body: '' }, { ...info, body: '   ' }])('handles missing or empty notes', (emptyInfo) => {
    const html = render({ info: emptyInfo });
    expect(html).not.toContain('<pre>');
    expect(html).not.toContain('data-testid="spinner"');
  });

  test('shows the updater error without a removed CLI update command', () => {
    const html = render({ error: 'Download failed' });
    expect(html).toContain('Download failed');
    expect(html).not.toContain('updateViaTerminal');
  });

  test('shows download progress instead of another download action', () => {
    const html = render({ downloading: true, progress: { downloaded: 3, total: 4 } });
    expect(html).toContain('75%');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('updateDialog.actions.downloadUpdate');
  });

  test('offers restart only after download, and disables it while installing', () => {
    const downloaded = render({ downloaded: true });
    expect(downloaded).toContain('updateDialog.actions.restartToUpdate');
    expect(downloaded).not.toContain('updateDialog.actions.downloadUpdate');
    const installing = render({ downloaded: true, installing: true });
    expect(installing).toContain('updateDialog.status.restarting');
    expect(installing).toContain('disabled=""');
    expect(installing).not.toContain('updateDialog.actions.restartToUpdate');
  });

  test('renders nothing when closed', () => {
    expect(render({ open: false })).toBe('');
  });
});
