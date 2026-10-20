import { describe, expect, test } from 'bun:test';
import type { Agent } from '@openchamber/agent-contract';
import { getAgentDisplayName, getCycledAgentId } from './mobileControlsUtils';

type TestAgent = Pick<Agent, 'agentId' | 'name'>;
const agent = (agentId: string, name = agentId): TestAgent => ({ agentId, name });
const agents = [agent('build'), agent('plan'), agent('incident'), agent('review'), agent('helper')];

describe('getCycledAgentId', () => {
  test('without favorites cycles every enabled native profile', () => {
    expect(getCycledAgentId(agents, 'build')).toBe('plan');
    expect(getCycledAgentId(agents, 'review')).toBe('helper');
    expect(getCycledAgentId(agents, 'helper')).toBe('build');
    expect(getCycledAgentId(agents, 'build', -1)).toBe('helper');
  });

  test('cycles available favorites only in roster order', () => {
    const favorites = ['review', 'build'];
    expect(getCycledAgentId(agents, 'build', 1, favorites)).toBe('review');
    expect(getCycledAgentId(agents, 'review', 1, favorites)).toBe('build');
    expect(getCycledAgentId(agents, 'review', -1, favorites)).toBe('build');
  });

  test('enters favorites from an agent outside them', () => {
    expect(getCycledAgentId(agents, 'incident', 1, ['plan', 'review'])).toBe('plan');
    expect(getCycledAgentId(agents, 'incident', -1, ['plan', 'review'])).toBe('review');
  });

  test('a single favorite is fixed and unavailable favorites are ignored', () => {
    expect(getCycledAgentId(agents, 'plan', 1, ['plan'])).toBeNull();
    expect(getCycledAgentId(agents, 'build', 1, ['plan'])).toBe('plan');
    expect(getCycledAgentId(agents, 'build', 1, ['gone'])).toBe('plan');
  });

  test('empty, singleton and missing selections have deterministic outcomes', () => {
    expect(getCycledAgentId([], undefined)).toBeNull();
    expect(getCycledAgentId([agent('one')], 'one')).toBeNull();
    expect(getCycledAgentId([agent('one')], undefined)).toBe('one');
    expect(getCycledAgentId(agents, 'missing')).toBe('build');
    expect(getCycledAgentId(agents, 'missing', -1)).toBe('helper');
  });

  test('IDs, not duplicate or renamed display labels, identify favorites', () => {
    const roster = [agent('one', 'Same label'), agent('two', 'Same label')];
    expect(getCycledAgentId(roster, 'one', 1, ['Same label'])).toBe('two');
    expect(getCycledAgentId(roster, 'one', 1, ['two'])).toBe('two');
    expect(getCycledAgentId(roster.map((entry) => ({ ...entry, name: 'Renamed' })), 'two', 1, ['two'])).toBeNull();
  });
});

describe('getAgentDisplayName', () => {
  test('uses exact native names while selections remain IDs', () => {
    const roster = [agent('one', 'code reviewer'), agent('two', 'code reviewer')];
    expect(getAgentDisplayName(roster, 'one')).toBe('code reviewer');
    expect(getAgentDisplayName(roster, 'two')).toBe('code reviewer');
    expect(getAgentDisplayName(roster, 'unknown-id')).toBe('unknown-id');
  });

  test('defaults to build by ID, then the first native profile or caller text', () => {
    expect(getAgentDisplayName([agent('first', 'build'), agent('build', 'Builder')])).toBe('Builder');
    expect(getAgentDisplayName([agent('first', 'first label')])).toBe('first label');
    expect(getAgentDisplayName([], undefined, 'translated placeholder')).toBe('translated placeholder');
  });
});
