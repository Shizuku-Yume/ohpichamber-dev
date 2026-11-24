import { describe, expect, test } from 'bun:test';

import * as inlineMessageLinks from './inlineMessageLinks';
import { buildAgentHref, buildAttachmentHref, parseAgentHref, parseAttachmentHref } from './inlineMessageLinks';

describe('attachment citation links', () => {
    test('round-trip names that would otherwise break a Markdown link target', () => {
        const link = { filename: "shot (2x)'s copy.png", iconId: 'png' };
        const href = buildAttachmentHref(link);

        expect(/[()' ]/.test(href)).toBe(false);
        expect(parseAttachmentHref(href)).toEqual(link);
    });

    test('round-trip an openable citation under its own prefix', () => {
        const link = { filename: 'notes:v2.txt', iconId: 'txt', openable: true };
        const href = buildAttachmentHref(link);

        expect(href.startsWith('#openchamber-attachment-open:')).toBe(true);
        expect(parseAttachmentHref(href)).toEqual(link);
        expect(parseAttachmentHref(buildAttachmentHref({ ...link, openable: false }))?.openable).toBeUndefined();
    });

    test('rejects other links and malformed attachment links', () => {
        expect(parseAttachmentHref('#openchamber-skill:review')).toBeNull();
        expect(parseAttachmentHref('#openchamber-attachment:png')).toBeNull();
        expect(parseAttachmentHref('#openchamber-attachment:png:%E0%A4%A')).toBeNull();
    });
});

describe('agent mention links', () => {
    test('round-trip internal agent hrefs without building external opencode.ai URLs', () => {
        const href = buildAgentHref('build agent');
        expect(href).toBe('#openchamber-agent:build%20agent');
        expect(parseAgentHref(href)).toBe('build agent');
        expect('buildAgentMentionUrl' in inlineMessageLinks).toBe(false);
    });
});
