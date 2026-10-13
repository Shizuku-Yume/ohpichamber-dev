import { PrivateCredentialResolveRequestSchema, PrivateCredentialResolveResultSchema } from '@openchamber/agent-service/src/catalogs/protocol.ts';

export function createPrivateCredentialResolveRequest(input) {
  return PrivateCredentialResolveRequestSchema.parse(input);
}

export function privateCredentialFromResult(result) {
  const parsed = PrivateCredentialResolveResultSchema.parse(result);
  if (parsed.credential.method === 'api-key') return { type: 'api-key', key: parsed.credential.apiKey };
  return { type: 'oauth', access: parsed.credential.accessToken, refresh: parsed.credential.refreshToken, expires: parsed.credential.expiresAt };
}
