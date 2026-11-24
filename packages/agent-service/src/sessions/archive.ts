import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { BlobStore, parseBlobRef } from '@oh-my-pi/pi-coding-agent/session/blob-store';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { isExternalizableImagePosition } from '@oh-my-pi/pi-coding-agent/session/session-persistence';
import { getBlobsDir } from '@oh-my-pi/pi-utils';
import { EntityIdSchema, JsonValueSchema, SubagentSchema, TimestampSchema } from '@openchamber/agent-contract';
import type { JsonValue } from '@openchamber/agent-contract';
import { z } from 'zod';
import { SessionReferenceError, type ChildReference, type SessionReference } from './references.ts';

const ARCHIVE_BYTE_LIMIT = 256 * 1024 * 1024;
const memberName = (index: number) => index.toString().padStart(8, '0');
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const safePath = (value: string) => value.length > 0 && !isAbsolute(value) && !value.includes('\\') && !value.includes('\0')
  && value.split('/').every(part => part !== '' && part !== '.' && part !== '..' && !part.includes(':'));
const RelativePathSchema = z.string().refine(safePath);
const MemberSchema = z.string().regex(/^\d{8}$/);
const FileSchema = z.strictObject({ member: MemberSchema, path: RelativePathSchema, sha256: z.string().regex(/^[a-f0-9]{64}$/) });
const ChildSchema = SubagentSchema.extend({ file: RelativePathSchema, nativeId: z.string().min(1) }).required({ childSessionId: true });
const JsonRecordSchema = z.record(z.string(), JsonValueSchema);
const ImageGenerationBlobSchema = z.object({ type: z.literal('image_generation_call'), result: z.string() });
const ImageUrlBlobSchema = z.object({ image_url: z.string() });
interface PendingBlobReference {
  value: JsonValue;
  key?: string;
}
const ManifestSchema = z.strictObject({
  format: z.literal('ohpichamber.native-session'), version: z.literal(1), sessionId: EntityIdSchema,
  parentSessionId: EntityIdSchema.optional(),
  nativeId: z.string().min(1), transcript: RelativePathSchema, createdAt: TimestampSchema, updatedAt: TimestampSchema,
  files: z.array(FileSchema), children: z.array(ChildSchema),
  privateRoots: z.array(z.strictObject({ root: z.string().min(1).refine(isAbsolute), label: z.enum(['workspace', 'agent-directory', 'session-storage']) })),
  blobs: z.array(z.strictObject({ member: MemberSchema, sha256: z.string().regex(/^[a-f0-9]{64}$/) })),
});
type Manifest = z.infer<typeof ManifestSchema>;
export interface DecodedArchive { manifest: Manifest; members: ReadonlyMap<string, Buffer> }
export const ArchiveImportRequestSchema = z.strictObject({
  sessionId: EntityIdSchema, bundlePath: z.string().refine(isAbsolute), destinationDirectory: z.string().refine(isAbsolute),
  spaceId: EntityIdSchema, archivedAt: TimestampSchema,
  scope: z.strictObject({ projectId: EntityIdSchema, workspaceId: EntityIdSchema, cwd: z.string().refine(isAbsolute),
    agentDirectory: z.string().refine(isAbsolute), agentDirectoryId: EntityIdSchema.optional() }),
});
export type ArchiveImportRequest = z.infer<typeof ArchiveImportRequestSchema>;
function invalid(message = 'Native archive is malformed'): never { throw new SessionReferenceError(400, 'INVALID_REQUEST', message); }
function bounded(bytes: number): void { if (bytes > ARCHIVE_BYTE_LIMIT) throw new SessionReferenceError(413, 'PAYLOAD_TOO_LARGE', 'Native archive exceeds 256 MiB'); }
export function assertArchiveActive(signal: AbortSignal): void {
  if (signal.aborted) throw new SessionReferenceError(503, 'SESSION_RESTORE_FAILED', 'Native archive transfer was cancelled or exceeded five minutes');
}

/** No archive paths reach an extractor. Only sequential, regular ustar members are accepted. */
export function decodeArchive(data: Buffer): DecodedArchive {
  bounded(data.length);
  if (data.length < 1024 || data.length % 512 !== 0) invalid();
  const members = new Map<string, Buffer>();
  let offset = 0;
  const text = (header: Buffer, start: number, size: number) => header.subarray(start, start + size).toString('ascii').replace(/\0.*$/s, '');
  const octal = (header: Buffer, start: number, size: number): number => {
    const value = header.subarray(start, start + size).toString('ascii');
    if (!/^[0-7]+[\0 ]*$/.test(value)) invalid();
    const parsed = Number.parseInt(value, 8);
    if (!Number.isSafeInteger(parsed)) invalid();
    return parsed;
  };
  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      if (offset + 1024 > data.length || !data.subarray(offset).every(byte => byte === 0)) invalid('Invalid tar terminator');
      return validateManifest(members);
    }
    const name = text(header, 0, 100);
    if (name !== memberName(members.size) || members.has(name) || text(header, 157, 100) !== '' || text(header, 345, 155) !== ''
      || header[156] !== 48 || header.subarray(257, 263).toString('ascii') !== 'ustar\0'
      || header.subarray(263, 265).toString('ascii') !== '00') invalid('Only ordinal regular ustar members are accepted');
    let checksum = 0;
    for (let index = 0; index < 512; index++) checksum += index >= 148 && index < 156 ? 32 : header[index]!;
    if (octal(header, 148, 8) !== checksum) invalid('Tar checksum mismatch');
    const size = octal(header, 124, 12);
    const end = offset + 512 + size;
    const next = offset + 512 + Math.ceil(size / 512) * 512;
    if (end > data.length || next > data.length || !data.subarray(end, next).every(byte => byte === 0)) invalid('Truncated tar member');
    members.set(name, data.subarray(offset + 512, end));
    offset = next;
  }
  return invalid('Missing tar terminator');
}
function validateManifest(members: Map<string, Buffer>): DecodedArchive {
  let manifest: Manifest;
  try { manifest = ManifestSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(members.get(memberName(0))))); }
  catch { return invalid('Invalid native archive manifest'); }
  const used = new Set([memberName(0)]);
  const paths = new Set<string>();
  for (const file of manifest.files) {
    if (paths.has(file.path) || used.has(file.member)) invalid('Duplicate archive destination');
    const bytes = members.get(file.member);
    if (!bytes || hash(bytes) !== file.sha256) invalid('Archive file digest mismatch');
    paths.add(file.path); used.add(file.member);
  }
  for (const file of paths) {
    let end = file.lastIndexOf('/');
    while (end > 0) {
      if (paths.has(file.slice(0, end))) invalid('Overlapping archive destinations');
      end = file.lastIndexOf('/', end - 1);
    }
  }
  if (!paths.has(manifest.transcript)) invalid('Missing native transcript');
  const ids = new Set([manifest.sessionId]);
  const subagentIds = new Set<string>();
  const nativeIds = new Set([manifest.nativeId]);
  const transcriptFiles = new Set([manifest.transcript]);
  for (const child of manifest.children) {
    if (ids.has(child.childSessionId) || subagentIds.has(child.subagentId) || nativeIds.has(child.nativeId) || transcriptFiles.has(child.file) || !paths.has(child.file)) invalid('Invalid child registration');
    ids.add(child.childSessionId); subagentIds.add(child.subagentId); nativeIds.add(child.nativeId); transcriptFiles.add(child.file);
  }
  const byChild = new Map(manifest.children.map(child => [child.childSessionId, child]));
  const connected = new Set([manifest.sessionId]);
  for (const child of manifest.children) {
    const ancestors = new Set<string>();
    let current = child.childSessionId;
    while (!connected.has(current)) {
      if (ancestors.has(current)) invalid('Cyclic child registration');
      ancestors.add(current);
      const ancestor = byChild.get(current);
      if (!ancestor) invalid('Missing child parent');
      current = ancestor.parentSessionId;
    }
    for (const id of ancestors) connected.add(id);
  }
  const blobs = new Set<string>();
  for (const blob of manifest.blobs) {
    const bytes = members.get(blob.member);
    if (used.has(blob.member) || blobs.has(blob.sha256) || !bytes || hash(bytes) !== blob.sha256) invalid('Blob digest mismatch');
    used.add(blob.member); blobs.add(blob.sha256);
  }
  if (used.size !== members.size) invalid('Unexpected tar members');
  const fileByPath = new Map(manifest.files.map(file => [file.path, file]));
  const referencedBlobs = new Set<string>();
  for (const [file, nativeId] of [[manifest.transcript, manifest.nativeId], ...manifest.children.map(child => [child.file, child.nativeId])] as const) {
    const descriptor = fileByPath.get(file)!;
    const identity = transcriptIdentity(members.get(descriptor.member)!);
    if (!identity || identity.id !== nativeId) invalid('Native transcript identity mismatch');
    validateAttachmentContent(members.get(descriptor.member)!);
    for (const ref of blobReferences(members.get(descriptor.member)!)) referencedBlobs.add(ref);
  }
  if (referencedBlobs.size !== blobs.size || [...referencedBlobs].some(ref => !blobs.has(ref))) invalid('Missing or unreferenced native blob');
  return { manifest, members };
}
export function encodeArchive(manifest: Manifest, payloads: readonly Buffer[]): Buffer {
  const bodies = [Buffer.from(JSON.stringify(ManifestSchema.parse(manifest))), ...payloads];
  const size = bodies.reduce((sum, body) => sum + 512 + Math.ceil(body.length / 512) * 512, 1024);
  bounded(size);
  const result = Buffer.alloc(size);
  let offset = 0;
  for (const [index, body] of bodies.entries()) {
    const header = result.subarray(offset, offset + 512);
    header.write(memberName(index), 0, 'ascii');
    const octal = (value: number, start: number, length: number) => header.write(value.toString(8).padStart(length - 1, '0') + '\0', start, length, 'ascii');
    octal(0o600, 100, 8); octal(0, 108, 8); octal(0, 116, 8); octal(body.length, 124, 12); octal(0, 136, 12);
    header.fill(32, 148, 156); header[156] = 48; header.write('ustar\0', 257, 'ascii'); header.write('00', 263, 'ascii');
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
    body.copy(result, offset + 512);
    offset += 512 + Math.ceil(body.length / 512) * 512;
  }
  return result;
}
const HeaderSchema = z.object({ type: z.literal('session'), id: z.string().min(1), parentSession: z.string().optional() });
function transcriptIdentity(data: Buffer): z.infer<typeof HeaderSchema> | undefined {
  let header: z.infer<typeof HeaderSchema> | undefined;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const entry: unknown = JSON.parse(line);
      const parsed = HeaderSchema.safeParse(entry);
      if (parsed.success) { if (header) invalid('Duplicate native session header'); header = parsed.data; }
      else if (!z.object({ type: z.string().min(1) }).safeParse(entry).success) invalid('Invalid native transcript entry');
    }
  } catch { return undefined; }
  return header;
}
function validateAttachmentContent(data: Buffer): void {
  const entries: unknown[] = data.toString('utf8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
  const messageSchema = z.object({ type: z.literal('message'), id: z.string(), message: z.object({ content: z.unknown() }) });
  const referenceSchema = z.object({ type: z.literal('custom'), customType: z.literal('ohpichamber.canonical.v1'),
    data: z.object({ nativeEntryId: z.string(), attachments: z.array(z.object({ mediaType: z.string() })) }) });
  const messages = new Map<string, unknown>();
  for (const entry of entries) { const parsed = messageSchema.safeParse(entry); if (parsed.success) messages.set(parsed.data.id, parsed.data.message.content); }
  for (const entry of entries) {
    const parsed = referenceSchema.safeParse(entry);
    if (!parsed.success || !parsed.data.data.attachments.length) continue;
    const attachments = parsed.data.data.attachments;
    if (attachments.some(attachment => !attachment.mediaType.startsWith('image/'))) {
      invalid('Native archive cannot preserve an external non-image attachment; its original bytes are not native-owned');
    }
    const images = z.array(z.unknown()).safeParse(messages.get(parsed.data.data.nativeEntryId));
    if (!images.success || images.data.filter(value => z.object({ type: z.literal('image'), data: z.string().min(1) }).safeParse(value).success).length < attachments.length) {
      invalid('Native image attachment bytes are missing');
    }
  }
}
function blobReferences(data: Buffer): Set<string> {
  const refs = new Set<string>();
  const pending: PendingBlobReference[] = data.toString('utf8').split('\n').filter(line => line.trim()).map(line => ({ value: JsonValueSchema.parse(JSON.parse(line)) }));
  const add = (value: string) => {
    if (!value.startsWith('blob:')) return;
    const digest = parseBlobRef(value);
    if (!digest) invalid('Malformed native blob reference');
    refs.add(digest);
  };
  while (pending.length) {
    const { value, key } = pending.pop()!;
    if (isExternalizableImagePosition(value, key)) { add(value.data); continue; }
    if (Array.isArray(value)) { for (const item of value) pending.push({ value: item, key }); continue; }
    const imageGeneration = ImageGenerationBlobSchema.safeParse(value);
    if (imageGeneration.success) add(imageGeneration.data.result);
    const imageUrl = ImageUrlBlobSchema.safeParse(value);
    if (imageUrl.success) add(imageUrl.data.image_url);
    const record = JsonRecordSchema.safeParse(value);
    if (record.success) for (const [childKey, child] of Object.entries(record.data)) pending.push({ value: child, key: childKey });
  }
  return refs;
}
async function regularFile(file: string, remaining: number, signal: AbortSignal): Promise<Buffer> {
  assertArchiveActive(signal);
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile()) invalid('Archive source is not a regular file');
    bounded(ARCHIVE_BYTE_LIMIT - remaining + info.size);
    const data = Buffer.alloc(info.size);
    let position = 0;
    while (position < data.length) {
      const { bytesRead } = await handle.read(data, position, data.length - position, position);
      assertArchiveActive(signal);
      if (!bytesRead) invalid('Archive source changed during read');
      position += bytesRead;
    }
    const extra = Buffer.alloc(1);
    if ((await handle.read(extra, 0, 1, position)).bytesRead !== 0) invalid('Archive source changed during read');
    return data;
  } finally { await handle.close(); }
}

export async function exportNativeArchive(reference: SessionReference, registered: readonly ChildReference[], signal: AbortSignal = AbortSignal.timeout(300_000)): Promise<Buffer> {
  assertArchiveActive(signal);
  const payloads: Buffer[] = [];
  const files: Manifest['files'] = [];
  const sourcePaths = new Map<string, string>();
  let bytes = 1024;
  const add = async (source: string, path: string) => {
    if (sourcePaths.has(source)) return;
    if (!safePath(path)) invalid('Invalid artifact path');
    const data = await regularFile(source, ARCHIVE_BYTE_LIMIT - bytes, signal);
    bytes += 512 + Math.ceil(data.length / 512) * 512; bounded(bytes);
    files.push({ member: memberName(payloads.length + 1), path, sha256: hash(data) });
    sourcePaths.set(source, path); payloads.push(data);
  };
  const walk = async (source: string, path: string, allowMissing = false): Promise<void> => {
    assertArchiveActive(signal);
    try { if (!(await lstat(source)).isDirectory()) invalid('Artifact source is not a directory'); }
    catch (error) { if (allowMissing && z.object({ code: z.literal('ENOENT') }).safeParse(error).success) return; throw error; }
    const entries = await readdir(source, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      assertArchiveActive(signal);
      const child = join(source, entry.name);
      if (entry.isDirectory()) await walk(child, `${path}/${entry.name}`);
      else if (entry.isFile()) await add(child, `${path}/${entry.name}`);
      else invalid('Artifact links and special files cannot be archived');
    }
  };
  await add(reference.sessionFile, 'session.jsonl');
  await walk(reference.sessionFile.slice(0, -6), 'session', true);
  for (const [index, child] of registered.entries()) if (!sourcePaths.has(child.sessionFile)) {
    await add(child.sessionFile, `child-${index}.jsonl`);
    await walk(child.sessionFile.slice(0, -6), `child-${index}`, true);
  }
  const rootIdentity = transcriptIdentity(payloads[0]!);
  if (!rootIdentity) invalid('Missing native session header');
  const children: Manifest['children'] = [];
  const fileIndexes = new Map(files.map((file, index) => [file.path, index]));
  const registeredByFile = new Map(registered.map(child => [child.sessionFile, child]));
  const discovered = new Map<string, { file: string; identity: z.infer<typeof HeaderSchema>; record?: ChildReference }>();
  for (const [source, path] of sourcePaths) if (source.endsWith('.jsonl') && source !== reference.sessionFile) {
    const identity = transcriptIdentity(payloads[fileIndexes.get(path)!]!);
    if (!identity && registeredByFile.has(source)) invalid('Registered native child transcript is malformed');
    if (identity) discovered.set(source, { file: path, identity, record: registeredByFile.get(source) });
  }
  const publicIds = new Map<string, string>([[reference.sessionFile, reference.rootSessionId]]);
  for (const [source, child] of discovered) publicIds.set(source, child.record?.childSessionId ?? child.identity.id);
  for (const child of discovered.values()) {
    const parentSessionId = child.record?.parentSessionId ?? (child.identity.parentSession ? publicIds.get(child.identity.parentSession) : undefined);
    if (!parentSessionId) invalid('Native child has no archived parent');
    children.push({ ...child.record, subagentId: child.record?.subagentId ?? child.identity.id,
      childSessionId: child.record?.childSessionId ?? child.identity.id, parentSessionId,
      role: child.record?.role ?? 'subagent', status: child.record?.status === 'running' ? 'failed' : child.record?.status ?? 'completed',
      file: child.file, nativeId: child.identity.id });
  }
  // Original private roots travel only as redaction context, never filesystem authority.
  const manifest: Manifest = { format: 'ohpichamber.native-session', version: 1, sessionId: reference.rootSessionId,
    nativeId: rootIdentity.id, transcript: 'session.jsonl', createdAt: reference.createdAt, updatedAt: reference.updatedAt, files,
    privateRoots: [{ root: reference.cwd, label: 'workspace' }, { root: reference.agentDirectory, label: 'agent-directory' },
      { root: reference.sessionFile, label: 'session-storage' }, { root: dirname(reference.sessionFile), label: 'session-storage' },
      ...(reference.deletedSpace?.privateRoots ?? [])],
    children: children.map(child => ChildSchema.parse(Object.assign({ subagentId: child.subagentId, parentSessionId: child.parentSessionId,
      childSessionId: child.childSessionId, role: child.role, status: child.status, file: child.file, nativeId: child.nativeId },
      child.toolCallId ? { toolCallId: child.toolCallId } : {}, child.solutionSpace ? { solutionSpace: child.solutionSpace } : {}))), blobs: [] };
  if (reference.parentSessionId) manifest.parentSessionId = reference.parentSessionId;
  const store = new BlobStore(getBlobsDir());
  const transcripts = [manifest.transcript, ...manifest.children.map(child => child.file)];
  const refs = new Set(transcripts.flatMap(file => [...blobReferences(payloads[fileIndexes.get(file)!]!) ]));
  for (const sha256 of refs) {
    const size = store.sizeSync(sha256);
    if (size === null) invalid('Referenced native blob is missing');
    bounded(bytes + 512 + Math.ceil(size / 512) * 512);
    const data = await store.get(sha256);
    assertArchiveActive(signal);
    if (!data || hash(data) !== sha256) invalid('Referenced native blob is missing or corrupt');
    bytes += 512 + Math.ceil(data.length / 512) * 512; bounded(bytes);
    manifest.blobs.push({ member: memberName(payloads.length + 1), sha256 }); payloads.push(data);
  }
  const encoded = encodeArchive(manifest, payloads);
  decodeArchive(encoded);
  assertArchiveActive(signal);
  return encoded;
}

/** Full preflight precedes filesystem writes; the Host alone selects scope and destination. */
export async function importNativeArchive(input: ArchiveImportRequest, signal: AbortSignal = AbortSignal.timeout(300_000)): Promise<{ reference: SessionReference; children: ChildReference[] }> {
  assertArchiveActive(signal);
  const request = ArchiveImportRequestSchema.parse(input);
  const staged = await lstat(request.bundlePath);
  if (!staged.isFile() || staged.isSymbolicLink()) invalid('Archive staging must be a regular file');
  const archive = decodeArchive(await regularFile(request.bundlePath, ARCHIVE_BYTE_LIMIT, signal));
  if (archive.manifest.sessionId !== request.sessionId) invalid('Archive session identity mismatch');
  assertArchiveActive(signal);
  const destination = request.destinationDirectory;
  // mkdir without recursive refuses collisions and never merges with existing session storage.
  await mkdir(destination, { mode: 0o700 });
  try {
    for (const file of archive.manifest.files) {
      assertArchiveActive(signal);
      const target = join(destination, file.path);
      const local = relative(destination, target);
      if (local.startsWith(`..${sep}`) || isAbsolute(local)) invalid();
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, archive.members.get(file.member)!, { flag: 'wx', mode: 0o600 });
    }
    const store = new BlobStore(getBlobsDir());
    await mkdir(store.dir, { recursive: true, mode: 0o700 });
    for (const blob of archive.manifest.blobs) {
      assertArchiveActive(signal);
      const existing = await store.get(blob.sha256);
      if (existing && hash(existing) !== blob.sha256) invalid('Destination blob is corrupt');
      await store.put(archive.members.get(blob.member)!, { hash: blob.sha256 });
    }
    const referenceBase: SessionReference = {
      rootSessionId: request.sessionId, ...request.scope,
      sessionFile: join(destination, archive.manifest.transcript), sessionsDirectory: destination,
      displayPath: '.', createdAt: archive.manifest.createdAt, updatedAt: archive.manifest.updatedAt,
      deletedSpace: { spaceId: request.spaceId, archivedAt: request.archivedAt, directory: destination,
        privateRoots: [...archive.manifest.privateRoots, { root: request.scope.cwd, label: 'workspace' }, { root: request.scope.agentDirectory, label: 'agent-directory' }, { root: destination, label: 'session-storage' }] },
    };
    const reference: SessionReference = Object.assign(referenceBase, archive.manifest.parentSessionId ? { parentSessionId: archive.manifest.parentSessionId } : {});
    // Exercise each actual native consumer before publishing a persistent reference.
    for (const [file, nativeId] of [[archive.manifest.transcript, archive.manifest.nativeId], ...archive.manifest.children.map(child => [child.file, child.nativeId])] as const) {
      const manager = await SessionManager.open(join(destination, file), destination, undefined, { initialCwd: request.scope.cwd, throwIfMissing: true, suppressBreadcrumb: true });
      try { if (manager.getSessionId() !== nativeId) invalid('Native consumer rejected session identity'); }
      finally { await manager.close(); }
      assertArchiveActive(signal);
    }
    const children = archive.manifest.children.map(({ file, nativeId: _nativeId, ...child }) => ({ ...child,
      rootSessionId: request.sessionId, workspaceId: request.scope.workspaceId, projectId: request.scope.projectId, sessionFile: join(destination, file) }));
    assertArchiveActive(signal);
    return { reference, children };
  } catch (error) { await rm(destination, { recursive: true, force: true }); throw error; }
}
