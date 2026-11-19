import express from 'express';
<<<<<<< HEAD:packages/web/server/lib/markdown-image-grants/routes.js
import { constants as fsConstants } from 'node:fs';
import { EntityIdSchema, HistoryPageSchema, SessionSnapshotSchema } from '@openchamber/agent-contract';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_SOURCES = 12;
||||||| bc50ba56aa:packages/web/server/lib/markdown-image-grants/routes.js
import { mintOutsideFileGrant } from '../fs/routes.js';
import { unwrapOpenCodeResponse } from '../opencode/response-envelope.js';
import { fitRenderPageImages, renderPageImageSources } from '../openchamber-control/render-page.js';
import { generatedImagePaths } from '../openchamber-control/generate-image.js';
import { capturedScreenshotPaths } from '../openchamber-control/screenshots.js';
import { isString } from '../shared/guards.js';
import { inspectLocalImage } from './inspect-image.js';
=======
import { mintOutsideFileGrant } from '../fs/routes.js';
import { unwrapOpenCodeResponse } from '../opencode/response-envelope.js';
import { fitRenderPageImages, renderPageImageSources } from '../openchamber-control/render-page.js';
import { generatedImagePaths } from '../openchamber-control/generate-image.js';
import { capturedScreenshotPaths } from '../openchamber-control/screenshots.js';
import { asNonEmptyString, isRecord, isString } from '../shared/guards.js';
import { inspectLocalImage } from './inspect-image.js';
import type { PageImageInspection } from '../openchamber-control/render-page.js';
import type { DirectoryValidation } from '../projects/contracts.js';
import type { Application } from '../shared/http-contracts.js';
import type { JsonObject, JsonValue } from '../shared/json-values.js';
import type { LocalImageInspection, LocalImageInspectionOptions } from './inspect-image.js';
>>>>>>> upstream/main:packages/web/server/lib/markdown-image-grants/routes.ts

type OutsideFileGrantOptions = NonNullable<Parameters<typeof mintOutsideFileGrant>[1]>;

<<<<<<< HEAD:packages/web/server/lib/markdown-image-grants/routes.js
const isWithin = (target, root, path) => {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const parseFileSource = (source) => {
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

const hasImageSignature = (bytes) => {
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes.subarray(1, 4).toString('ascii') === 'PNG'
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return true;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  const header = bytes.subarray(0, 12).toString('ascii');
  return header.startsWith('GIF87a')
    || header.startsWith('GIF89a')
    || (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP');
};

const normalizeReferenceLabel = (value) => value.trim().replace(/\s+/g, ' ').toLowerCase();
||||||| bc50ba56aa:packages/web/server/lib/markdown-image-grants/routes.js
const normalizeReferenceLabel = (value) => value.trim().replace(/\s+/g, ' ').toLowerCase();
=======
export interface MarkdownImageGrantDependencies {
  fsPromises: LocalImageInspectionOptions['fsPromises'] & NonNullable<OutsideFileGrantOptions['fsPromises']>;
  path: NonNullable<OutsideFileGrantOptions['path']>;
  crypto: NonNullable<OutsideFileGrantOptions['crypto']>;
  validateDirectoryPath: (directory: string) => Promise<DirectoryValidation>;
  buildOpenCodeUrl: (route: string, prefix: string) => string;
  getOpenCodeAuthHeaders: () => Record<string, string>;
}
>>>>>>> upstream/main:packages/web/server/lib/markdown-image-grants/routes.ts

type MessageLookup = Pick<MarkdownImageGrantDependencies, 'buildOpenCodeUrl' | 'getOpenCodeAuthHeaders'> & {
  sessionId: string;
  messageId: string;
  directory: string;
};

const isJsonRecord = (value: JsonValue | undefined): value is JsonObject => isRecord(value);
const hasErrorMessage = (value: unknown): value is { message?: unknown } => value != null;

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

<<<<<<< HEAD:packages/web/server/lib/markdown-image-grants/routes.js
/** Only finalized canonical assistant text can authorize an image. */
const messageTextParts = (message) => message.parts;
||||||| bc50ba56aa:packages/web/server/lib/markdown-image-grants/routes.js
/**
 * v2 messages are flat records: an assistant one carries `content[]` and a user
 * one a single `text`. Both are read here, because an image link can come from
 * either side of the conversation.
 */
const messageContent = (message) => {
  if (Array.isArray(message?.content)) return message.content;
  if (typeof message?.text === 'string') return [{ type: 'text', text: message.text }];
  return [];
};
=======
const messageContent = (message: JsonObject): JsonValue[] => {
  if (Array.isArray(message.content)) return message.content;
  if (isString(message.text)) return [{ type: 'text', text: message.text }];
  return [];
};
>>>>>>> upstream/main:packages/web/server/lib/markdown-image-grants/routes.ts

const collectMarkdownLinesOutsideCode = (message: JsonObject) => {
  const lines = [];
<<<<<<< HEAD:packages/web/server/lib/markdown-image-grants/routes.js
  for (const part of messageTextParts(message)) {
    if (part.type !== 'text') continue;
    let fence = null;
    for (const line of part.content.split('\n')) {
      const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
      if (fenceMatch) {
        const marker = fenceMatch[1];
||||||| bc50ba56aa:packages/web/server/lib/markdown-image-grants/routes.js
  for (const part of messageContent(message)) {
    if (part?.type !== 'text' || typeof part.text !== 'string') continue;
    let fence = null;
    for (const line of part.text.split('\n')) {
      const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
      if (fenceMatch) {
        const marker = fenceMatch[1];
=======
  for (const part of messageContent(message)) {
    if (!isJsonRecord(part) || part.type !== 'text' || !isString(part.text)) continue;
    let fence: { char: string; size: number } | null = null;
    for (const line of part.text.split('\n')) {
      const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker !== undefined) {
>>>>>>> upstream/main:packages/web/server/lib/markdown-image-grants/routes.ts
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

const markdownImageSources = (message: JsonObject) => {
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
<<<<<<< HEAD:packages/web/server/lib/markdown-image-grants/routes.js
  for (const part of messageTextParts(message)) {
    if (part.type === 'tool_result') {
      const output = part.output;
      if (output && typeof output === 'object') {
        const details = output.details;
        if (details && typeof details === 'object' && Array.isArray(details.imagePaths)) {
          for (const p of details.imagePaths) if (typeof p === 'string' && p) sources.add(p);
        }
        if (Array.isArray(output.images)) {
          for (const img of output.images) if (typeof img?.path === 'string') sources.add(img.path);
        }
      }
||||||| bc50ba56aa:packages/web/server/lib/markdown-image-grants/routes.js
  return sources;
};

/**
 * The message's openchamber_render pages, by tool call id. The page's HTML is
 * the call's input, which OpenCode stores with the message, so it authorizes
 * its paths the way assistant text does. The input is either the page itself
 * or, for a call made through the action form, its `parameters`.
 */
const renderPages = (message) => {
  const pages = new Map();
  for (const part of messageContent(message)) {
    if (part?.type !== 'tool' || part.name !== 'openchamber_render') continue;
    const input = part.state?.input;
    const html = input?.parameters?.html ?? input?.html;
    // A stored tool item's `id` is its call id: the chat's `callID` is this
    // field (projectToolPart in packages/ui/src/lib/opencode/projection.ts).
    if (isString(html)) pages.set(part.id, html);
  }
  return pages;
};

const renderPageSources = (message) => {
  const sources = new Set();
  for (const html of renderPages(message).values()) {
    for (const source of renderPageImageSources(html)) sources.add(source);
  }
  return sources;
};

/**
 * A file path the way two spellings of it compare: the chat sends the
 * destination Markdown made of it, percent-encoded and, for a Windows path, a
 * `file:` URL. Only the generated images compare this way; text and pages
 * keep their exact references.
 */
const comparablePath = (value) => {
  let text = value;
  if (/^file:\/\//i.test(text)) {
    try {
      text = new URL(text).pathname;
    } catch {
      return '';
=======
  return sources;
};

const spilledPageHtml = (input: JsonObject | undefined) => {
  if (!isString(input?.action) || !input.action.trim().startsWith('{')) return undefined;
  let revived: JsonValue;
  try {
    revived = JSON.parse(input.action);
  } catch {
    return undefined;
  }
  if (!isJsonRecord(revived)) return undefined;
  return isJsonRecord(revived.parameters) && Object.hasOwn(revived.parameters, 'html')
    ? revived.parameters.html
    : revived.html;
};

const renderPages = (message: JsonObject) => {
  const pages = new Map<JsonValue | undefined, string>();
  for (const part of messageContent(message)) {
    if (!isJsonRecord(part) || part.type !== 'tool' || part.name !== 'openchamber_render') continue;
    const state = isJsonRecord(part.state) ? part.state : undefined;
    const input = isJsonRecord(state?.input) ? state.input : undefined;
    const parameters = isJsonRecord(input?.parameters) ? input.parameters : undefined;
    const html = [parameters?.html, input?.html, spilledPageHtml(input)].find(isString);
    if (html !== undefined) pages.set(part.id, html);
  }
  return pages;
};

const renderPageSources = (message: JsonObject) => {
  const sources = new Set<string>();
  for (const html of renderPages(message).values()) {
    for (const source of renderPageImageSources(html)) sources.add(source);
  }
  return sources;
};

const decodeComparablePath = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const comparablePath = (value: string) => {
  let text = value;
  if (/^file:\/\//i.test(text)) {
    try {
      text = new URL(text).pathname;
    } catch {
      return '';
>>>>>>> upstream/main:packages/web/server/lib/markdown-image-grants/routes.ts
    }
  }
<<<<<<< HEAD:packages/web/server/lib/markdown-image-grants/routes.js
  return sources;
};

const fetchMessage = async ({ sessionId, messageId, sessionService }) => {
  const snapshot = SessionSnapshotSchema.parse(await sessionService.open(sessionId));
  if (snapshot.session.sessionId !== sessionId) throw new Error('Canonical snapshot scope mismatch');
  const locate = (selection) => {
    const settled = new Set(selection.turns.filter((turn) => ['completed', 'failed', 'cancelled'].includes(turn.status)).map((turn) => turn.turnId));
    return selection.messages.find((message) => message.messageId === messageId && message.role === 'assistant' && settled.has(message.turnId));
  };
  const recent = locate(snapshot);
  if (recent) return recent;
  let cursor;
  do {
    const query = new URLSearchParams({ limit: '100', ...(cursor ? { cursor } : {}) });
    const page = HistoryPageSchema.parse(await sessionService.history(sessionId, query.toString()));
    if (page.sessionId !== sessionId) throw new Error('Canonical history scope mismatch');
    const message = locate(page);
    if (message) return message;
    cursor = page.nextCursor;
  } while (cursor);
  return null;
};

const inspectImage = async ({ source, directory, approvedTempRoot, fsPromises, path }) => {
  const parsed = parseFileSource(source);
  if (!parsed) return { status: 'error' };
  const sourcePath = path.isAbsolute(parsed) ? parsed : path.resolve(directory, parsed);
  const workspaceRoot = path.resolve(directory);
  const outsideWorkspace = !isWithin(path.resolve(sourcePath), workspaceRoot, path);
  const root = outsideWorkspace ? approvedTempRoot : workspaceRoot;

  try {
    // Resolve symlinks before comparing roots; lexical prefixes are not an authorization boundary.
    const [canonicalRoot, canonicalPath] = await Promise.all([
      fsPromises.realpath(root),
      fsPromises.realpath(sourcePath),
    ]);
    if (!isWithin(canonicalPath, canonicalRoot, path)) return { status: 'error' };
    // Native image, browser and computer tools write these direct temp files.
    // A Host-approved temp root is not permission to read unrelated temp data.
    if (outsideWorkspace && (path.dirname(canonicalPath) !== canonicalRoot
      || !/^omp-(?:image|sshots|screenshot-diff|computer)-[A-Za-z0-9_-]+\.(?:png|jpe?g|gif|webp)$/i.test(path.basename(canonicalPath)))) {
      return { status: 'error' };
||||||| bc50ba56aa:packages/web/server/lib/markdown-image-grants/routes.js
  try {
    text = decodeURIComponent(text);
  } catch {
    // A stray % in a literal path stays as written.
  }
  text = text.replace(/\\/g, '/');
  return /^\/[A-Za-z]:\//.test(text) ? text.slice(1) : text;
};

// The tools whose stored result names image files the chat draws in their row,
// with the reader of those names. `browser.capture` runs behind Code Mode, so
// its result is usually an `execute` call's.
const TOOL_RESULT_IMAGE_PATHS = new Map([
  ['openchamber_image', generatedImagePaths],
  ['openchamber_web', capturedScreenshotPaths],
  ['execute', capturedScreenshotPaths],
]);

/**
 * The files the message's openchamber_image calls saved and its page
 * screenshots, named by the result each call stored, as `comparablePath`
 * spells them. The chat draws them in the call's row.
 */
const toolResultImageSources = (message) => {
  const sources = new Set();
  for (const part of messageContent(message)) {
    const readPaths = part?.type === 'tool' ? TOOL_RESULT_IMAGE_PATHS.get(part.name) : undefined;
    if (!readPaths || part.state?.status !== 'completed') continue;
    for (const item of Array.isArray(part.state.content) ? part.state.content : []) {
      if (item?.type !== 'text' || !isString(item.text)) continue;
      for (const source of readPaths(item.text)) sources.add(comparablePath(source));
=======
  text = decodeComparablePath(text).replace(/\\/g, '/');
  return /^\/[A-Za-z]:\//.test(text) ? text.slice(1) : text;
};

const TOOL_RESULT_IMAGE_PATHS = new Map([
  ['openchamber_image', generatedImagePaths],
  ['openchamber_web', capturedScreenshotPaths],
  ['execute', capturedScreenshotPaths],
]);

const toolResultImageSources = (message: JsonObject) => {
  const sources = new Set<string>();
  for (const part of messageContent(message)) {
    if (!isJsonRecord(part)) continue;
    const readPaths = part.type === 'tool' && isString(part.name) ? TOOL_RESULT_IMAGE_PATHS.get(part.name) : undefined;
    if (!readPaths || !isJsonRecord(part.state) || part.state.status !== 'completed') continue;
    for (const item of Array.isArray(part.state.content) ? part.state.content : []) {
      if (!isJsonRecord(item) || item.type !== 'text' || !isString(item.text)) continue;
      for (const source of readPaths(item.text)) sources.add(comparablePath(source));
>>>>>>> upstream/main:packages/web/server/lib/markdown-image-grants/routes.ts
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
    if (error?.code === 'ENOENT') return { status: 'missing' };
    if (error?.code === 'EACCES' || error?.code === 'EPERM' || error?.code === 'ELOOP') {
      return { status: 'error' };
    }
    throw error;
  }
<<<<<<< HEAD:packages/web/server/lib/markdown-image-grants/routes.js
||||||| bc50ba56aa:packages/web/server/lib/markdown-image-grants/routes.js
  return sources;
};

const fetchMessage = async ({ sessionId, messageId, directory, buildOpenCodeUrl, getOpenCodeAuthHeaders }) => {
  const url = new URL(buildOpenCodeUrl(
    `/api/session/${encodeURIComponent(sessionId)}/message/${encodeURIComponent(messageId)}`,
    '',
  ));
  url.searchParams.set('directory', directory);
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      // Percent-encoded to match the SDK wire format; raw non-ASCII values
      // are rejected by OpenCode.
      'x-opencode-directory': encodeURIComponent(directory),
      ...getOpenCodeAuthHeaders(),
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`OpenCode returned ${response.status}`);
  const message = unwrapOpenCodeResponse(await response.json().catch(() => null));
  return message && typeof message === 'object' && typeof message.id === 'string' ? message : null;
=======
  return sources;
};

const fetchMessage = async ({ sessionId, messageId, directory, buildOpenCodeUrl, getOpenCodeAuthHeaders }: MessageLookup) => {
  const url = new URL(buildOpenCodeUrl(
    `/api/session/${encodeURIComponent(sessionId)}/message/${encodeURIComponent(messageId)}`,
    '',
  ));
  url.searchParams.set('directory', directory);
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'x-opencode-directory': encodeURIComponent(directory),
      ...getOpenCodeAuthHeaders(),
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`OpenCode returned ${response.status}`);
  const body: JsonValue = await response.json().catch(() => null);
  const message = unwrapOpenCodeResponse(body);
  return isJsonRecord(message) && isString(message.id) ? message : null;
>>>>>>> upstream/main:packages/web/server/lib/markdown-image-grants/routes.ts
};

<<<<<<< HEAD:packages/web/server/lib/markdown-image-grants/routes.js
export const registerMarkdownImageGrantRoutes = (app, dependencies) => {
  const { fsPromises, path, crypto, sessionService, resolveSessionScope, approvedTempRoot, now = Date.now } = dependencies;
  if (typeof sessionService?.open !== 'function' || typeof sessionService?.history !== 'function'
    || typeof resolveSessionScope !== 'function' || !approvedTempRoot) {
    throw new TypeError('Canonical session reader, Host scope resolver and approved image root are required');
  }
  const grants = new Map();
  const ttl = 10 * 60 * 1000;
  const prune = () => {
    for (const [id, grant] of grants) if (grant.expiresAt <= now()) grants.delete(id);
    while (grants.size >= 256) grants.delete(grants.keys().next().value);
  };
  const route = '/api/openchamber/sessions/:sessionId/markdown-image-grants';
  app.post(route, express.json({ limit: '32kb' }), async (req, res) => {
    const sessionId = asString(req.params.sessionId);
    const messageId = asString(req.body?.messageId);
    const sources = req.body?.sources;
    if (!EntityIdSchema.safeParse(sessionId).success || !EntityIdSchema.safeParse(messageId).success
      || !Array.isArray(sources) || sources.length === 0 || sources.length > MAX_IMAGE_SOURCES
      || sources.some((source) => typeof source !== 'string' || !source.trim())) {
      return res.status(400).json({ error: 'sessionId, messageId, and 1-12 sources are required' });
    }
    try {
      // Client directories never authorize filesystem reads or message access.
      const scope = await resolveSessionScope(sessionId);
      if (!scope?.cwd || !scope?.workspaceId) return res.status(403).json({ error: 'Session scope unavailable' });
      const message = await fetchMessage({ sessionId, messageId, sessionService });
      if (!message) return res.status(404).json({ error: 'Assistant message not found' });
      const referenced = markdownImageSources(message);
      const results = [];
      for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
        const source = sources[sourceIndex].trim();
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
||||||| bc50ba56aa:packages/web/server/lib/markdown-image-grants/routes.js
export const registerMarkdownImageGrantRoutes = (app, dependencies) => {
  const {
    fsPromises,
    path,
    crypto,
    validateDirectoryPath,
    buildOpenCodeUrl,
    getOpenCodeAuthHeaders,
  } = dependencies;

  app.post(
    '/api/openchamber/sessions/:sessionId/markdown-image-grants',
    // A drawn page may name hundreds of local images (the page itself takes up
    // to 200 000 characters), and the chat asks for all of them in one body.
    express.json({ limit: '256kb' }),
    async (req, res) => {
      const sessionId = asString(req.params.sessionId);
      const messageId = asString(req.body?.messageId);
      const sources = Array.isArray(req.body?.sources)
        ? [...new Set(req.body.sources.map(asString).filter(Boolean))]
        : [];
      // The page the sources belong to, when the chat draws an openchamber_render page.
      const callId = asString(req.body?.callId);
      if (!sessionId || !messageId || sources.length === 0) {
        return res.status(400).json({ error: 'sessionId, messageId, and sources are required' });
=======
export const registerMarkdownImageGrantRoutes = (app: Application, dependencies: MarkdownImageGrantDependencies) => {
  const {
    fsPromises,
    path,
    crypto,
    validateDirectoryPath,
    buildOpenCodeUrl,
    getOpenCodeAuthHeaders,
  } = dependencies;

  app.post(
    '/api/openchamber/sessions/:sessionId/markdown-image-grants',
    express.json({ limit: '256kb' }),
    async (req, res) => {
      const body = isRecord(req.body) ? req.body : undefined;
      const sessionId = asNonEmptyString(req.params.sessionId);
      const messageId = asNonEmptyString(body?.messageId);
      const sources = Array.isArray(body?.sources)
        ? [...new Set(body.sources.map(asNonEmptyString).filter((source) => source !== null))]
        : [];
      const callId = asNonEmptyString(body?.callId);
      if (!sessionId || !messageId || sources.length === 0) {
        return res.status(400).json({ error: 'sessionId, messageId, and sources are required' });
>>>>>>> upstream/main:packages/web/server/lib/markdown-image-grants/routes.ts
      }
<<<<<<< HEAD:packages/web/server/lib/markdown-image-grants/routes.js
      return res.json({ results });
    } catch {
      return res.status(503).json({ error: 'Failed to prepare session images' });
    }
  });
  app.get(`${route}/:grantId/raw`, async (req, res) => {
    const grant = grants.get(req.params.grantId);
    if (!grant || grant.expiresAt <= now() || grant.sessionId !== req.params.sessionId) {
      if (grant?.expiresAt <= now()) grants.delete(req.params.grantId);
      return res.status(404).json({ error: 'Image grant unavailable' });
    }
    try {
      const scope = await resolveSessionScope(grant.sessionId);
      if (scope.workspaceId !== grant.workspaceId || scope.rootSessionId !== grant.rootSessionId || scope.cwd !== grant.cwd) {
        return res.status(403).json({ error: 'Session scope changed' });
||||||| bc50ba56aa:packages/web/server/lib/markdown-image-grants/routes.js
      const validatedDirectory = await validateDirectoryPath(asString(req.body?.directory));
      if (!validatedDirectory.ok) {
        return res.status(400).json({ error: validatedDirectory.error || 'Invalid directory' });
=======
      const validatedDirectory = await validateDirectoryPath(asNonEmptyString(body?.directory) ?? '');
      if (!validatedDirectory.ok) {
        return res.status(400).json({ error: validatedDirectory.error || 'Invalid directory' });
>>>>>>> upstream/main:packages/web/server/lib/markdown-image-grants/routes.ts
      }
      // Recheck realpath containment, size and signature at use time. Hold the
      // no-follow descriptor while reading so a replaced symlink cannot escape.
      const inspected = await inspectImage({ source: grant.source, directory: scope.cwd, approvedTempRoot, fsPromises, path });
      if (inspected.status !== 'ready' || inspected.path !== grant.path) return res.status(404).json({ error: 'Image unavailable' });
      const handle = await fsPromises.open(grant.path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
      try {
<<<<<<< HEAD:packages/web/server/lib/markdown-image-grants/routes.js
        const stats = await handle.stat();
        if (!stats.isFile() || stats.size > MAX_IMAGE_BYTES) return res.status(404).json({ error: 'Image unavailable' });
        const buffer = Buffer.alloc(stats.size + 1);
        let length = 0;
        while (length < buffer.length) {
          const read = await handle.read(buffer, length, buffer.length - length, length);
          if (read.bytesRead === 0) break;
          length += read.bytesRead;
||||||| bc50ba56aa:packages/web/server/lib/markdown-image-grants/routes.js
        const message = await fetchMessage({
          sessionId,
          messageId,
          directory: validatedDirectory.directory,
          buildOpenCodeUrl,
          getOpenCodeAuthHeaders,
        });
        // v2 messages are flat records with a `type` discriminator.
        if (!message || message.id !== messageId || message.type !== 'assistant') {
          return res.status(404).json({ error: 'Assistant message not found' });
=======
        const message = await fetchMessage({
          sessionId,
          messageId,
          directory: validatedDirectory.directory,
          buildOpenCodeUrl,
          getOpenCodeAuthHeaders,
        });
        if (!message || message.id !== messageId || message.type !== 'assistant') {
          return res.status(404).json({ error: 'Assistant message not found' });
>>>>>>> upstream/main:packages/web/server/lib/markdown-image-grants/routes.ts
        }
<<<<<<< HEAD:packages/web/server/lib/markdown-image-grants/routes.js
        const bytes = buffer.subarray(0, length);
        if (length > stats.size || !hasImageSignature(bytes)) return res.status(404).json({ error: 'Image unavailable' });
        const header = bytes.subarray(0, 12).toString('ascii');
        const mime = bytes[0] === 0x89 ? 'image/png' : bytes[0] === 0xff ? 'image/jpeg' : header.startsWith('GIF') ? 'image/gif' : 'image/webp';
        res.set({ 'Content-Type': mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
        return res.send(bytes);
      } finally { await handle.close(); }
    } catch { return res.status(503).json({ error: 'Image unavailable' }); }
  });
||||||| bc50ba56aa:packages/web/server/lib/markdown-image-grants/routes.js
        const inspect = (source) => inspectLocalImage({
          source,
          directory: validatedDirectory.directory,
          fsPromises,
          path,
        }).catch(() => ({ status: 'error' }));
        // The assistant's text and pages are authoritative: a remote client cannot mint grants for unreferenced paths.
        // A page's images are checked together, so the page shows them in its own order up to its weight budget.
        let check;
        if (callId) {
          const html = renderPages(message).get(callId);
          if (html === undefined) return res.status(404).json({ error: 'Page not found' });
          const { images } = await fitRenderPageImages(html, inspect);
          const checked = new Map(images.map((image) => [image.source, image]));
          check = (source) => checked.get(source) ?? { status: 'error' };
        } else {
          const referenced = new Set([...markdownImageSources(message), ...renderPageSources(message)]);
          const generated = toolResultImageSources(message);
          check = (source) => (referenced.has(source) || generated.has(comparablePath(source)) ? inspect(source) : { status: 'error' });
        }
        const results = [];
        for (const source of sources) {
          try {
            const inspected = await check(source);
            if (inspected.status !== 'ready') {
              results.push({ source, status: inspected.status });
              continue;
            }
            // Reuse the existing path-bound raw-file grant instead of creating another asset lifecycle.
            const grant = inspected.outsideWorkspace
              ? await mintOutsideFileGrant(inspected.path, {
                scopes: ['raw'],
                fsPromises,
                path,
                crypto,
              })
              : null;
            results.push({
              source,
              status: 'ready',
              path: inspected.path,
              outsideFileGrant: grant?.outsideFileGrant,
              expiresAt: grant?.expiresAt,
            });
          } catch {
            results.push({ source, status: 'error' });
          }
        }
        return res.json({ results });
      } catch (error) {
        console.warn('[MarkdownImageGrants] failed to prepare images:', error?.message || error);
        return res.status(503).json({ error: 'Failed to prepare session images' });
      }
    },
  );
=======
        const inspect = (source: string) => inspectLocalImage({
          source,
          directory: validatedDirectory.directory,
          fsPromises,
          path,
        }).catch((): LocalImageInspection => ({ status: 'error' }));
        let check: (source: string) => LocalImageInspection | PageImageInspection | Promise<LocalImageInspection>;
        if (callId) {
          const html = renderPages(message).get(callId);
          if (html === undefined) return res.status(404).json({ error: 'Page not found' });
          const { images } = await fitRenderPageImages(html, inspect);
          const checked = new Map(images.map((image) => [image.source, image]));
          check = (source) => checked.get(source) ?? { status: 'error' };
        } else {
          const referenced = new Set([...markdownImageSources(message), ...renderPageSources(message)]);
          const generated = toolResultImageSources(message);
          check = (source) => (referenced.has(source) || generated.has(comparablePath(source)) ? inspect(source) : { status: 'error' });
        }
        const results = [];
        for (const source of sources) {
          try {
            const inspected = await check(source);
            if (inspected.status !== 'ready') {
              results.push({ source, status: inspected.status });
              continue;
            }
            const grant = inspected.outsideWorkspace
              ? await mintOutsideFileGrant(inspected.path, {
                scopes: ['raw'],
                fsPromises,
                path,
                crypto,
              })
              : null;
            results.push({
              source,
              status: 'ready',
              path: inspected.path,
              outsideFileGrant: grant?.outsideFileGrant,
              expiresAt: grant?.expiresAt,
            });
          } catch {
            results.push({ source, status: 'error' });
          }
        }
        return res.json({ results });
      } catch (error) {
        console.warn('[MarkdownImageGrants] failed to prepare images:', (hasErrorMessage(error) && error.message) || error);
        return res.status(503).json({ error: 'Failed to prepare session images' });
      }
    },
  );
>>>>>>> upstream/main:packages/web/server/lib/markdown-image-grants/routes.ts
};
