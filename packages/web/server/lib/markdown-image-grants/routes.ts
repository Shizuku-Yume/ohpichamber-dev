import express from 'express';
import { constants as fsConstants } from 'node:fs';
import type fs from 'node:fs/promises';
import type nodePath from 'node:path';
import type nodeCrypto from 'node:crypto';
import { z } from 'zod';
import { EntityIdSchema, HistoryPageSchema, SessionSnapshotSchema, type HistoryPage, type Message, type SessionSnapshot } from '@openchamber/agent-contract';
import type { Application } from '../shared/http-contracts.js';
import { isRecord, isString } from '../shared/object-guards.js';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_SOURCES = 12;

export interface MarkdownImageGrantSessionScope {
  workspaceId: string;
  rootSessionId: string;
  cwd: string;
}

export interface MarkdownImageGrantSessionService {
  open: (sessionId: string) => Promise<SessionSnapshot>;
  history: (sessionId: string, query: string) => Promise<HistoryPage>;
}

export interface MarkdownImageGrantDependencies {
  fsPromises: Pick<typeof fs, 'realpath' | 'open'>;
  path: Pick<typeof nodePath, 'relative' | 'isAbsolute' | 'resolve' | 'dirname' | 'basename'>;
  crypto: Pick<typeof nodeCrypto, 'randomUUID'>;
  sessionService: MarkdownImageGrantSessionService;
  resolveSessionScope: (sessionId: string) => Promise<MarkdownImageGrantSessionScope | null>;
  approvedTempRoot: string;
  now?: () => number;
}

interface ImageGrant {
  path: string;
  source: string;
  sessionId: string;
  workspaceId: string;
  rootSessionId: string;
  cwd: string;
  expiresAt: number;
}

type ImageInspectionResult =
  | { status: 'error' | 'missing' }
  | { status: 'ready'; path: string; outsideWorkspace: boolean };

type ImageGrantPrepareResult =
  | { sourceIndex: number; status: 'error' | 'missing' }
  | { sourceIndex: number; status: 'ready'; expiresAt: number; assetPath: string };

const grantRequestBodySchema = z.object({
  messageId: z.string().transform((value) => value.trim()).pipe(EntityIdSchema),
  sources: z.array(z.string().transform((value) => value.trim()).pipe(z.string().min(1))).min(1).max(MAX_IMAGE_SOURCES),
});

const hasFsErrorCode = (value: unknown): value is { code?: unknown } => isRecord(value);

const isWithin = (target: string, root: string, path: MarkdownImageGrantDependencies['path']) => {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const parseFileSource = (source: string) => {
  if (/^file:\/\//i.test(source)) {
    try {
      const url = new URL(source);
      if (url.protocol !== 'file:' || (url.host && url.host !== 'localhost')) return '';
      const pathname = decodeURIComponent(url.pathname);
      return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
    } catch {
      return '';
    }
  }
  const pathname = source.split(/[?#]/, 1)[0] || '';
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
};

const hasImageSignature = (bytes: Buffer) => {
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes.subarray(1, 4).toString('ascii') === 'PNG'
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return true;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  const header = bytes.subarray(0, 12).toString('ascii');
  return header.startsWith('GIF87a')
    || header.startsWith('GIF89a')
    || (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP');
};
const normalizeReferenceLabel = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

const unescapeMarkdownDestination = (value: string) => value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~\\])/g, '$1');

const isEscapedAt = (value: string, index: number) => {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) slashes += 1;
  return slashes % 2 === 1;
};

const findClosingBracket = (value: string, start: number) => {
  for (let cursor = start; cursor < value.length; cursor += 1) {
    if (value[cursor] === ']' && !isEscapedAt(value, cursor)) return cursor;
  }
  return -1;
};

const findInlineImageEnd = (value: string, start: number) => {
  let cursor = start;
  while (/\s/.test(value[cursor] || '')) cursor += 1;
  if (value[cursor] === ')') return cursor;

  const opener = value[cursor];
  const closer = opener === '"' ? '"' : opener === "'" ? "'" : opener === '(' ? ')' : '';
  if (!closer) return -1;
  cursor += 1;
  for (; cursor < value.length; cursor += 1) {
    if (value[cursor] !== closer || isEscapedAt(value, cursor)) continue;
    cursor += 1;
    while (/\s/.test(value[cursor] || '')) cursor += 1;
    return value[cursor] === ')' ? cursor : -1;
  }
  return -1;
};

const parseInlineDestination = (value: string, start: number) => {
  let cursor = start;
  while (/\s/.test(value[cursor] || '')) cursor += 1;
  if (value[cursor] === '<') {
    const end = value.indexOf('>', cursor + 1);
    if (end < 0) return null;
    const imageEnd = findInlineImageEnd(value, end + 1);
    return imageEnd < 0
      ? null
      : { source: unescapeMarkdownDestination(value.slice(cursor + 1, end)), end: imageEnd };
  }

  let source = '';
  let depth = 0;
  for (; cursor < value.length; cursor += 1) {
    const char = value.charAt(cursor);
    if (char === '\\' && cursor + 1 < value.length) {
      source += char + value.charAt(cursor + 1);
      cursor += 1;
      continue;
    }
    if (char === '(') {
      depth += 1;
      source += char;
      continue;
    }
    if (char === ')') {
      if (depth === 0) return { source: unescapeMarkdownDestination(source), end: cursor };
      depth -= 1;
      source += char;
      continue;
    }
    if (/\s/.test(char) && depth === 0) {
      const imageEnd = findInlineImageEnd(value, cursor);
      return imageEnd < 0 ? null : { source: unescapeMarkdownDestination(source), end: imageEnd };
    }
    source += char;
  }
  return null;
};

const parseDefinitionDestination = (value: string) => {
  const trimmed = value.trimStart();
  if (trimmed.startsWith('<')) {
    const end = trimmed.indexOf('>', 1);
    return end < 0 ? '' : unescapeMarkdownDestination(trimmed.slice(1, end));
  }
  const match = /^(?:\\.|\S)+/.exec(trimmed);
  return match ? unescapeMarkdownDestination(match[0]) : '';
};

const collectMarkdownLinesOutsideCode = (message: Message) => {
  const lines: string[] = [];
  for (const part of message.parts) {
    if (part.type !== 'text') continue;
    let fence: { char: string; size: number } | null = null;
    for (const line of part.content.split('\n')) {
      const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
      const marker = fenceMatch?.[1];
      if (marker) {
        if (!fence) {
          fence = { char: marker.charAt(0), size: marker.length };
        } else if (marker.charAt(0) === fence.char && marker.length >= fence.size) {
          fence = null;
        }
        continue;
      }
      if (fence) continue;
      lines.push(line.replace(/`+[^`]*`+/g, ''));
    }
  }
  return lines;
};

const markdownImageSources = (message: Message) => {
  const sources = new Set<string>();
  const markdownLines = collectMarkdownLinesOutsideCode(message);
  const definitions = new Map<string, string>();
  for (const line of markdownLines) {
    const match = /^\s{0,3}\[([^\]]+)]\s*:\s*(.*)$/.exec(line);
    if (match?.[1] === undefined || match[2] === undefined) continue;
    const source = parseDefinitionDestination(match[2]);
    if (source) definitions.set(normalizeReferenceLabel(match[1]), source);
  }

  for (const line of markdownLines) {
    for (let cursor = 0; cursor < line.length; cursor += 1) {
      if (line[cursor] !== '!' || line[cursor + 1] !== '[' || isEscapedAt(line, cursor)) continue;
      const altEnd = findClosingBracket(line, cursor + 2);
      if (altEnd < 0) continue;
      const alt = line.slice(cursor + 2, altEnd);
      const next = line[altEnd + 1];
      if (next === '(') {
        const parsed = parseInlineDestination(line, altEnd + 2);
        if (parsed?.source) sources.add(parsed.source);
        cursor = parsed?.end ?? altEnd;
        continue;
      }
      let label = alt;
      if (next === '[') {
        const labelEnd = findClosingBracket(line, altEnd + 2);
        if (labelEnd < 0) continue;
        label = line.slice(altEnd + 2, labelEnd) || alt;
        cursor = labelEnd;
      } else {
        cursor = altEnd;
      }
      const source = definitions.get(normalizeReferenceLabel(label));
      if (source) sources.add(source);
    }
  }
  for (const part of message.parts) {
    if (part.type === 'tool_result') {
      const output = part.output;
      if (isRecord(output)) {
        const details = output.details;
        if (isRecord(details) && Array.isArray(details.imagePaths)) {
          for (const p of details.imagePaths) if (isString(p) && p) sources.add(p);
        }
        if (Array.isArray(output.images)) {
          for (const img of output.images) if (isRecord(img) && isString(img.path)) sources.add(img.path);
        }
      }
    }
  }
  return sources;
};

const fetchMessage = async ({
  sessionId,
  messageId,
  sessionService,
}: {
  sessionId: string;
  messageId: string;
  sessionService: MarkdownImageGrantSessionService;
}): Promise<Message | null> => {
  const snapshot = SessionSnapshotSchema.parse(await sessionService.open(sessionId));
  if (snapshot.session.sessionId !== sessionId) throw new Error('Canonical snapshot scope mismatch');
  const locate = (selection: Pick<SessionSnapshot, 'turns' | 'messages'>) => {
    const settled = new Set(selection.turns.filter((turn) => ['completed', 'failed', 'cancelled'].includes(turn.status)).map((turn) => turn.turnId));
    return selection.messages.find((message) => message.messageId === messageId && message.role === 'assistant' && settled.has(message.turnId));
  };
  const recent = locate(snapshot);
  if (recent) return recent;
  let cursor: string | null | undefined;
  do {
    const query = new URLSearchParams({ limit: '100' });
    if (cursor) query.set('cursor', cursor);
    const page = HistoryPageSchema.parse(await sessionService.history(sessionId, query.toString()));
    if (page.sessionId !== sessionId) throw new Error('Canonical history scope mismatch');
    const message = locate(page);
    if (message) return message;
    cursor = page.nextCursor;
  } while (cursor);
  return null;
};

const inspectImage = async ({
  source,
  directory,
  approvedTempRoot,
  fsPromises,
  path,
}: {
  source: string;
  directory: string;
  approvedTempRoot: string;
  fsPromises: MarkdownImageGrantDependencies['fsPromises'];
  path: MarkdownImageGrantDependencies['path'];
}): Promise<ImageInspectionResult> => {
  const parsed = parseFileSource(source);
  if (!parsed) return { status: 'error' };
  const sourcePath = path.isAbsolute(parsed) ? parsed : path.resolve(directory, parsed);
  const workspaceRoot = path.resolve(directory);
  const outsideWorkspace = !isWithin(path.resolve(sourcePath), workspaceRoot, path);
  const root = outsideWorkspace ? approvedTempRoot : workspaceRoot;

  try {
    const [canonicalRoot, canonicalPath] = await Promise.all([
      fsPromises.realpath(root),
      fsPromises.realpath(sourcePath),
    ]);
    if (!isWithin(canonicalPath, canonicalRoot, path)) return { status: 'error' };
    if (outsideWorkspace && (path.dirname(canonicalPath) !== canonicalRoot
      || !/^omp-(?:image|sshots|screenshot-diff|computer)-[A-Za-z0-9_-]+\.(?:png|jpe?g|gif|webp)$/i.test(path.basename(canonicalPath)))) {
      return { status: 'error' };
    }
    const handle = await fsPromises.open(canonicalPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    try {
      const stats = await handle.stat();
      if (!stats.isFile() || stats.size > MAX_IMAGE_BYTES) return { status: 'error' };
      const header = Buffer.alloc(12);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      if (!hasImageSignature(header.subarray(0, bytesRead))) return { status: 'error' };
      return {
        status: 'ready',
        path: canonicalPath,
        outsideWorkspace,
      };
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (hasFsErrorCode(error) && error.code === 'ENOENT') return { status: 'missing' };
    if (hasFsErrorCode(error) && (error.code === 'EACCES' || error.code === 'EPERM' || error.code === 'ELOOP')) {
      return { status: 'error' };
    }
    throw error;
  }
};

export const registerMarkdownImageGrantRoutes = (app: Application, dependencies: MarkdownImageGrantDependencies) => {
  const { fsPromises, path, crypto, sessionService, resolveSessionScope, approvedTempRoot, now = Date.now } = dependencies;
  if (!sessionService || !resolveSessionScope || !approvedTempRoot) {
    throw new TypeError('Canonical session reader, Host scope resolver and approved image root are required');
  }
  const grants = new Map<string, ImageGrant>();
  const ttl = 10 * 60 * 1000;
  const prune = () => {
    for (const [id, grant] of grants) if (grant.expiresAt <= now()) grants.delete(id);
    while (grants.size >= 256) {
      const oldest = grants.keys().next().value;
      if (oldest === undefined) break;
      grants.delete(oldest);
    }
  };
  const route = '/api/openchamber/sessions/:sessionId/markdown-image-grants';
  app.post(route, express.json({ limit: '32kb' }), async (req, res) => {
    const sessionId = isString(req.params.sessionId) ? req.params.sessionId.trim() : '';
    const parsedBody = grantRequestBodySchema.safeParse(req.body);
    if (!EntityIdSchema.safeParse(sessionId).success || !parsedBody.success) {
      return res.status(400).json({ error: 'sessionId, messageId, and 1-12 sources are required' });
    }
    const { messageId, sources } = parsedBody.data;
    try {
      const scope = await resolveSessionScope(sessionId);
      if (!scope?.cwd || !scope?.workspaceId) return res.status(403).json({ error: 'Session scope unavailable' });
      const message = await fetchMessage({ sessionId, messageId, sessionService });
      if (!message) return res.status(404).json({ error: 'Assistant message not found' });
      const referenced = markdownImageSources(message);
      const results: ImageGrantPrepareResult[] = [];
      for (const [sourceIndex, source] of sources.entries()) {
        if (!referenced.has(source)) { results.push({ sourceIndex, status: 'error' }); continue; }
        try {
          const inspected = await inspectImage({ source, directory: scope.cwd, approvedTempRoot, fsPromises, path });
          if (inspected.status !== 'ready') { results.push({ sourceIndex, status: inspected.status }); continue; }
          prune();
          const grantId = crypto.randomUUID();
          const expiresAt = now() + ttl;
          grants.set(grantId, {
            path: inspected.path, source, sessionId, workspaceId: scope.workspaceId,
            rootSessionId: scope.rootSessionId, cwd: scope.cwd, expiresAt
          });
          results.push({
            sourceIndex, status: 'ready', expiresAt,
            assetPath: `/api/openchamber/sessions/${encodeURIComponent(sessionId)}/markdown-image-grants/${grantId}/raw`
          });
        } catch { results.push({ sourceIndex, status: 'error' }); }
      }
      return res.json({ results });
    } catch {
      return res.status(503).json({ error: 'Failed to prepare session images' });
    }
  });
  app.get(`${route}/:grantId/raw`, async (req, res) => {
    const grantId = req.params.grantId ?? '';
    const grant = grants.get(grantId);
    if (!grant || grant.expiresAt <= now() || grant.sessionId !== req.params.sessionId) {
      if (grant && grant.expiresAt <= now()) grants.delete(grantId);
      return res.status(404).json({ error: 'Image grant unavailable' });
    }
    try {
      const scope = await resolveSessionScope(grant.sessionId);
      if (!scope || scope.workspaceId !== grant.workspaceId || scope.rootSessionId !== grant.rootSessionId || scope.cwd !== grant.cwd) {
        return res.status(403).json({ error: 'Session scope changed' });
      }
      const inspected = await inspectImage({ source: grant.source, directory: scope.cwd, approvedTempRoot, fsPromises, path });
      if (inspected.status !== 'ready' || inspected.path !== grant.path) return res.status(404).json({ error: 'Image unavailable' });
      const handle = await fsPromises.open(grant.path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
      try {
        const stats = await handle.stat();
        if (!stats.isFile() || stats.size > MAX_IMAGE_BYTES) return res.status(404).json({ error: 'Image unavailable' });
        const buffer = Buffer.alloc(stats.size + 1);
        let length = 0;
        while (length < buffer.length) {
          const read = await handle.read(buffer, length, buffer.length - length, length);
          if (read.bytesRead === 0) break;
          length += read.bytesRead;
        }
        const bytes = buffer.subarray(0, length);
        if (length > stats.size || !hasImageSignature(bytes)) return res.status(404).json({ error: 'Image unavailable' });
        const header = bytes.subarray(0, 12).toString('ascii');
        const mime = bytes[0] === 0x89 ? 'image/png' : bytes[0] === 0xff ? 'image/jpeg' : header.startsWith('GIF') ? 'image/gif' : 'image/webp';
        res.set({ 'Content-Type': mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
        return res.send(bytes);
      } finally { await handle.close(); }
    } catch { return res.status(503).json({ error: 'Image unavailable' }); }
  });
};
