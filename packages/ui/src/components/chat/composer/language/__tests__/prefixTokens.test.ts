import { describe, expect, test } from 'bun:test';
import { collectKnownTokenNames, filterKnownTokens, scanPrefixTokens } from '../prefixTokens';

describe('native prefix tokens', () => {
  test('recognizes command and template group names verbatim', () => {
    const text = '/team/review.pr auth';
    expect(scanPrefixTokens(text, '/')).toEqual([{ start: 0, end: 15, prefix: '/', name: 'team/review.pr' }]);
    expect(filterKnownTokens(scanPrefixTokens(text, '/'), new Set(['team/review.pr']))).toHaveLength(1);
  });
  test('supports Unicode native names and underscores', () => {
    const text = '/团队/审查 $My_Skill';
    expect(scanPrefixTokens(text, '/').map(token => token.name)).toEqual(['团队/审查']);
    expect(scanPrefixTokens(text, '$').map(token => token.name)).toEqual(['My_Skill']);
  });
  test('requires a whitespace boundary and keeps document offsets', () => {
    const text = 'not/path\n run /review then $plan';
    const tokens = scanPrefixTokens(text, '/');
    expect(tokens.map(token => text.slice(token.start, token.end))).toEqual(['/review']);
    expect(scanPrefixTokens('a$plan', '$')).toEqual([]);
    expect(scanPrefixTokens('https://example.test', '/')).toEqual([]);
  });
  test('returns no tokens for empty input or unrelated sigils', () => {
    expect(scanPrefixTokens('', '/')).toEqual([]);
    expect(scanPrefixTokens('#snippet plain text', '/')).toEqual([]);
    expect(scanPrefixTokens('/review', '$')).toEqual([]);
  });
  test('syntax alone does not establish catalog membership', () => {
    const tokens = scanPrefixTokens('/review /missing /team/a', '/');
    expect(filterKnownTokens(tokens, new Set(['review', 'team/a'])).map(token => token.name)).toEqual(['review', 'team/a']);
    expect(filterKnownTokens(tokens, new Set())).toEqual([]);
  });
  test('collects each authoritative skill name once in first occurrence order', () => {
    expect(collectKnownTokenNames('$Plan $Review $Plan $missing', '$', new Set(['Plan', 'Review']), 'exact')).toEqual(['Plan', 'Review']);
    expect(collectKnownTokenNames('$plan $Plan', '$', new Set(['Plan']), 'exact')).toEqual(['Plan']);
  });
  test('command and template highlighting may compare names case-insensitively', () => {
    const tokens = scanPrefixTokens('/Review /TEAM/A', '/');
    expect(filterKnownTokens(tokens, new Set(['review', 'team/a'])).map(token => token.name)).toEqual(['Review', 'TEAM/A']);
  });
});
