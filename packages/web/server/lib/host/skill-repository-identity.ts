import { z } from 'zod';
import { parseSkillRepoSource } from '../skills-catalog/source.js';
import type { CatalogGitIdentity } from '../skills-catalog/git.js';
import type { GitIdentityAccount, GitIdentityTransport, StoredGitIdentityProfile } from '../git/identity-storage.js';
import type { BindingTransportAccount } from '../source-control/binding-service-contracts.js';
import type { AccountIdentity } from '../source-control/provider-contract.js';

const IdentityAccountSchema = z.object({
  provider: z.string(),
  instance: z.string(),
  accountId: z.string(),
});

const ProfileFieldsSchema = z.object({
  transport: z.enum(['account', 'ssh', 'system', 'anonymous']).optional(),
  sshCredentialId: z.string().optional(),
  account: IdentityAccountSchema.nullable().optional(),
});

export type SkillRepositoryIdentityProfile =
  | {
    transport?: GitIdentityTransport | undefined;
    sshCredentialId?: string | undefined;
    account?: GitIdentityAccount | null | undefined;
  }
  | StoredGitIdentityProfile;

export interface SkillRepositoryIdentityDependencies {
  getProfile: (identityId: string) => SkillRepositoryIdentityProfile | null;
  resolveSourceControlAccount: (
    identity: AccountIdentity & { credentialRevision?: number },
  ) => Promise<BindingTransportAccount | null>;
  createHttpsCredentialReference: (input: {
    provider: string;
    instance: string;
    credentialId: string;
    credentialRevision: number;
    providerUserId: string;
  }) => string;
}

export type SkillRepositoryIdentityResult =
  | { ok: true; identity: CatalogGitIdentity | null }
  | { ok: false; error: { kind: 'authRequired'; message: string } };

export function createSkillRepositoryIdentityResolver({
  getProfile,
  resolveSourceControlAccount,
  createHttpsCredentialReference,
}: SkillRepositoryIdentityDependencies) {
  return async (
    identityId: string | null | undefined,
    source: string,
  ): Promise<SkillRepositoryIdentityResult> => {
    if (!identityId || identityId === 'global') return { ok: true, identity: null };
    const unavailable = (): SkillRepositoryIdentityResult => ({
      ok: false,
      error: { kind: 'authRequired', message: 'Selected Git identity is unavailable' },
    });
    const rawProfile = getProfile(identityId);
    if (!rawProfile) return unavailable();
    const parsedProfile = ProfileFieldsSchema.safeParse(rawProfile);
    if (!parsedProfile.success) return unavailable();
    const profile = parsedProfile.data;
    const transport = profile.transport ?? 'system';
    if (transport === 'system') return { ok: true, identity: null };
    if (transport === 'anonymous') return { ok: true, identity: { anonymous: true, transport } };
    const parsed = parseSkillRepoSource(source);
    if (!parsed.ok) return { ok: true, identity: null };
    if (transport === 'ssh') {
      return {
        ok: true,
        identity: { transport, credentialId: profile.sshCredentialId, endpoint: parsed.cloneUrlSsh },
      };
    }
    if (transport !== 'account' || !profile.account) return unavailable();
    const account = await resolveSourceControlAccount(profile.account);
    if (
      account?.credentialId !== profile.account.accountId
      || account.status !== 'valid'
      || !Number.isSafeInteger(account.credentialRevision)
      || account.credentialRevision < 1
    ) {
      return unavailable();
    }
    try {
      const credentialId = createHttpsCredentialReference({
        provider: profile.account.provider,
        instance: profile.account.instance,
        credentialId: account.credentialId,
        credentialRevision: account.credentialRevision,
        providerUserId: account.providerUserId,
      });
      return { ok: true, identity: { transport: 'https', credentialId, endpoint: parsed.cloneUrlHttps } };
    } catch {
      return unavailable();
    }
  };
}
