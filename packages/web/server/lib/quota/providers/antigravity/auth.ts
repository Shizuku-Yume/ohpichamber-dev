
import { credentialAccessToken, credentialRefreshToken } from '../selected-credential.js';
import { asNonEmptyString } from '../../utils/index.js';
import { parseGoogleRefreshToken } from '../google/transforms.js';

export const DEFAULT_PROJECT_ID = 'rising-fact-p41fc';

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
};

export const isConfigured = (credential) => Boolean(resolveAntigravityAuth(credential));
