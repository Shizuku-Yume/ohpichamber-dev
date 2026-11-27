import { describe, expect, test } from 'bun:test';
import {
  PRESET_THINKING_LEVELS,
  applyPresetChanges,
  deletePresetFromRecord,
  effectiveRoleAssignments,
  findActivePresetName,
  isValidPresetThinkingLevel,
  parseModelPresetsRecord,
  presetDraftFromCurrentRoles,
  savePresetInRecord,
  validatePresetName,
} from './modelPresetLayout';

describe('modelPresetLayout', () => {
  test('isValidPresetThinkingLevel accepts auto and effort levels, rejecting off and inherit', () => {
    for (const level of PRESET_THINKING_LEVELS) {
      expect(isValidPresetThinkingLevel(level)).toBe(true);
    }
    expect(isValidPresetThinkingLevel('off')).toBe(false);
    expect(isValidPresetThinkingLevel('inherit')).toBe(false);
    expect(isValidPresetThinkingLevel('unknown')).toBe(false);
  });

  test('parseModelPresetsRecord keeps invalid hand-edited entries listed while validating valid ones', () => {
    const parsed = parseModelPresetsRecord({
      fast: {
        modelRoles: { default: 'anthropic/claude-haiku', smol: 'openai/gpt-5-mini' },
        defaultThinkingLevel: 'hi',
      },
      bare: {
        modelRoles: { default: 'openai/gpt-5' },
      },
      invalidSingleChar: {
        modelRoles: { default: 'openai/gpt-5' },
        defaultThinkingLevel: 'h',
      },
      invalidOff: {
        modelRoles: { default: 'openai/gpt-5' },
        defaultThinkingLevel: 'off',
      },
      invalidInherit: {
        modelRoles: { default: 'openai/gpt-5' },
        defaultThinkingLevel: 'inherit',
      },
      invalidBlankSelector: {
        modelRoles: { default: '   ' },
      },
      notAnObject: 'bad',
    });

    expect(parsed.fast).toEqual({
      kind: 'valid',
      preset: {
        modelRoles: { default: 'anthropic/claude-haiku', smol: 'openai/gpt-5-mini' },
        defaultThinkingLevel: 'high',
      },
    });
    expect(parsed.bare).toEqual({
      kind: 'valid',
      preset: { modelRoles: { default: 'openai/gpt-5' } },
    });
    expect(parsed.invalidSingleChar).toEqual({ kind: 'invalid' });
    expect(parsed.invalidOff).toEqual({ kind: 'invalid' });
    expect(parsed.invalidInherit).toEqual({ kind: 'invalid' });
    expect(parsed.notAnObject).toEqual({ kind: 'invalid' });
  });

  test('validatePresetName enforces OMP letter-first slug format and uniqueness', () => {
    expect(validatePresetName('   ', [])).toEqual({ valid: false, reason: 'required' });
    expect(validatePresetName('1fast', [])).toEqual({ valid: false, reason: 'invalidFormat' });
    expect(validatePresetName('-fast', [])).toEqual({ valid: false, reason: 'invalidFormat' });
    expect(validatePresetName('has space', [])).toEqual({ valid: false, reason: 'invalidFormat' });
    expect(validatePresetName('fast', ['fast'])).toEqual({ valid: false, reason: 'duplicate' });
    expect(validatePresetName('fast', ['fast'], 'fast')).toEqual({ valid: true, name: 'fast' });
    expect(validatePresetName(' Fast_Review-2 ', ['fast'])).toEqual({ valid: true, name: 'Fast_Review-2' });
  });

  test('findActivePresetName mirrors OMP sorted matching over normalized roles and optional thinking level', () => {
    const presets = parseModelPresetsRecord({
      zeta: {
        modelRoles: { default: 'openai/gpt-5', task: 'provider/a,provider/b' },
        defaultThinkingLevel: 'high',
      },
      alpha: {
        modelRoles: { default: 'openai/gpt-5', task: 'provider/a,provider/b' },
      },
      broken: {
        modelRoles: { default: 'openai/gpt-5', task: 'provider/a,provider/b' },
        defaultThinkingLevel: 'off',
      },
    });

    const roles = { default: 'openai/gpt-5', task: ['provider/a', 'provider/b'], smol: '' };
    expect(effectiveRoleAssignments(roles)).toEqual({ default: 'openai/gpt-5', task: 'provider/a,provider/b' });
    expect(findActivePresetName(presets, roles, 'high')).toBe('alpha');
    expect(findActivePresetName(presets, roles, 'low')).toBe('alpha');

    const onlyZeta = parseModelPresetsRecord({
      zeta: {
        modelRoles: { default: 'openai/gpt-5', task: 'provider/a,provider/b' },
        defaultThinkingLevel: 'high',
      },
    });
    expect(findActivePresetName(onlyZeta, roles, 'high')).toBe('zeta');
    expect(findActivePresetName(onlyZeta, roles, 'low')).toBeUndefined();
  });

  test('applyPresetChanges replaces modelRoles whole and writes defaultThinkingLevel only when recorded', () => {
    const withLevel = applyPresetChanges({
      modelRoles: { default: 'openai/gpt-5' },
      defaultThinkingLevel: 'auto',
    });
    expect(withLevel).toEqual([
      { id: 'modelRoles', value: { default: 'openai/gpt-5' } },
      { id: 'defaultThinkingLevel', value: 'auto' },
    ]);

    const withoutLevel = applyPresetChanges({
      modelRoles: { smol: 'openai/gpt-5-mini' },
    });
    expect(withoutLevel).toEqual([
      { id: 'modelRoles', value: { smol: 'openai/gpt-5-mini' } },
    ]);
  });

  test('presetDraftFromCurrentRoles snapshots effective roles and omits non-preset thinking levels', () => {
    expect(presetDraftFromCurrentRoles({ default: 'openai/gpt-5', empty: '  ' }, 'medium')).toEqual({
      modelRoles: { default: 'openai/gpt-5' },
      defaultThinkingLevel: 'medium',
    });
    expect(presetDraftFromCurrentRoles({ default: 'openai/gpt-5' }, 'off')).toEqual({
      modelRoles: { default: 'openai/gpt-5' },
    });
  });

  test('savePresetInRecord and deletePresetFromRecord preserve key order on rename and keep unrelated entries', () => {
    const initial = {
      first: { modelRoles: { default: 'a/1' } },
      second: { modelRoles: { default: 'b/2' }, defaultThinkingLevel: 'low' },
      third: { modelRoles: { default: 'c/3' }, defaultThinkingLevel: 'off' },
    };

    const renamed = savePresetInRecord(
      initial,
      'renamed-second',
      { modelRoles: { default: 'b/3', smol: '  ' }, defaultThinkingLevel: 'xhigh' },
      'second',
    );
    expect(Object.keys(renamed)).toEqual(['first', 'renamed-second', 'third']);
    expect(renamed['renamed-second']).toEqual({
      modelRoles: { default: 'b/3' },
      defaultThinkingLevel: 'xhigh',
    });
    expect(renamed.third).toEqual(initial.third);

    const deleted = deletePresetFromRecord(renamed, 'third');
    expect(Object.keys(deleted)).toEqual(['first', 'renamed-second']);
  });
});
