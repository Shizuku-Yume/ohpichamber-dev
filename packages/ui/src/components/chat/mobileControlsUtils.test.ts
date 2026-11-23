import { describe, expect, test } from 'bun:test';
import type { Agent } from '@openchamber/agent-contract';
import { dict, type I18nKey } from '@/lib/i18n/messages/en';
import { dict as esDict } from '@/lib/i18n/messages/es';
import { formatEffortLabel, getAgentDisplayName } from './mobileControlsUtils';

type TestAgent = Pick<Agent, 'agentId' | 'name'>;
const agent = (agentId: string, name = agentId): TestAgent => ({ agentId, name });

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

describe('formatEffortLabel', () => {
  const t = (key: I18nKey) => dict[key];

  test('known levels come from the dictionary, never the raw worker token', () => {
    expect(formatEffortLabel('high', t)).toBe('High');
    expect(formatEffortLabel('XHIGH', t)).toBe('Extra High');
    expect(formatEffortLabel('tur bo', t)).toBe('Tur bo');
    expect(formatEffortLabel('Minimal', t)).toBe('Minimal');
    expect(formatEffortLabel('auto', t)).toBe('Auto');
    expect(formatEffortLabel('none', t)).toBe('None');
  });

  test('an absent level is Default, a numeric budget is shown as written', () => {
    expect(formatEffortLabel(undefined, t)).toBe('Default');
    expect(formatEffortLabel('   ', t)).toBe('Default');
    expect(formatEffortLabel('16000', t)).toBe('16000');
    expect(formatEffortLabel('0.5', t)).toBe('0.5');
  });

  test('an unknown custom level keeps its spelling with the first letter raised', () => {
    expect(formatEffortLabel('turbo', t)).toBe('Turbo');
    expect(formatEffortLabel('TURBO', t)).toBe('TURBO');
  });

  test('the translated dictionary drives the label, so another locale changes it', () => {
    const es = (key: I18nKey) => esDict[key];
    expect(formatEffortLabel('high', es)).toBe('Alto');
    expect(formatEffortLabel('medium', es)).toBe('Medio');
  });
});
