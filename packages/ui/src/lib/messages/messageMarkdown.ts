import type { Part } from '@openchamber/agent-contract';
import { readContextPart, type ContextCarrierPart, type ContextPartPayload } from './contextParts';
import { extractTerminalContexts } from './terminalContext';

/** Preserve both the source and the reply when a model context needs a limit. */
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

function formatContext(payload: ContextPartPayload, originalText: string, fieldLimit?: number): string {
  switch (payload.kind) {
    case 'code-comment':
      return quoteContext(`Quoted from \`${payload.fileLabel}\`, lines ${payload.startLine}-${payload.endLine}${payload.side ? `, ${payload.side}` : ''}:`, payload.code, payload.text, fieldLimit, payload.language);
    case 'file-quote':
      return quoteContext(`Quoted from \`${payload.fileLabel}\`${payload.startLine != null ? `, lines ${payload.startLine}-${payload.endLine ?? payload.startLine}` : ''}:`, payload.quote, payload.text, fieldLimit);
    case 'chat-quote':
      return quoteContext('Quoted from an earlier message:', payload.quote, payload.text, fieldLimit);
    case 'browser-annotation':
      return quoteContext(`Browser annotation on ${payload.pageUrl}:`, payload.prompt, payload.text, fieldLimit);
    case 'pr-comment':
      return quoteContext(`${payload.provider === 'gitlab' ? 'GitLab merge request' : 'GitHub PR'} comment, ${payload.label}:`, payload.body, payload.text, fieldLimit);
    case 'pr-check':
      return quoteContext(`${payload.provider === 'gitlab' ? 'GitLab merge request pipeline job' : 'GitHub PR check'}, ${payload.label}:`, payload.output, payload.text, fieldLimit, '');
    case 'terminal':
      return quoteContext(`Terminal ${payload.terminalLabel}, lines ${payload.startLine}-${payload.endLine}:`, payload.output, '', fieldLimit, '');
    case 'repository-issue':
    case 'change-request':
    case 'linear-issue':
    case 'guest-issue':
    case 'guest-pr':
      return fieldLimit ? excerptMarkdown(originalText, fieldLimit) : originalText;
  }
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

/** Local composer context as model-facing Markdown, before canonical capture. */
export function formatContextMessage(
  message: ContextCarrierPart & { text: string },
  fieldLimit?: number,
): string {
  const payload = readContextPart(message);
  if (payload) return formatContext(payload, message.text, fieldLimit);
  return fieldLimit ? excerptMarkdown(message.text, fieldLimit) : message.text;
}
