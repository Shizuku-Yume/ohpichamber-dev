import { describe, expect, test } from 'bun:test';
import { resolvePinnedComposerSelection } from './pinnedComposerSelection';
import { nativeHostSession } from '@/sync/session-message-loader-test-fixtures';

const record = nativeHostSession();

describe('pinned composer selection', () => {
    test('does not infer a selection from the session record when nothing was picked', () => {
        expect(resolvePinnedComposerSelection({ savedAgent: null, savedModel: null, savedVariant: undefined, record })).toEqual({
            agent: undefined,
            model: null,
            variant: undefined,
        });
    });

    test('a pick saved for the session wins over the record', () => {
        expect(resolvePinnedComposerSelection({
            savedAgent: 'plan',
            savedModel: { providerId: 'openai', modelId: 'gpt' },
            savedVariant: 'low',
            record,
        })).toEqual({
            agent: 'plan',
            model: { providerId: 'openai', modelId: 'gpt' },
            variant: 'low',
        });
    });

    test('an effort saved as Default stays Default instead of the record\'s', () => {
        expect(resolvePinnedComposerSelection({ savedAgent: null, savedModel: null, savedVariant: null, record }).variant).toBeNull();
    });

    test('an absent saved effort stays absent with a native session record', () => {
        expect(resolvePinnedComposerSelection({ savedAgent: null, savedModel: null, savedVariant: undefined, record }).variant).toBeUndefined();
    });

    test('a saved canonical variant identifier stays explicit', () => {
        expect(resolvePinnedComposerSelection({ savedAgent: null, savedModel: null, savedVariant: 'default', record }).variant).toBe('default');
    });

    test('a real effort saved for the session wins over the record\'s', () => {
        expect(resolvePinnedComposerSelection({ savedAgent: null, savedModel: null, savedVariant: 'low', record }).variant).toBe('low');
    });

    test('a session without a record or picks has no model of its own', () => {
        expect(resolvePinnedComposerSelection({ savedAgent: null, savedModel: null, savedVariant: undefined, record: undefined })).toEqual({
            agent: undefined,
            model: null,
            variant: undefined,
        });
    });
});
