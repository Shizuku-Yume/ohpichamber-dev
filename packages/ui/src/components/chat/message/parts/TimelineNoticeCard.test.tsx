import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TimelineNoticeCard } from './TimelineNoticeCard';
import { I18nProvider } from '@/lib/i18n';
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
});
