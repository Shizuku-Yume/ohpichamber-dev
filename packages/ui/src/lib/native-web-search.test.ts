import { describe, expect, test } from 'bun:test';
import { parseNativeSearchOutput } from './native-web-search';

const native = {
  content: [{ type: 'text', text: '[1] Native result\n    https://example.com/source' }],
  details: { response: { provider: 'perplexity', answer: 'A sourced answer.', sources: [{ title: 'Native result', url: 'https://example.com/source', publishedDate: '2d ago', snippet: 'Native source excerpt.' }], citations: [{ title: 'Evidence', url: 'https://example.com/evidence', citedText: 'Quoted evidence.' }] } },
};
describe('native web search result boundary', () => {
  test('canonical live and persisted JSON output expose the same source cards and citations', () => {
    const live = parseNativeSearchOutput(native);
    const persisted = parseNativeSearchOutput(JSON.stringify(native));
    expect(live?.details.response.sources[0]).toMatchObject({ title: 'Native result', publishedDate: '2d ago' });
    expect(live?.details.response.answer).toBe('A sourced answer.');
    expect(live?.details.response.citations?.[0]?.citedText).toBe('Quoted evidence.');
    expect(persisted).toEqual(live);
  });
  test('legacy markdown and guessed response wrappers do not become native result cards', () => {
    expect(parseNativeSearchOutput('## [Legacy](https://example.com)\nPublished: 2026-01-01')).toBeNull();
    expect(parseNativeSearchOutput({ response: native.details.response })).toBeNull();
    expect(parseNativeSearchOutput({ content: native.content, details: { response: { provider: 'p', results: [] } } })).toBeNull();
  });
  test('untrusted links cannot reach clickable search cards', () => {
    expect(parseNativeSearchOutput({ ...native, details: { response: { provider: 'p', sources: [{ title: 'unsafe', url: 'javascript:alert(1)' }] } } })).toBeNull();
  });
  test('native tool errors remain available to the result renderer', () => {
    const result = parseNativeSearchOutput({ ...native, details: { ...native.details, error: 'Provider refused the request' } });
    expect(result?.details.error).toBe('Provider refused the request');
  });
  test('provider fallback failures are preserved on details.failures', () => {
    const result = parseNativeSearchOutput({
      ...native,
      details: {
        ...native.details,
        failures: [{ provider: 'brave', label: 'Brave', reason: 'HTTP 429 rate limited', status: 429 }],
      },
    });
    expect(result?.details.failures).toEqual([
      { provider: 'brave', label: 'Brave', reason: 'HTTP 429 rate limited', status: 429 },
    ]);
  });
});
