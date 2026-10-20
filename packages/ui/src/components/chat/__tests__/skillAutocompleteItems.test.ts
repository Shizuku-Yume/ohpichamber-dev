import { describe, expect, test } from 'bun:test';
import { rankSkillAutocompleteItems } from '../skillAutocompleteItems';

interface Item {
  name: string;
  scope: string;
}

describe('rankSkillAutocompleteItems', () => {
  test('places $apply name matches before fuzzy-only matches', () => {
    const skills: Item[] = [
      { name: 'apple-design', scope: 'agent' },
      { name: 'openspec-apply-change', scope: 'agent' },
      { name: 'opsx-apply', scope: 'agent' },
      { name: 'zebra', scope: 'agent' },
    ];

    expect(rankSkillAutocompleteItems(skills, 'apply').map((skill) => skill.name)).toEqual([
      'opsx-apply',
      'openspec-apply-change',
      'apple-design',
    ]);
  });

  test('keeps workspace skills above agent skills', () => {
    const skills: Item[] = [
      { name: 'apply', scope: 'agent' },
      { name: 'apple-design', scope: 'workspace' },
    ];

    expect(rankSkillAutocompleteItems(skills, 'apply').map((skill) => skill.name)).toEqual([
      'apple-design',
      'apply',
    ]);
  });

  test('keeps workspace first, then alphabetical order, when the query is empty', () => {
    const skills: Item[] = [
      { name: 'zebra', scope: 'agent' },
      { name: 'beta', scope: 'workspace' },
      { name: 'alpha', scope: 'agent' },
    ];

    expect(rankSkillAutocompleteItems(skills, '').map((skill) => skill.name)).toEqual([
      'beta',
      'alpha',
      'zebra',
    ]);
  });
});
