import { describe, expect, test } from 'bun:test';

import { agentLabel } from './agentLabel';

describe('agentLabel', () => {
    test('uses the canonical agent name as the visible label', () => {
        expect(agentLabel({ name: 'code-reviewer' })).toBe('code-reviewer');
    });

    test('preserves the exact native label independently of agent identity', () => {
        const first = { agentId: 'review-one', name: 'code reviewer' };
        const second = { agentId: 'review-two', name: 'code reviewer' };
        expect(agentLabel(first)).toBe('code reviewer');
        expect(agentLabel(second)).toBe('code reviewer');
    });
});
