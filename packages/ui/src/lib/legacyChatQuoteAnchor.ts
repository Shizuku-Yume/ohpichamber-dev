// The legacy quote format anchors a quote by its text only. Resolving that
// text takes a Markdown parse, which needs the micromark stack; keeping the
// parser out of `chatQuoteAnchor.ts` keeps that stack out of the eager app
// bootstrap, which imports the anchor schema for draft types.
import { unified, type Plugin } from 'unified';
import remarkParse from 'remark-parse';
import { defaultRemarkPlugins } from 'streamdown';
import type { Root, RootContent } from 'mdast';
import type { ChatQuoteAnchor } from './chatQuoteAnchor';

const gfmEntry = defaultRemarkPlugins.gfm as [Plugin<[{ singleTilde?: boolean }?], Root>, Record<string, unknown>];
const legacyQuoteParser = unified().use(remarkParse).use(gfmEntry[0], { singleTilde: false });

export function legacyChatQuoteAnchor(quote: string): ChatQuoteAnchor {
    const text = (node: Root | RootContent): string => {
        if ('children' in node) {
            if (node.type === 'list') {
                return `\n${node.children.map(text).join('\n')}\n`;
            }
            if (node.type === 'listItem') {
                const body = node.children.map((child) => text(child)).join('\n');
                return node.children.at(-1)?.type === 'paragraph' ? body : `${body}\n`;
            }
            const separator = node.type === 'root' || node.type === 'blockquote' ? '\n' : '';
            const body = node.children.map((child) => text(child)).join(separator);
            return node.type === 'blockquote' ? `\n${body}\n` : body;
        }
        switch (node.type) {
            case 'break':
                return '\n';
            case 'code':
                return `${node.lang?.toLowerCase() || 'text'}${node.value}`;
            case 'text':
            case 'inlineCode':
            case 'html':
                return node.value;
            default:
                return '';
        }
    };
    return { text: text(legacyQuoteParser.parse(quote.trim())).trim(), prefix: '', suffix: '', start: 0 };
}
