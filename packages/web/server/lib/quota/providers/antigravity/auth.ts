
import { credentialAccessToken, credentialRefreshToken } from '../selected-credential.js';
import { asNonEmptyString } from '../../utils/index.js';
import { parseGoogleRefreshToken } from '../google/transforms.js';

export const DEFAULT_PROJECT_ID = 'rising-fact-p41fc';

<<<<<<< HEAD:packages/web/server/lib/quota/providers/antigravity/auth.js
export const resolveAntigravityAuth = (credential) => {
  if (!credential) return null;
  const accessToken = credentialAccessToken(credential);
  const rawRefresh = credentialRefreshToken(credential);
  const parsedRefresh = parseGoogleRefreshToken(rawRefresh);
  const refreshToken = parsedRefresh.refreshToken ?? rawRefresh;
  if (!refreshToken && !accessToken) return null;
  return {
    sourceId: 'antigravity',
    sourceLabel: 'Antigravity',
    refreshToken,
    accessToken,
    projectId: asNonEmptyString(credential.projectId) ?? parsedRefresh.projectId ?? parsedRefresh.managedProjectId ?? DEFAULT_PROJECT_ID,
    email: credential.email
  };
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/antigravity/auth.js
export const resolveAntigravityAuth = () => {
  for (const filePath of ANTIGRAVITY_ACCOUNTS_PATHS) {
    const data = readJsonFile(filePath);
    const accounts = data?.accounts;
    if (Array.isArray(accounts) && accounts.length > 0) {
      const parsedIndex = toNumber(data.activeIndex);
      const index = parsedIndex !== null ? parsedIndex : 0;
      const account = accounts[index] ?? accounts[0];
      if (account?.refreshToken) {
        const refreshParts = parseGoogleRefreshToken(account.refreshToken);
        return {
          sourceId: 'antigravity',
          sourceLabel: 'Antigravity',
          refreshToken: refreshParts.refreshToken,
          projectId: asNonEmptyString(account.projectId)
            ?? asNonEmptyString(account.managedProjectId)
            ?? refreshParts.projectId
            ?? refreshParts.managedProjectId,
          email: account.email
        };
      }
    }
  }

  return null;
=======
interface AccountsFile {
  accounts?: unknown;
  activeIndex?: unknown;
}

interface Account {
  refreshToken?: unknown;
  projectId?: unknown;
  managedProjectId?: unknown;
  email?: unknown;
}

const isAccountsFile = (value: unknown): value is AccountsFile =>
  value !== null && typeof value === 'object';

const isAccount = (value: unknown): value is Account =>
  value !== null && typeof value === 'object';

export const resolveAntigravityAuth = () => {
  for (const filePath of ANTIGRAVITY_ACCOUNTS_PATHS) {
    const input: unknown = readJsonFile(filePath);
    const data = isAccountsFile(input) ? input : null;
    const accounts = data?.accounts;
    if (Array.isArray(accounts) && accounts.length > 0) {
      const parsedIndex = toNumber(data?.activeIndex);
      const index = parsedIndex !== null ? parsedIndex : 0;
      const account: unknown = accounts[index] ?? accounts[0];
      if (isAccount(account) && account.refreshToken) {
        const refreshParts = parseGoogleRefreshToken(account.refreshToken);
        return {
          sourceId: 'antigravity',
          sourceLabel: 'Antigravity',
          refreshToken: refreshParts.refreshToken,
          projectId: asNonEmptyString(account.projectId)
            ?? asNonEmptyString(account.managedProjectId)
            ?? refreshParts.projectId
            ?? refreshParts.managedProjectId,
          email: account.email
        };
      }
    }
  }

  return null;
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/antigravity/auth.ts
};

export const isConfigured = (credential) => Boolean(resolveAntigravityAuth(credential));
