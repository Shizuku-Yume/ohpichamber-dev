const asText = (value) => typeof value === 'string' && value.trim() ? value : null;
export const credentialAccessToken = (credential) => {
  if (!credential || typeof credential !== 'object') return null;
  if (credential.type === 'api_key') return asText(credential.key);
  if (credential.type === 'oauth') return asText(credential.access);
  return null;
};
export const credentialRefreshToken = (credential) => credential?.type === 'oauth' ? asText(credential.refresh) : null;
export const credentialExpiresAt = (credential) => credential?.type === 'oauth' && Number.isFinite(credential.expires) ? credential.expires : null;
export const requireSelectedCredential = async ({ resolveCredential, workspaceId, agentDirectoryId, providerId, credentialRef, purpose }) => {
  if (typeof resolveCredential !== 'function') throw new Error('Selected credential resolver unavailable');
  if (![workspaceId, agentDirectoryId, providerId, credentialRef, purpose].every((value) => typeof value === 'string' && value.trim())) throw new Error('Selected credential context is required');
  try {
    const credential = await resolveCredential({ workspaceId, agentDirectoryId, providerId, credentialRef, purpose });
    if (!credentialAccessToken(credential)) throw new Error('Unavailable credential');
    return credential;
  } catch { throw new Error('Selected credential unavailable'); }
};
