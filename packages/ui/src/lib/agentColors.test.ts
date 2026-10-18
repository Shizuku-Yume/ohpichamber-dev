import { expect, test } from 'bun:test';
import { createAgentColorResolver } from './agentColors';
import { getDefaultTheme, getThemeById } from './theme/themes';
import { chromaticDistance } from './theme/color';
import type { Theme } from '@/types/theme';

const roster = ['architect', 'build', 'plan', 'simplifier'].map((agentId) => ({ agentId, name: agentId }));
// 'var(--syntax-keyword)' -> '--syntax-keyword'
const tokenOf = ({ color }: { color: string }) => color.slice(4, -1);
function colorValue(theme: Theme, token: string) {
  const values = new Map<string, string>(Object.entries(theme.colors.syntax.base).map(([key, value]) => [`--syntax-${key}`, value]));
  values.set('--status-success', theme.colors.status.success);
  const value = values.get(token);
  if (!value) throw new Error(`Missing color ${token}`);
  return value;
}

test('Build keeps success and four visible agents get distinct Monokai colors', () => {
  for (const id of ['monokai-dark', 'monokai-light']) {
    const theme = getThemeById(id);
    if (!theme) throw new Error(`Missing theme ${id}`);
    const resolve = createAgentColorResolver(theme, roster);
    expect(resolve('build')).toEqual({ color: 'var(--status-success)' });
    expect(new Set(roster.map(({ name }) => colorValue(theme, tokenOf(resolve(name))))).size).toBe(4);
    const resolved = roster.map(({ name }) => colorValue(theme, tokenOf(resolve(name))));
    for (let i = 0; i < resolved.length; i++) {
      for (let j = i + 1; j < resolved.length; j++) {
        expect(chromaticDistance(resolved[i], resolved[j], theme.colors.surface.elevated, theme.colors.surface.background)).toBeGreaterThanOrEqual(0.055);
      }
    }
  }
});

test('aliases, near-duplicates and the Build green do not consume separate palette slots', () => {
  const theme = structuredClone(getDefaultTheme(true));
  Object.assign(theme.colors.syntax.base, {
    keyword: '#e888aa', operator: '#e989ab', type: '#66ccee', number: '#eebb66',
    function: theme.colors.status.success, string: theme.colors.status.success,
  });
  const resolve = createAgentColorResolver(theme, roster);
  const selected = roster.map(({ name }) => colorValue(theme, tokenOf(resolve(name))));
  expect(new Set(selected).size).toBe(4);
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      expect(chromaticDistance(selected[i], selected[j], theme.colors.surface.background, theme.colors.surface.background)).toBeGreaterThanOrEqual(0.055);
    }
  }
  for (const { name } of roster.filter(({ name }) => name !== 'build')) {
    expect(resolve(name).color.startsWith('var(--syntax-')).toBe(true);
    expect(chromaticDistance(colorValue(theme, tokenOf(resolve(name))), theme.colors.status.success, theme.colors.surface.background, theme.colors.surface.background)).toBeGreaterThanOrEqual(0.055);
  }
});

test('roster order and renamed labels preserve ID assignments', () => {
  const theme = getDefaultTheme(true);
  const first = createAgentColorResolver(theme, roster);
  const reordered = createAgentColorResolver(theme, [...roster].reverse());
  const renamed = createAgentColorResolver(theme, roster.map((agent) => ({ ...agent, name: 'Same display name' })));
  for (const { agentId } of roster) {
    expect(reordered(agentId)).toEqual(first(agentId));
    expect(renamed(agentId)).toEqual(first(agentId));
  }
  expect(first(undefined).color).toBe('var(--status-success)');
  expect(first('removed-agent')).toEqual(first('removed-agent'));
});

test('sparse palettes reuse syntax colors without borrowing new status colors', () => {
  const theme = structuredClone(getDefaultTheme(true));
  for (const key of ['keyword', 'type', 'function', 'number', 'string', 'operator', 'variable'] as const) {
    theme.colors.syntax.base[key] = '#dddddd';
  }
  const agents = Array.from({ length: 50 }, (_, index) => ({ agentId: `agent-${index}` }));
  const resolve = createAgentColorResolver(theme, agents);
  for (const { agentId: name } of agents) {
    expect(resolve(name).color.startsWith('var(--syntax-')).toBe(true);
    expect(colorValue(theme, tokenOf(resolve(name)))).toBe('#dddddd');
  }
  expect(resolve('build').color).toBe('var(--status-success)');
});

test('duplicate labels retain distinct colors by ID and build labels are not aliases', () => {
  const agents = [
    { agentId: 'review-a', name: 'build' },
    { agentId: 'review-b', name: 'build' },
  ];
  const resolve = createAgentColorResolver(getDefaultTheme(true), agents);
  expect(resolve('review-a')).not.toEqual(resolve('review-b'));
  expect(resolve('review-a').color.startsWith('var(--syntax-')).toBe(true);
});
