import { parseSkillRepoSource } from '../skills-catalog/source.js';

/** Resolve only Host-managed Git credential references; never expose secrets to the UI. */
export function createSkillRepositoryIdentityResolver({ getProfile, resolveSourceControlAccount, createHttpsCredentialReference }) {
  return async (identityId, source) => {
    if (!identityId || identityId === 'global') return { ok: true, identity: null };
    const unavailable = () => ({ ok: false, error: { kind: 'authRequired', message: 'Selected Git identity is unavailable' } });
    const profile = getProfile(identityId);
    if (!profile) return unavailable();
    const transport = profile.transport ?? 'system';
    if (transport === 'system') return { ok: true, identity: null };
    if (transport === 'anonymous') return { ok: true, identity: { anonymous: true, transport } };
    const parsed = parseSkillRepoSource(source);
    if (!parsed.ok) return { ok: true, identity: null };
    if (transport === 'ssh') return { ok: true, identity: { transport, credentialId: profile.sshCredentialId, endpoint: parsed.cloneUrlSsh } };
    if (transport !== 'account' || !profile.account) return unavailable();
    const account = await resolveSourceControlAccount(profile.account);
    if (account?.credentialId !== profile.account.accountId || account.status !== 'valid' || !Number.isSafeInteger(account.credentialRevision) || account.credentialRevision < 1) return unavailable();
    try {
      const credentialId = createHttpsCredentialReference({ provider: profile.account.provider, instance: profile.account.instance,
        credentialId: account.credentialId, credentialRevision: account.credentialRevision, providerUserId: account.providerUserId });
      return { ok: true, identity: { transport: 'https', credentialId, endpoint: parsed.cloneUrlHttps } };
    } catch { return unavailable(); }
  };
}
