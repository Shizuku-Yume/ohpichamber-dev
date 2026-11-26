import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { decodeArchive, encodeArchive } from './archive.ts';
import type { SessionReference } from './references.ts';

const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const transcript = Buffer.from('{"type":"session","id":"native-root"}\n');
const manifest = (path = 'session.jsonl', payload = transcript) => ({ format: 'ohpichamber.native-session' as const, version: 1 as const,
  sessionId: 'root', nativeId: 'native-root', transcript: 'session.jsonl', createdAt: 1, updatedAt: 2,
  privateRoots: [], children: [], blobs: [], files: [{ member: '00000001', path, sha256: digest(payload) }] });

test('native archive codec round trips sequential regular ustar payloads', () => {
  const decoded = decodeArchive(encodeArchive(manifest(), [transcript]));
  expect(decoded.manifest.sessionId).toBe('root');
  expect(decoded.members.get('00000001')).toEqual(transcript);
});

test('native archive codec rejects path traversal, overlapping paths and unregistered members', () => {
  expect(() => encodeArchive(manifest('../escape'), [transcript])).toThrow();
  const overlapping = manifest();
  overlapping.files.push({ member: '00000002', path: 'session.jsonl/child.jsonl', sha256: digest(transcript) });
  expect(() => decodeArchive(encodeArchive(overlapping, [transcript, transcript]))).toThrow();
  const archive = encodeArchive(manifest(), [transcript]);
  archive[1024] = 0x78;
  expect(() => decodeArchive(archive)).toThrow();
});

test('session export/import round trip carries changes.jsonl and blobs/ journal artifacts', async () => {
  const { randomUUID } = await import('node:crypto');
  const { mkdir, mkdtemp, readFile, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { SessionManager } = await import('@oh-my-pi/pi-coding-agent/session/session-manager');
  const { exportNativeArchive, importNativeArchive } = await import('./archive.ts');
  const root = await mkdtemp(join(tmpdir(), 'archive-journal-'));
  const previousHome = process.env.HOME;
  const previousAgentDirectory = process.env.PI_CODING_AGENT_DIR;
  process.env.HOME = root;
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  process.env.PI_CODING_AGENT_DIR = agentDirectory;
  await Promise.all([cwd, agentDirectory].map(directory => mkdir(directory, { recursive: true })));
  const sessionsDirectory = SessionManager.getDefaultSessionDir(cwd, agentDirectory);
  const manager = SessionManager.create(cwd, sessionsDirectory);
  manager.appendMessage({ role: 'user', content: 'prompt', timestamp: Date.now() - 5000 });
  manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'answer' }], timestamp: Date.now() - 4000 });
  await manager.ensureOnDisk();
  await manager.flush();
  const sessionFile = manager.getSessionFile();
  if (!sessionFile) throw new Error('session file required');
  await manager.close();
  const artifactsDir = sessionFile.slice(0, -'.jsonl'.length);
  await mkdir(join(artifactsDir, 'blobs'), { recursive: true });
  const journalContent = '{"type":"change","at":1,"agent":"Main","tool":"write","path":"/w/a.ts","base":null,"edit":[[0,0,["x"]]],"sum":"abc"}\n';
  await writeFile(join(artifactsDir, 'changes.jsonl'), journalContent);
  const blobContent = new Uint8Array(Bun.gzipSync(new TextEncoder().encode('blob-content')));
  await writeFile(join(artifactsDir, 'blobs', 'blobkey1'), blobContent);
  const now = Date.now();
  const reference: SessionReference = {
    rootSessionId: randomUUID(), projectId: randomUUID(), workspaceId: randomUUID(), cwd,
    agentDirectory, displayPath: 'workspace', sessionFile, sessionsDirectory,
    createdAt: now, updatedAt: now,
  };
  const archive = await exportNativeArchive(reference, []);
  const bundlePath = join(root, 'bundle.tar');
  await writeFile(bundlePath, archive);
  const destinationDirectory = join(root, 'imported');
  const imported = await importNativeArchive({
    sessionId: reference.rootSessionId, bundlePath, destinationDirectory,
    spaceId: randomUUID(), archivedAt: now,
    scope: { projectId: reference.projectId, workspaceId: reference.workspaceId, cwd, agentDirectory },
  });
  const importedArtifacts = imported.reference.sessionFile.slice(0, -'.jsonl'.length);
  const importedJournal = await readFile(join(importedArtifacts, 'changes.jsonl'), 'utf8');
  expect(importedJournal).toBe(journalContent);
  const importedBlob = new Uint8Array(await readFile(join(importedArtifacts, 'blobs', 'blobkey1')));
  expect(Buffer.from(importedBlob).equals(Buffer.from(blobContent))).toBe(true);
  process.env.HOME = previousHome;
  process.env.PI_CODING_AGENT_DIR = previousAgentDirectory;
});
