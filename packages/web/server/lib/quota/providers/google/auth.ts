import { z } from 'zod';
import type { CredentialJson } from '../../credentials/contracts.js';
import { credentialAccessToken, credentialRefreshToken, credentialExpiresAt } from '../selected-credential.js';
import { parseGoogleRefreshToken } from './transforms.js';

export interface GoogleAuthSource {
  accessToken: string;
  refreshToken: string | null;
  expires: number | null;
  projectId: string;
  sourceId: string;
  sourceLabel: string;
}

const googleOAuthCredentialSchema = z.object({
  type: z.literal('oauth'),
  projectId: z.string().min(1).optional(),
});

export const DEFAULT_PROJECT_ID = 'rising-fact-p41fc';

export const resolveGoogleAuthSources = (credential?: CredentialJson): GoogleAuthSource[] => {
  const parsedCredential = googleOAuthCredentialSchema.safeParse(credential);
  if (!parsedCredential.success) return [];
  const accessToken = credentialAccessToken(credential);
  const rawRefresh = credentialRefreshToken(credential);
  const parsedRefresh = parseGoogleRefreshToken(rawRefresh);
  const refreshToken = parsedRefresh.refreshToken ?? rawRefresh;
  const projectId = parsedCredential.data.projectId
    ?? parsedRefresh.projectId
    ?? parsedRefresh.managedProjectId
    ?? DEFAULT_PROJECT_ID;
  if (!accessToken && !refreshToken) return [];
  return [{
    accessToken: accessToken ?? '',
    refreshToken,
    expires: credentialExpiresAt(credential),
    projectId,
    sourceId: 'gemini',
    sourceLabel: 'Gemini',
  }];
};
