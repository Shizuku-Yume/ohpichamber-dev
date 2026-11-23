import { credentialAccessToken, credentialRefreshToken, credentialExpiresAt } from '../selected-credential.js';
import { parseGoogleRefreshToken } from './transforms.js';

const DIRECT_GOOGLE_LOGIN_METHODS = new Set(['oauth', 'gemini-cli']);

export const DEFAULT_PROJECT_ID = 'rising-fact-p41fc';
export const resolveGoogleAuthSources = (credential) => {
  if (credential?.type !== 'oauth') return [];
  const accessToken = credentialAccessToken(credential);
  const rawRefresh = credentialRefreshToken(credential);
  const parsedRefresh = parseGoogleRefreshToken(rawRefresh);
  const refreshToken = parsedRefresh.refreshToken ?? rawRefresh;
  const projectId = (typeof credential.projectId === 'string' && credential.projectId)
    ? credential.projectId
    : (parsedRefresh.projectId ?? parsedRefresh.managedProjectId ?? DEFAULT_PROJECT_ID);
  if (!accessToken && !refreshToken) return [];
  return [{
    accessToken: accessToken ?? '',
    refreshToken,
    expires: credentialExpiresAt(credential),
    projectId,
    sourceId: 'gemini',
    sourceLabel: 'Gemini'
  }];
};
