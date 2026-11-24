import { describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import { useSubagentsStore } from '@/stores/useSubagentsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { renderToStaticMarkup } from 'react-dom/server';
import { TimelineNoticeCard } from './TimelineNoticeCard';
import { SyncProvider } from '@/sync/sync-context';
import { I18nProvider } from '@/lib/i18n';
import { ChatColumnActionsContext, ChatColumnSessionContext } from '@/components/chat/chatColumnSession';
import type { NoticePart } from '@openchamber/agent-contract';

const renderCard = (notice: NoticePart) => renderToStaticMarkup(
  <I18nProvider>
    <TimelineNoticeCard notice={notice} />
  </I18nProvider>
);
describe('TimelineNoticeCard', () => {
  test('renders todo_reminder notice with incomplete checklist', () => {
    const notice: NoticePart = {
      type: 'notice',
      partId: 'n1',
      noticeType: 'todo_reminder',
      level: 'warning',
      details: {
        attempt: 1,
        maxAttempts: 3,
        todos: [
          { content: 'Write tests', status: 'completed' },
          { content: 'Fix bug', status: 'pending' },
        ],
      },
    };
    const html = renderCard(notice);
    expect(html).toContain('data-timeline-notice');
    expect(html).toContain('data-notice-type="todo_reminder"');
    expect(html).toContain('1 incomplete todo');
  });

  test('renders ttsr_triggered notice with rules', () => {
    const notice: NoticePart = {
      type: 'notice',
      partId: 'n2',
      noticeType: 'ttsr_triggered',
      level: 'warning',
      details: {
        rules: [{ name: 'no-unwrap', description: 'Never unwrap Option without check' }],
      },
    };
    const html = renderCard(notice);
    expect(html).toContain('data-notice-type="ttsr_triggered"');
    expect(html).toContain('no-unwrap');
  });

  test('renders auto_retry_start notice with attempts and countdown', () => {
    const notice: NoticePart = {
      type: 'notice',
      partId: 'n3',
      noticeType: 'auto_retry_start',
      level: 'warning',
      details: {
        attempt: 2,
        maxAttempts: 5,
        delayMs: 3000,
        errorMessage: 'Connection timeout',
      },
    };
    const html = renderCard(notice);
    expect(html).toContain('data-notice-type="auto_retry_start"');
    expect(html).toContain('Auto-retry (attempt 2/5)');
  });

  test('renders retry_fallback_applied notice with from/to models', () => {
    const notice: NoticePart = {
      type: 'notice',
      partId: 'n4',
      noticeType: 'retry_fallback_applied',
      level: 'warning',
      details: {
        from: 'gpt-6.1-sol',
        to: 'gpt-6-astra',
        role: 'slow',
        reason: 'Rate limit reached',
      },
    };
    const html = renderCard(notice);
    expect(html).toContain('data-notice-type="retry_fallback_applied"');
    expect(html).toContain('gpt-6.1-sol');
    expect(html).toContain('gpt-6-astra');
  });

  test('renders served_model_mismatch notice', () => {
    const notice: NoticePart = {
      type: 'notice',
      partId: 'n5',
      noticeType: 'served_model_mismatch',
      level: 'warning',
      details: {
        requested: 'gpt-6.1-sol',
        served: 'gpt-6-luna',
        provider: 'CLIProxyAPI',
      },
    };
    const html = renderCard(notice);
    expect(html).toContain('data-notice-type="served_model_mismatch"');
    expect(html).toContain('gpt-6.1-sol');
    expect(html).toContain('gpt-6-luna');
  });

  test('renders cache_invalidation notice with reprocessed token count', () => {
    const notice: NoticePart = {
      type: 'notice',
      partId: 'n6',
      noticeType: 'cache_invalidation',
      level: 'info',
      details: {
        reprocessedTokens: 4096,
      },
    };
    const html = renderCard(notice);
    expect(html).toContain('data-notice-type="cache_invalidation"');
    expect(html).toContain('Prompt cache invalidated');
  });

  test('renders async_job_result single subagent notice with report and navigation links', () => {
    const notice: NoticePart = {
      type: 'notice',
      partId: 'n7',
      noticeType: 'async_job_result',
      level: 'info',
      details: {
        jobs: [
          {
            jobId: 'job-1',
            subagentId: 'ScoutAuth',
            childSessionId: 'child-ses-1',
            type: 'task',
            status: 'completed',
            label: 'ScoutAuth',
            durationMs: 4200,
            reportText: 'Found **2** auth handlers.',
          },
        ],
      },
    };

    const collapsedHtml = renderCard(notice);
    expect(collapsedHtml).toContain('data-notice-type="async_job_result"');
    expect(collapsedHtml).toContain('Subagent result: ScoutAuth');
    expect(collapsedHtml).not.toContain('Found');

    const expandedHtml = renderToStaticMarkup(
      <I18nProvider>
        <TimelineNoticeCard notice={notice} directory="/workspace" defaultExpanded />
      </I18nProvider>,
    );
    expect(expandedHtml).toContain('ScoutAuth');
    expect(expandedHtml).toContain('Open session');
    expect(expandedHtml).toContain('Open in the Subagents panel');
    expect(expandedHtml).toContain('Found **2** auth handlers.');
  });

  test('renders async_job_result multi-job and failed job titles cleanly', () => {
    const failedNotice: NoticePart = {
      type: 'notice',
      partId: 'n8',
      noticeType: 'async_job_result',
      level: 'error',
      details: {
        jobs: [
          { jobId: 'bash-1', type: 'bash', status: 'failed', label: 'bun test', reportText: 'exit 1' },
        ],
      },
    };
    const multiNotice: NoticePart = {
      type: 'notice',
      partId: 'n9',
      noticeType: 'async_job_result',
      level: 'info',
      details: {
        jobs: [
          { jobId: 'j1', subagentId: 'S1', type: 'task', status: 'completed', reportText: 'Done 1' },
          { jobId: 'j2', subagentId: 'S2', type: 'task', status: 'completed', reportText: 'Done 2' },
        ],
      },
    };

    expect(renderCard(failedNotice)).toContain('Background job failed: bun test');
    expect(renderCard(multiNotice)).toContain('2 subagent results');
  });

  test('expands async_job_result interactively and opens SubagentsPanel or child session via store fallback', async () => {
    const happyWindow = new Window({ url: 'http://localhost' });
    const globals = {
      window: happyWindow, document: happyWindow.document, navigator: happyWindow.navigator,
      localStorage: happyWindow.localStorage,
      Node: happyWindow.Node, Text: happyWindow.Text, Element: happyWindow.Element, HTMLElement: happyWindow.HTMLElement,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const descriptors = Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
    for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    const prevUI = useUIStore.getState();
    const prevSessionUI = useSessionUIStore.getState();
    const prevSubagents = useSubagentsStore.getState();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      useUIStore.setState({ isMobile: false, contextPanelByDirectory: {} });
      useSessionUIStore.setState({ currentSessionId: 'parent-1', currentSessionDirectory: '/workspace' });
      useSubagentsStore.setState({
        byParent: {
          'parent-1': [
            {
              subagentId: 'ScoutAuth',
              parentSessionId: 'parent-1',
              childSessionId: 'child-ses-from-store',
              role: 'scout',
              name: 'ScoutAuth',
              status: 'completed',
            },
          ],
        },
      });

      const notice: NoticePart = {
        type: 'notice',
        partId: 'n10',
        noticeType: 'async_job_result',
        level: 'info',
        details: {
          jobs: [
            { jobId: 'ScoutAuth', subagentId: 'ScoutAuth', type: 'task', status: 'completed', reportText: 'Report body' },
          ],
        },
      };

      await act(async () => {
        root.render(
          <SyncProvider directory="/workspace">
            <I18nProvider>
              <TimelineNoticeCard notice={notice} sessionId="parent-1" directory="/workspace" />
            </I18nProvider>
          </SyncProvider>,
        );
      });

      const toggle = container.querySelector<HTMLButtonElement>('button[aria-expanded="false"]');
      expect(toggle).not.toBeNull();
      await act(async () => {
        toggle?.click();
      });
      expect(container.textContent).toContain('Report body');

      const openSessionBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Open session'));
      expect(openSessionBtn).not.toBeUndefined();
      await act(async () => {
        openSessionBtn?.click();
      });
      expect(useUIStore.getState().contextPanelByDirectory['/workspace']?.tabs).toMatchObject([
        { mode: 'chat', dedupeKey: 'session:child-ses-from-store', readOnly: true },
      ]);

      const openPanelBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Open in the Subagents panel"]');
      expect(openPanelBtn).not.toBeNull();
      await act(async () => {
        openPanelBtn?.click();
      });
      expect(useUIStore.getState().contextPanelByDirectory['/workspace']?.tabs).toEqual(
        expect.arrayContaining([expect.objectContaining({ mode: 'subagents' })]),
      );
    } finally {
      await act(async () => { root.unmount(); });
      useUIStore.setState(prevUI);
      useSessionUIStore.setState(prevSessionUI);
      useSubagentsStore.setState(prevSubagents);
      await happyWindow.happyDOM.abort();
      for (const [name, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    }
  });

  test('resolves sessionId and directory from pinned column selection when props are omitted', async () => {
    const happyWindow = new Window({ url: 'http://localhost' });
    const globals = {
      window: happyWindow, document: happyWindow.document, navigator: happyWindow.navigator,
      localStorage: happyWindow.localStorage,
      Node: happyWindow.Node, Text: happyWindow.Text, Element: happyWindow.Element, HTMLElement: happyWindow.HTMLElement,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const descriptors = Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
    for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    const prevUI = useUIStore.getState();
    const prevSessionUI = useSessionUIStore.getState();
    const prevSubagents = useSubagentsStore.getState();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const opened: Array<{ sessionId: string; directory: string | null }> = [];

    try {
      useUIStore.setState({ isMobile: false, contextPanelByDirectory: {} });
      useSessionUIStore.setState({ currentSessionId: 'main-session', currentSessionDirectory: '/main-dir' });
      useSubagentsStore.setState({
        byParent: {
          'pinned-parent': [
            {
              subagentId: 'PinnedScout',
              parentSessionId: 'pinned-parent',
              childSessionId: 'pinned-child-session',
              role: 'scout',
              name: 'PinnedScout',
              status: 'completed',
            },
          ],
        },
      });

      const notice: NoticePart = {
        type: 'notice',
        partId: 'n11',
        noticeType: 'async_job_result',
        level: 'info',
        details: {
          jobs: [
            { jobId: 'PinnedScout', subagentId: 'PinnedScout', type: 'task', status: 'completed', reportText: 'Pinned report' },
          ],
        },
      };

      await act(async () => {
        root.render(
          <SyncProvider directory="/pinned-dir">
            <I18nProvider>
              <ChatColumnSessionContext.Provider value={{ sessionId: 'pinned-parent', directory: '/pinned-dir' }}>
                <ChatColumnActionsContext.Provider value={{
                  pinned: true,
                  openSession: (sid, dir) => { opened.push({ sessionId: sid, directory: dir }); },
                  openTimelineDialog: () => { },
                  focusInput: () => { },
                }}>
                  <TimelineNoticeCard notice={notice} defaultExpanded />
                </ChatColumnActionsContext.Provider>
              </ChatColumnSessionContext.Provider>
            </I18nProvider>
          </SyncProvider>,
        );
      });

      const openSessionBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Open session'));
      expect(openSessionBtn).not.toBeUndefined();
      await act(async () => {
        openSessionBtn?.click();
      });
      expect(opened).toEqual([{ sessionId: 'pinned-child-session', directory: '/pinned-dir' }]);
    } finally {
      await act(async () => { root.unmount(); });
      useUIStore.setState(prevUI);
      useSessionUIStore.setState(prevSessionUI);
      useSubagentsStore.setState(prevSubagents);
      await happyWindow.happyDOM.abort();
      for (const [name, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    }
  });
});
