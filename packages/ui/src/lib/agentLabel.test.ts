import { describe, expect, test } from 'bun:test';

import { agentLabel } from './agentLabel';

describe('agentLabel', () => {
    test('uses the canonical agent name as the visible label', () => {
        expect(agentLabel({ name: 'code-reviewer' })).toBe('code-reviewer');
    });

    test('does not synthesize a display field', () => {
        expect(agentLabel({ name: 'build' })).toBe('build');
    });
});
