
import {
  canonicalPublicJwkString,
  deriveServerId,
  getOrCreateRelaySigningKeypair,
  signRelayMessage,
} from './signing-key.js';
import { exportPublicKeyJwk, generateEcdhKeyPair, importEcdhPrivateKey } from './e2ee.js';
import type { RelaySigningDependencies } from './signing-key.js';
import type { RelayPublicJwk } from './key-store.js';

export interface RelayIdentity {
  serverId: string;
  hostEncPubJwk: RelayPublicJwk;
  hostEncPrivateKey: CryptoKey;
  signRelayAuth: (role: string, connectionId?: string | null) => { ts: number; sig: string; pk: string };
}

export const createRelayIdentityRuntime = (deps: RelaySigningDependencies) => {
  const { crypto, relayKeyStore } = deps;

  let cachedIdentity: RelayIdentity | null = null;
  let cachedGeneration = -1;

  const getOrCreateEncryptionKeypair = () => relayKeyStore.getOrCreate('encryption', async () => {
    console.warn('[relay-identity] Generating NEW relay encryption keypair (E2EE trust anchor changes; previously paired devices must re-pair)');
    const keyPair = await generateEcdhKeyPair();
    const privateJwk = await globalThis.crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const publicJwk = await exportPublicKeyJwk(keyPair.publicKey);
    return { privateJwk, publicJwk };
  });

<<<<<<< HEAD:packages/web/server/lib/relay/identity.js
  /**
   * @returns {Promise<{
   *   serverId: string,
   *   hostEncPubJwk: JsonWebKey,
   *   hostEncPrivateKey: CryptoKey,
   *   signRelayAuth: (role: string, connectionId?: string | null) => { ts: number, sig: string, pk: string },
   * }>}
   */
  const buildIdentity = async () => {
||||||| bc50ba56aa:packages/web/server/lib/relay/identity.js
  /**
   * @returns {Promise<{
   *   serverId: string,
   *   hostEncPubJwk: JsonWebKey,
   *   hostEncPrivateKey: CryptoKey,
   *   signRelayAuth: (role: string, connectionId?: string | null) => { ts: number, sig: string, pk: string },
   * }>}
   */
  const getRelayIdentity = async () => {
    const generation = relayKeyStore.generation();
    if (cachedIdentity && cachedGeneration === generation) return cachedIdentity;
=======
  const getRelayIdentity = async (): Promise<RelayIdentity> => {
    const generation = relayKeyStore.generation();
    if (cachedIdentity && cachedGeneration === generation) return cachedIdentity;
>>>>>>> upstream/main:packages/web/server/lib/relay/identity.ts
    const signing = await getOrCreateRelaySigningKeypair({ crypto, relayKeyStore });
    const serverId = deriveServerId({ crypto }, signing.publicJwk);
    const encryption = await getOrCreateEncryptionKeypair();
    const hostEncPrivateKey = await importEcdhPrivateKey(encryption.privateJwk);
    const pk = Buffer.from(canonicalPublicJwkString(signing.publicJwk), 'utf8').toString('base64url');

    const signRelayAuth: RelayIdentity['signRelayAuth'] = (role, connectionId) => {
      const ts = Date.now();
      const sig = signRelayMessage({ crypto }, signing.privateKey, `${ts}.${serverId}.${role}.${connectionId ?? ''}`);
      return { ts, sig, pk };
    };

    return {
      serverId,
      hostEncPubJwk: encryption.publicJwk,
      hostEncPrivateKey,
      signRelayAuth,
    };
  };

  // A reset changes the key store generation after it rewrites the file, so a
  // build that started before the reset can hold a mix of old and new keys.
  // Compare the generation after building: a change means rebuild, never cache.
  const getRelayIdentity = async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const generation = relayKeyStore.generation();
      if (cachedIdentity && cachedGeneration === generation) return cachedIdentity;
      const identity = await buildIdentity();
      if (relayKeyStore.generation() !== generation) continue;
      cachedIdentity = identity;
      cachedGeneration = generation;
      return identity;
    }
    throw new Error('relay identity changed repeatedly while it was being read');
  };

  return { getRelayIdentity };
};
