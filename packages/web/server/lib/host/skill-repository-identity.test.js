import { describe, expect, it } from 'vitest';
import { createSkillRepositoryIdentityResolver } from './skill-repository-identity.js';

describe('Host skill repository credential selection', () => {
  it('does not use the configured default account when no identity was selected', async () => {
    let reads = 0;
    const resolve = createSkillRepositoryIdentityResolver({ getProfile: () => { reads++; throw new Error('Default account must not be consulted'); } });
    expect(await resolve(undefined, 'owner/team')).toEqual({ ok: true, identity: null });
    expect(await resolve('global', 'owner/team')).toEqual({ ok: true, identity: null });
    expect(reads).toBe(0);
  });
  it('resolves managed SSH identity references against the parsed repository host', async () => {
    const resolve = createSkillRepositoryIdentityResolver({ getProfile: () => ({ transport: 'ssh', sshCredentialId: 'managed_key' }) });
    expect(await resolve('deploy', 'git@git.example.com:team/skills.git')).toEqual({ ok: true, identity: { transport: 'ssh', credentialId: 'managed_key', endpoint: 'git@git.example.com:team/skills.git' } });
  });
  it('refuses stale or missing accounts and never puts account tokens in the download identity', async () => {
    const profile = { transport: 'account', account: { provider: 'github', instance: 'github.com', accountId: 'account_1' } };
    let account = { credentialId: 'account_1', status: 'invalid', credentialRevision: 2, providerUserId: 'user_1', token: 'private-token' };
    const references = [];
    const resolve = createSkillRepositoryIdentityResolver({ getProfile: () => profile,
      resolveSourceControlAccount: async () => account,
      createHttpsCredentialReference: fields => { references.push(fields); return 'opaque-reference'; },
    });
    expect((await resolve('work', 'owner/team')).ok).toBe(false);
    expect(references).toHaveLength(0);
    account = { ...account, status: 'valid' };
    expect(await resolve('work', 'owner/team')).toEqual({ ok: true, identity: { transport: 'https', credentialId: 'opaque-reference', endpoint: 'https://github.com/owner/team.git' } });
    expect(references).toEqual([{ provider: 'github', instance: 'github.com', credentialId: 'account_1', credentialRevision: 2, providerUserId: 'user_1' }]);
  });
});
