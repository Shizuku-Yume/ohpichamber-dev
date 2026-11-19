import { modelRefKey } from '@openchamber/agent-contract';
import type { Message } from '@openchamber/agent-contract';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import { getCurrentIntlLocale } from '@/lib/i18n';
import { openDesktopPath, revealDesktopPath, saveDesktopMarkdownFile } from '@/lib/desktop';
import { getRevealLabelKey } from '@/lib/utils';
import { formatMessageText } from '@/lib/messages/messageMarkdown';

export type ChildSessionExport = {
  title: string;
  agent?: string;
  records: Message[];
  children: ChildSessionExport[];
};

function formatTimestamp(timestamp: number | undefined): string {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const monthPart = date.toLocaleString(getCurrentIntlLocale(), { month: 'short' });
  const dayPart = date.getDate();
  const yearPart = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${monthPart} ${dayPart}, ${yearPart}, ${hours}:${minutes}`;
}

<<<<<<< HEAD
function formatAssistantModel(record: Message): string {
  if (record.role !== 'assistant') return '';
  const providerId = record.providerId?.trim() ?? '';
  const modelId = record.modelId?.trim() ?? '';
  const model = modelRefKey(providerId, modelId) || modelId || providerId;
  const variant = 'variant' in record && typeof record.variant === 'string' ? record.variant.trim() : undefined;
||||||| bc50ba56aa
function formatAssistantModel(record: SessionMessageRecord): string {
  if (record.info.role !== 'assistant') {
    return '';
  }

  const providerID = record.info.providerID.trim();
  const modelID = record.info.modelID.trim();
  const model = providerID && modelID ? `${providerID}/${modelID}` : (modelID || providerID);

  // OpenCode records `default` when no level was picked; like the chat
  // footer, the export names only a level the user chose.
  const variant = record.info.variant?.trim();
=======
function formatAssistantModel(record: SessionMessageRecord): string {
  if (record.info.role !== 'assistant') {
    return '';
  }

  const providerID = record.info.providerID.trim();
  const modelID = record.info.modelID.trim();
  const model = providerID && modelID ? `${providerID}/${modelID}` : (modelID || providerID);

  const variant = record.info.variant?.trim();
>>>>>>> upstream/main
  if (!model || !variant || ['default', 'none'].includes(variant.toLowerCase())) {
    return model;
  }
  return `${model}, thinking: ${variant}`;
}

function formatMessageHeader(record: Message): string {
  const label = record.role === 'user' ? 'User' : 'Assistant';
  const timestamp = formatTimestamp(record.createdAt);
  const assistantModel = formatAssistantModel(record);
  const details = timestamp && assistantModel ? `${timestamp} (${assistantModel})` : (timestamp || assistantModel);
  return details ? `**${label}**\n\n*${details}*` : `**${label}**`;
}

<<<<<<< HEAD
export function formatMessageRecordText(record: Message): string {
  return formatMessageText(record.parts, { user: record.role === 'user' });
||||||| bc50ba56aa
/**
 * A message's text the way the Markdown export renders it. Guest message and
 * session items carry the same text, so an extension sees what the export
 * file would.
 */
export function formatMessageRecordText(record: SessionMessageRecord): string {
  return formatMessageText(record.parts, { user: record.info.role === 'user' });
=======
export function formatMessageRecordText(record: SessionMessageRecord): string {
  return formatMessageText(record.parts, { user: record.info.role === 'user' });
>>>>>>> upstream/main
}

<<<<<<< HEAD
function formatMessageAsMarkdown(record: Message): string {
  if (record.role === 'system') return '';
||||||| bc50ba56aa
function formatMessageAsMarkdown(record: SessionMessageRecord): string {
  // Only the conversation roles carry parts. A synthetic message is either
  // context the user attached to the next prompt — exported as Context, the
  // way v1 exported it from inside the user message — or prompt plumbing a
  // server plugin injected. Plumbing is not something the user wrote or the
  // agent said, so it stays out of the transcript entirely.
  if (record.info.role === 'synthetic') {
    if (!readContextPart(record.info)) return '';
    const context = formatContextMessage(record.info).trim();
    return context ? `${formatMessageHeader(record)}\n\n${context}` : '';
  }
  if (!hasParts(record.info)) return '';

=======
function formatMessageAsMarkdown(record: SessionMessageRecord): string {
  if (record.info.role === 'synthetic') {
    if (!readContextPart(record.info)) return '';
    const context = formatContextMessage(record.info).trim();
    return context ? `${formatMessageHeader(record)}\n\n${context}` : '';
  }
  if (!hasParts(record.info)) return '';

>>>>>>> upstream/main
  const role = formatMessageHeader(record);
  const text = formatMessageRecordText(record);
  if (!text) return '';
  return `${role}\n\n${text}`;
}

function formatChildSessionAsMarkdown(child: ChildSessionExport, depth: number): string {
  const heading = '#'.repeat(Math.min(depth + 1, 6));
  const agentLabel = child.agent ? ` — ${child.agent}` : '';
  const childHeader = `${heading} Sub-agent: ${child.title}${agentLabel}\n\n---\n\n`;
  const childBody = child.records.map(formatMessageAsMarkdown).filter(Boolean).join('\n\n---\n\n');
  const parts = [childHeader + childBody];
  for (const grandchild of child.children) parts.push(formatChildSessionAsMarkdown(grandchild, depth + 1));
  return parts.join('\n\n---\n\n');
}

export function formatSessionAsMarkdown(messages: Message[], sessionTitle?: string | null, childSessions?: ChildSessionExport[]): string {
  const title = sessionTitle?.trim() || 'Session';
  const date = new Date().toISOString().split('T')[0];
  const header = `# ${title}\n\n*Exported on ${date}*\n\n---\n\n`;
  const body = messages.map(formatMessageAsMarkdown).filter(Boolean).join('\n\n---\n\n');
  let result = header + body;
  if (childSessions && childSessions.length > 0) {
    const childMarkdown = childSessions.map((child) => formatChildSessionAsMarkdown(child, 1)).join('\n\n---\n\n');
    result += '\n\n---\n\n' + childMarkdown;
  }
  return result;
}

export function downloadAsMarkdown(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function saveAsMarkdownDesktop(content: string, filename: string): Promise<string | null> {
  return saveDesktopMarkdownFile(filename, content);
}

export async function revealExportedMarkdown(path: string): Promise<boolean> {
  const runtimeFiles = getRegisteredRuntimeAPIs()?.files;
  if (runtimeFiles?.revealPath) {
    try {
      const result = await runtimeFiles.revealPath(path);
      return Boolean(result?.success);
    } catch {
      return false;
    }
  }
  if (await revealDesktopPath(path)) return true;
  return openDesktopPath(path);
}

export function getExportRevealLabelKey() {
  return getRevealLabelKey();
}

export function buildExportFilename(sessionTitle?: string | null): string {
  const base = sessionTitle?.trim() || 'session';
  const safe = base.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const normalizedBase = safe || 'session';
  const date = new Date().toISOString().split('T')[0];
  return `${normalizedBase}-${date}.md`;
}
