import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { decodeArchive, encodeArchive } from './archive.ts';

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
