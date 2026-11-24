import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { plugin } from 'bun';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider, useI18nStore } from '@/lib/i18n';
import { SyncProvider } from '@/sync/sync-context';
import { parseNativeSearchOutput } from '@/lib/native-web-search';

// Resolve the production worker asset under Bun, without replacing a module.
plugin({
  name: 'native-search-worker-url', setup(build) {
    build.onLoad({ filter: /markdown-shiki\.worker\.ts\?worker&url$/ }, ({ path }) => ({ contents: `export default ${JSON.stringify(pathToFileURL(path.split('?')[0]).href)};`, loader: 'js' }));
  }
});
const { WebSearchResults } = await import('./WebSearchResults');
// Static loading cannot work here: Bun must register the real worker URL
// loader above before evaluating the MarkdownRenderer dependency graph.
const { loadMarkdownRendererModule } = await import('@/components/chat/markdownRendererLoader');

beforeAll(async () => {
  await loadMarkdownRendererModule();
});

beforeEach(() => {
  useI18nStore.getState().setLocale('en');
});

describe('native search result cards', () => {
  test('renders canonical source titles, links, dates and native provider identity', () => {
    const output = parseNativeSearchOutput({ content: [{ type: 'text', text: 'Sources' }], details: { response: { provider: 'native-provider', sources: [{ title: 'Primary evidence', url: 'https://example.com/evidence', snippet: 'Source excerpt', publishedDate: '2d ago' }], citations: [{ title: 'Supporting citation', url: 'https://example.com/citation', citedText: 'Supporting passage' }] } } });
    if (!output) throw new Error('Native fixture must parse');
    const html = renderToStaticMarkup(<SyncProvider directory="/repo"><I18nProvider><WebSearchResults output={output} /></I18nProvider></SyncProvider>);
    expect(html).toContain('Primary evidence');
    expect(html).toContain('href="https://example.com/evidence"');
    expect(html).toContain('Source excerpt');
    expect(html).toContain('2d ago');
    expect(html).toContain('native-provider');
    expect(html).toContain('Supporting citation');
    expect(html).toContain('Supporting passage');
  });
  test('native execution errors are visible rather than silently displaying success', () => {
    const output = parseNativeSearchOutput({ content: [{ type: 'text', text: 'Search failed' }], details: { error: 'Search transport failed', response: { provider: 'none', sources: [] } } });
    if (!output) throw new Error('Native failure fixture must parse');
    const html = renderToStaticMarkup(<SyncProvider directory="/repo"><I18nProvider><WebSearchResults output={output} /></I18nProvider></SyncProvider>);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Search transport failed');
  });
  test('surfaces synthesized response.answer and compact details.failures notice alongside sources', () => {
    const output = parseNativeSearchOutput({
      content: [{ type: 'text', text: 'Sources' }],
      details: {
        response: {
          provider: 'perplexity',
          answer: 'Bun 1.3 supports **native** workspaces.',
          sources: [
            { title: 'Bun Docs', url: 'https://bun.sh/docs', snippet: 'Workspace guide' },
          ],
        },
        failures: [
          { provider: 'brave', label: 'Brave', reason: 'HTTP 429 rate limited', status: 429 },
          { provider: 'exa', label: 'Exa', reason: 'Timed out' },
        ],
      },
    });
    if (!output) throw new Error('Native answer/failures fixture must parse');
    const html = renderToStaticMarkup(<SyncProvider directory="/repo"><I18nProvider><WebSearchResults output={output} /></I18nProvider></SyncProvider>);
    expect(html).toContain('data-testid="web-search-answer"');
    expect(html).toContain('Bun 1.3 supports');
    expect(html).toContain('data-testid="web-search-failures"');
    expect(html).toContain('Brave');
    expect(html).toContain('429');
    expect(html).toContain('HTTP 429 rate limited');
    expect(html).toContain('Exa');
    expect(html).toContain('Timed out');
    expect(html).toContain('Bun Docs');
  });
  test('omits empty/whitespace answer and failures blocks when absent', () => {
    const output = parseNativeSearchOutput({
      content: [{ type: 'text', text: 'Sources' }],
      details: {
        response: {
          provider: 'brave',
          answer: '   \n  ',
          sources: [{ title: 'Source', url: 'https://example.com' }],
        },
        failures: [],
      },
    });
    if (!output) throw new Error('Fixture must parse');
    const html = renderToStaticMarkup(<SyncProvider directory="/repo"><I18nProvider><WebSearchResults output={output} /></I18nProvider></SyncProvider>);
    expect(html).not.toContain('data-testid="web-search-answer"');
    expect(html).not.toContain('data-testid="web-search-failures"');
  });
});
