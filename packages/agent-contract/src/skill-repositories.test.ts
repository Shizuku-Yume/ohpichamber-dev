import { describe, expect, test } from 'bun:test';
import * as C from './skill-repositories.ts';

const request = { sourceId: 'custom:team', scope: 'workspace', expectedSourceRevision: '0', selections: [{ skillDir: 'skills/review' }] };
describe('Canonical skill repository contracts', () => {
  test('install authority is an approved source ID and CAS revision, never a client URL or Host path', () => {
    expect(C.SkillRepositoryInstallRequestSchema.parse(request)).toEqual(request);
    for (const invalid of [
      { ...request, source: 'https://example.com/team/skills' },
      { ...request, gitIdentityId: 'untrusted' },
      { ...request, destination: '/tmp/skills' },
      { ...request, scope: 'project' },
      { ...request, expectedSourceRevision: '01' },
      { ...request, expectedSourceRevision: '18446744073709551616' },
      { ...request, selections: [{ skillDir: '../escape' }] },
      { ...request, selections: [{ skillDir: '/tmp/escape' }] },
      { ...request, selections: [{ skillDir: 'C:/escape' }] },
      { ...request, selections: [{ skillDir: 'skills/review' }, { skillDir: 'other/review' }] },
    ]) expect(C.SkillRepositoryInstallRequestSchema.safeParse(invalid).success).toBe(false);
  });
  test('successful empty catalogs are valid and missing or loose source fields are not', () => {
    expect(C.SkillRepositoryCatalogSchema.parse({ workspaceId: 'workspace_1', sources: [] }).sources).toEqual([]);
    expect(C.SkillRepositoryCatalogSchema.safeParse({ workspaceId: 'workspace_1' }).success).toBe(false);
    expect(C.SkillRepositoryCatalogSchema.safeParse({ workspaceId: 'workspace_1', sources: [], itemsBySource: {} }).success).toBe(false);
  });
  test('installed badges carry the authored identity and native scope', () => {
    const item = { sourceId: 'custom:team', repoSource: 'owner/team', skillDir: 'skills/review', skillName: 'review', installable: true,
      installed: { isInstalled: true, scope: 'agent', authoredSkillId: 'review' } };
    expect(C.SkillRepositoryItemSchema.parse(item)).toEqual(item);
    expect(C.SkillRepositoryItemSchema.safeParse({ ...item, installed: { isInstalled: true, scope: 'agent' } }).success).toBe(false);
    expect(C.SkillRepositoryItemSchema.safeParse({ ...item, installed: { isInstalled: true, scope: 'user', source: 'opencode' } }).success).toBe(false);
  });
  test('a downloaded installation is not reported committed without a source result', () => {
    expect(C.SkillRepositoryInstallResultSchema.safeParse({ ok: true, workspaceId: 'workspace_1', installed: [{ skillName: 'review', scope: 'workspace' }], skipped: [], commit: null }).success).toBe(false);
    expect(C.SkillRepositoryInstallResultSchema.parse({ ok: true, workspaceId: 'workspace_1', installed: [], skipped: [{ skillName: 'review', reason: 'Skipped' }], commit: null }).ok).toBe(true);
  });
});
