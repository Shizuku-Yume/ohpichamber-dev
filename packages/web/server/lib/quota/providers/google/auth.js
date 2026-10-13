import { credentialAccessToken, credentialRefreshToken, credentialExpiresAt } from '../selected-credential.js';

export const DEFAULT_PROJECT_ID = null;
export const resolveGoogleAuthSources = (credential) => {
  if (credential?.type !== 'oauth') return [];
  const accessToken = credentialAccessToken(credential);
  const projectId = typeof credential.projectId === 'string' && credential.projectId ? credential.projectId : null;
  if (!accessToken || !projectId) return [];
  return [{ accessToken, refreshToken: credentialRefreshToken(credential), expires: credentialExpiresAt(credential), projectId, sourceId: 'gemini', sourceLabel: 'Selected Google OAuth' }];
};
