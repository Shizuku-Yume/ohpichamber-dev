import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { PartSchema } from '@openchamber/agent-contract';
import { I18nProvider } from '@/lib/i18n';
import { MarkdownContent } from '../../MarkdownRendererImpl';
import { prepareUserMarkdownContent } from './userTextPartContent';
import { SessionMentionChipsContext, sessionMentionChipsOf, withSessionMentionChips } from './sessionMentionChips';
import UserTextPart from './UserTextPart';
import { loadMarkdownRendererModule } from '../../markdownRendererLoader';
import { useUIStore } from '@/stores/useUIStore';
import { SyncProvider } from '@/sync/sync-context';

describe('canonical session mention rendering', () => {
    test('draws persisted session and message identities in plain and Markdown paths', () => {
        const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
        const browser = new Window({ url: 'http://localhost/' });
        Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
        try {
            const text = 'Read ohpichamber://session/session-a and ohpichamber://session/session-b?message=message-b';
            const part = PartSchema.parse(JSON.parse(JSON.stringify({
                type: 'text', partId: 'part-a', content: text, sessionMentions: [
                    { kind: 'session', sessionId: 'session-a', title: 'First session' },
                    { kind: 'session-message', sessionId: 'session-b', messageId: 'message-b', sessionTitle: 'Second session', excerpt: 'Message excerpt' },
                ]
            })));
            const chips = sessionMentionChipsOf([part]);
            const plain = renderToStaticMarkup(<>{withSessionMentionChips(text, chips, 'plain')}</>);
            expect(plain).toContain('title="First session"');
            expect(plain).toContain('title="Second session: Message excerpt"');
            expect(plain.match(/<button/g)).toHaveLength(2);
            const markdown = prepareUserMarkdownContent({ textContent: text, skillNames: new Set(), sessionMentions: { chips, origins: ['http://localhost'] } });
            expect(markdown).toContain('[First session](<ohpichamber://session/session-a>)');
            expect(markdown).toContain('[Message excerpt](<ohpichamber://session/session-b?message=message-b>)');
            const rendered = renderToStaticMarkup(<I18nProvider><SessionMentionChipsContext.Provider value={chips}>
                <MarkdownContent content={markdown} directory="" mode="static" settled enableFileReferences={false} />
            </SessionMentionChipsContext.Provider></I18nProvider>);
            expect(rendered).toContain('title="First session"');
            expect(rendered).toContain('title="Second session: Message excerpt"');
            expect(rendered.match(/<button/g)).toHaveLength(2);
            expect(sessionMentionChipsOf([{ type: 'text', partId: 'old', content: text }]).size).toBe(0);
        } finally {
            browser.happyDOM.abort();
            if (previous) Object.defineProperty(globalThis, 'window', previous);
            else Reflect.deleteProperty(globalThis, 'window');
        }
    });
    test('actual user message renders recognized autolink safely', async () => {
        const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
        const browser = new Window({ url: 'http://localhost/' });
        Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
        const previousMode = useUIStore.getState().userMessageRenderingMode;
        try {
            await loadMarkdownRendererModule();
            useUIStore.setState({ userMessageRenderingMode: 'markdown' });
            const part = PartSchema.parse({ type: 'text', partId: 'part', content: 'Read <ohpichamber://session/session-a> and `<ohpichamber://session/session-a>` <img src=x onerror=alert(1)>', sessionMentions: [{ kind: 'session', sessionId: 'session-a', title: 'Session <unsafe>' }] });
            const rendered = renderToStaticMarkup(<I18nProvider><SyncProvider directory="/repo"><UserTextPart part={part} isMobile={false} messageExpanded onExpandMessage={() => { }} partIndex={0} onTruncationChange={() => { }} attachmentFilenames={[]} sessionMentionChips={sessionMentionChipsOf([part])} /></SyncProvider></I18nProvider>);
            expect(rendered.match(/<button/g)).toHaveLength(1);
            expect(rendered).toContain('title="Session &lt;unsafe&gt;"');
            expect(rendered).toContain('&lt;ohpichamber://session/session-a&gt;');
            expect(rendered).not.toContain('<img');
        } finally {
            useUIStore.setState({ userMessageRenderingMode: previousMode });
            browser.happyDOM.abort();
            if (previous) Object.defineProperty(globalThis, 'window', previous);
            else Reflect.deleteProperty(globalThis, 'window');
        }
    });
    test('renders angle autolinks as chips without turning code or HTML into a link', () => {
        const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
        const browser = new Window({ url: 'http://localhost/' });
        Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
        try {
            const text = 'Read <ohpichamber://session/session-a> and `<ohpichamber://session/session-a>` <img src=x onerror=alert(1)>';
            const part = PartSchema.parse({
                type: 'text', partId: 'part', content: text, sessionMentions: [
                    { kind: 'session', sessionId: 'session-a', title: 'Session <unsafe>' },
                ]
            });
            const chips = sessionMentionChipsOf([part]);
            const markdown = prepareUserMarkdownContent({ textContent: text, skillNames: new Set(), sessionMentions: { chips, origins: ['http://localhost'] } });
            const rendered = renderToStaticMarkup(<I18nProvider><SessionMentionChipsContext.Provider value={chips}>
                <MarkdownContent content={markdown} directory="" mode="static" settled enableFileReferences={false} />
            </SessionMentionChipsContext.Provider></I18nProvider>);
            expect(rendered.match(/<button/g)).toHaveLength(1);
            expect(rendered).toContain('title="Session &lt;unsafe&gt;"');
            expect(rendered).toContain('&lt;ohpichamber://session/session-a&gt;');
            expect(rendered).not.toContain('<img');
        } finally {
            browser.happyDOM.abort();
            if (previous) Object.defineProperty(globalThis, 'window', previous);
            else Reflect.deleteProperty(globalThis, 'window');
        }
    });
});
