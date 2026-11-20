import type { Part } from '@openchamber/agent-contract';
import { extractTerminalContexts } from './terminalContext';

export function excerptMarkdown(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const marker = '\n\n[Content omitted]\n\n';
  const head = Math.ceil((limit - marker.length) / 2);
  const tail = Math.floor((limit - marker.length) / 2);
  return text.slice(0, head) + marker + text.slice(-tail);
}

function quoteContext(source: string, body: string, comment: string, fieldLimit?: number, codeLanguage?: string): string {
  const excerpt = (text: string) => fieldLimit ? excerptMarkdown(text, fieldLimit) : text;
  let content = excerpt(body);
  if (codeLanguage !== undefined) {
    let fenceLength = 3;
    for (const match of content.matchAll(/`+/g)) fenceLength = Math.max(fenceLength, match[0].length + 1);
    const fence = '`'.repeat(fenceLength);
    content = `${fence}${codeLanguage.replace(/[^\w+#.-]/g, '')}\n${content}\n${fence}`;
  }
  const quote = content.split('\n').map((line) => `> ${line}`).join('\n');
  return `${source}\n\n${quote}${comment.trim() ? `\n\n**User comment:**\n\n${excerpt(comment)}` : ''}`;
}

/** Model-facing text from canonical transcript parts. */
export function formatMessageText(
  parts: readonly Part[],
  options: { user?: boolean; fieldLimit?: number } = {},
): string {
  const blocks: string[] = [];
  for (const part of parts) {
    if (part.type !== 'text') continue;
    if (!options.user) {
      blocks.push(options.fieldLimit ? excerptMarkdown(part.content, options.fieldLimit) : part.content);
      continue;
    }
    const terminal = extractTerminalContexts(part.content);
    blocks.push(options.fieldLimit ? excerptMarkdown(terminal.visibleText, options.fieldLimit) : terminal.visibleText);
    for (const item of terminal.contexts) {
      blocks.push(quoteContext(`Terminal ${item.terminalLabel}, lines ${item.startLine}-${item.endLine}:`, item.text, '', options.fieldLimit, ''));
    }
  }
  return blocks.map((block) => block?.trim() ?? '').filter(Boolean).join('\n\n');
}
