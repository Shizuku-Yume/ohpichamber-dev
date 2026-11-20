import { afterEach, describe, expect, test } from 'bun:test';
import { answerSecretRequest, readSecretRunFields } from './secretRequestAnswer';
import { clearRuntimeAuthCredentialProvider, setRuntimeBearerToken } from './runtime-auth';
import { configureRuntimeUrlResolver, getRuntimeUrlResolver, setRuntimeUrlResolver } from './runtime-url';

const originalFetch = globalThis.fetch;
const originalResolver = getRuntimeUrlResolver();
afterEach(() => { globalThis.fetch = originalFetch; setRuntimeUrlResolver(originalResolver); clearRuntimeAuthCredentialProvider(); setRuntimeBearerToken(null); });
const identity = { sessionId: 'ses/a &b', callId: 'call/+?#' };

describe('secret Host transport', () => {
  test('field lookup uses runtime resolution, authentication, encoded identity and no cache', async () => {
    configureRuntimeUrlResolver({ apiBaseUrl: 'https://host.example' });
    setRuntimeBearerToken('test-runtime-token');
    const controller = new AbortController();
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      expect(url.origin + url.pathname).toBe('https://host.example/api/openchamber/secret/fields');
      expect(url.searchParams.get('sessionId')).toBe(identity.sessionId);
      expect(url.searchParams.get('callId')).toBe(identity.callId);
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-runtime-token');
      expect(init?.cache).toBe('no-store');
      expect(init?.signal).toBe(controller.signal);
      expect(init?.body).toBeUndefined();
      return Response.json({ fields: ['TOKEN'], reused: ['CACHED'] });
    };
    expect(await readSecretRunFields(identity, '/project', controller.signal)).toEqual({ fields: ['TOKEN'], reused: ['CACHED'] });
  });

  test('preserves empty authoritative fields and distinguishes absent requests from failures', async () => {
    globalThis.fetch = async () => Response.json({ fields: [], reused: ['CACHED'] });
    expect(await readSecretRunFields(identity, undefined)).toEqual({ fields: [], reused: ['CACHED'] });
    globalThis.fetch = async () => new Response(null, { status: 404 });
    expect(await readSecretRunFields(identity, undefined)).toBeNull();
    globalThis.fetch = async () => Response.json({ error: 'private value' }, { status: 503 });
    await expect(readSecretRunFields(identity, undefined)).rejects.toThrow('The secret fields could not be read (503)');
  });

  test('malformed responses are errors rather than empty success', async () => {
    for (const payload of [null, {}, { fields: [1], reused: [] }, { fields: [''], reused: [] }]) {
      globalThis.fetch = async () => Response.json(payload);
      await expect(readSecretRunFields(identity, undefined)).rejects.toThrow('The secret fields response was invalid');
    }
    globalThis.fetch = async () => new Response('invalid-json');
    await expect(readSecretRunFields(identity, undefined)).rejects.toThrow('The secret fields response was invalid');
  });

  test('answers send only the addressed multi-field payload or decline to the answer route', async () => {
    configureRuntimeUrlResolver({ apiBaseUrl: 'https://host.example' });
    for (const answer of [{ values: { TOKEN: 'test-value' }, remember: ['TOKEN'] }, { declined: true as const }]) {
      const payload = { ...identity, ...answer };
      globalThis.fetch = async (input, init) => {
        expect(String(input)).toBe('https://host.example/api/openchamber/secret/answer');
        expect(init?.method).toBe('POST');
        expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
        expect(JSON.parse(String(init?.body))).toEqual(payload);
        return new Response(null, { status: 204 });
      };
      await answerSecretRequest(payload, '/project');
    }
  });

  test('answer failures never echo the server response or submitted value', async () => {
    globalThis.fetch = async () => Response.json({ error: 'private-submitted-value' }, { status: 409 });
    await expect(answerSecretRequest({ ...identity, values: { TOKEN: 'private-submitted-value' }, remember: [] }, undefined)).rejects.toThrow('The secrets were not sent (409)');
  });
});
