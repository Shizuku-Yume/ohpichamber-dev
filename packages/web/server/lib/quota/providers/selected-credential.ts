import { z } from 'zod';
import type { CredentialJson } from '../credentials/contracts.js';
import type { NativeResolvedCredential } from '../native.js';

export type SelectedCredentialInput = CredentialJson | NativeResolvedCredential | undefined;

export interface SelectedCredentialOwnership {
  workspaceId: string;
  agentDirectoryId: string;
  providerId: string;
  credentialRef: string;
  purpose: string;
}

export interface RequireSelectedCredentialOptions<Credential extends SelectedCredentialInput = NativeResolvedCredential> {
  resolveCredential?: ((ownership: SelectedCredentialOwnership) => Promise<Credential>) | undefined;
  workspaceId?: string | undefined;
  agentDirectoryId?: string | undefined;
  providerId?: string | undefined;
  credentialRef?: string | undefined;
  purpose?: string | undefined;
}

export interface SelectedCredentialError extends Error {
  code: string;
}

const NonBlankTextSchema = z.string().refine((value) => value.trim().length > 0);
const ApiKeyCredentialSchema = z.object({ type: z.literal('api_key'), key: NonBlankTextSchema });
const OAuthAccessSchema = z.object({ type: z.literal('oauth'), access: NonBlankTextSchema });
const OAuthRefreshSchema = z.object({ type: z.literal('oauth'), refresh: NonBlankTextSchema });
const OAuthExpiresSchema = z.object({ type: z.literal('oauth'), expires: z.number().finite() });
const ErrorCodeSchema = z.object({ code: z.string() });

export const credentialAccessToken = (credential: SelectedCredentialInput): string | null => {
  const apiKey = ApiKeyCredentialSchema.safeParse(credential);
  if (apiKey.success) return apiKey.data.key;
  const oauth = OAuthAccessSchema.safeParse(credential);
  return oauth.success ? oauth.data.access : null;
};

export const credentialRefreshToken = (credential: SelectedCredentialInput): string | null => {
  const oauth = OAuthRefreshSchema.safeParse(credential);
  return oauth.success ? oauth.data.refresh : null;
};

export const credentialExpiresAt = (credential: SelectedCredentialInput): number | null => {
  const oauth = OAuthExpiresSchema.safeParse(credential);
  return oauth.success ? oauth.data.expires : null;
};

export const SELECTED_CREDENTIAL_UNAVAILABLE = 'CREDENTIAL_UNAVAILABLE';
export const SELECTED_CREDENTIAL_CONTEXT_REQUIRED = 'CREDENTIAL_CONTEXT_REQUIRED';
const SELECTED_CREDENTIAL_RESOLUTION_FAILED = 'CREDENTIAL_RESOLUTION_FAILED';

const credentialResolutionError = (code: string, message: string): SelectedCredentialError =>
  Object.assign(new Error(message), { code });

export const requireSelectedCredential = async <Credential extends SelectedCredentialInput = NativeResolvedCredential>({
  resolveCredential,
  workspaceId,
  agentDirectoryId,
  providerId,
  credentialRef,
  purpose,
}: RequireSelectedCredentialOptions<Credential>): Promise<Credential> => {
  if (!resolveCredential || !z.function().safeParse(resolveCredential).success) {
    throw credentialResolutionError(SELECTED_CREDENTIAL_CONTEXT_REQUIRED, 'Selected credential context is required');
  }
  const resolve = resolveCredential;
  const parsedWorkspaceId = NonBlankTextSchema.safeParse(workspaceId);
  const parsedAgentDirectoryId = NonBlankTextSchema.safeParse(agentDirectoryId);
  const parsedProviderId = NonBlankTextSchema.safeParse(providerId);
  const parsedCredentialRef = NonBlankTextSchema.safeParse(credentialRef);
  const parsedPurpose = NonBlankTextSchema.safeParse(purpose);
  if (
    !parsedWorkspaceId.success
    || !parsedAgentDirectoryId.success
    || !parsedProviderId.success
    || !parsedCredentialRef.success
    || !parsedPurpose.success
  ) {
    throw credentialResolutionError(SELECTED_CREDENTIAL_CONTEXT_REQUIRED, 'Selected credential context is required');
  }
  try {
    const credential = await resolve({
      workspaceId: parsedWorkspaceId.data,
      agentDirectoryId: parsedAgentDirectoryId.data,
      providerId: parsedProviderId.data,
      credentialRef: parsedCredentialRef.data,
      purpose: parsedPurpose.data,
    });
    if (!credentialAccessToken(credential)) throw credentialResolutionError(SELECTED_CREDENTIAL_UNAVAILABLE, 'Selected credential unavailable');
    return credential;
  } catch (error) {
    const parsedError = ErrorCodeSchema.safeParse(error);
    throw parsedError.success && parsedError.data.code === SELECTED_CREDENTIAL_UNAVAILABLE
      ? credentialResolutionError(SELECTED_CREDENTIAL_UNAVAILABLE, 'Selected credential unavailable')
      : credentialResolutionError(SELECTED_CREDENTIAL_RESOLUTION_FAILED, 'Selected credential unavailable');
  }
};
