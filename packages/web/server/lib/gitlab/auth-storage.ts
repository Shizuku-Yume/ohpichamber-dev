import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizeGitLabInstance } from './instance.js';
import { isPlainObject, isString } from './validation.js';
import { withSourceControlFileLock } from '../source-control/file-lock.js';
import { hasSourceControlErrorCode, isSourceControlFiniteNumber, isSourceControlInteger } from '../source-control/input-guards.js';

export type GitLabAuthJson = null | boolean | number | string | GitLabAuthJson[] | { [key: string]: GitLabAuthJson | undefined };

export interface GitLabAuthUser {
  id: number;
  login: string;
  avatarUrl?: string;
  name?: string;
  email?: string;
}

export interface GitLabAuthUserInput {
  id: number;
  login: string;
  avatarUrl?: string | null | undefined;
  name?: string | null | undefined;
  email?: string | null | undefined;
}

export interface GitLabStoredCredential {
  credentialId: string;
  revision: number;
  providerUserId: string;
  token: string;
  user: GitLabAuthUser;
  source: 'oauth' | 'pat';
  scope: string;
  status: 'valid' | 'invalid';
  invalidReason?: string | undefined;
  refreshToken?: string | undefined;
  expiresAt?: number | undefined;
}

export interface GitLabAuthCredential extends GitLabStoredCredential {
  id: string;
  credentialRevision: number;
}

export interface GitLabAuthInstance {
  activeCredentialId: string | null;
  credentials: GitLabAuthCredential[];
  cliDisabled: boolean;
  cliActive: boolean;
}

export interface PublicGitLabAuthInstance {
  activeAccountId: string | null;
  accounts: GitLabAuthCredential[];
  cliDisabled: boolean;
  cliActive: boolean;
}

interface GitLabAuthState {
  version: typeof AUTH_VERSION;
  providers: {
    gitlab: {
      instances: Record<string, GitLabAuthInstance>;
    };
  };
}

export interface GitLabAccountInput {
  token: string;
  user: GitLabAuthUserInput;
  source: 'oauth' | 'pat';
  scope?: string | undefined;
  refreshToken?: string | undefined;
  expiresIn?: number | undefined;
}

export interface GitLabRefreshTokenResult {
  accessToken: string;
  refreshToken?: string | undefined;
  expiresIn?: number | undefined;
}

export type GitLabRefreshOAuthToken = (input: { origin: string; refreshToken: string }) => Promise<GitLabRefreshTokenResult>;

export interface GitLabAuthStoreOptions {
  filePath: string;
  fsImpl?: typeof fs;
  lockWaitMs?: number;
  refreshOAuthToken?: GitLabRefreshOAuthToken | undefined;
  now?: () => number;
}

export interface GitLabAuthStore {
  listInstances: () => Promise<string[]>;
  listAccounts: (origin: string) => Promise<GitLabAuthCredential[]>;
  renewAccount: (origin: string, credentialId: string) => Promise<boolean>;
  readInstance: (origin: string) => Promise<PublicGitLabAuthInstance>;
  readAccount: (origin: string, credentialId: string, revision?: number) => Promise<GitLabAuthCredential | null>;
  setAccount: (origin: string, input: GitLabAccountInput) => Promise<GitLabAuthCredential>;
  activate: (origin: string, credentialId: string) => Promise<boolean>;
  removeAccount: (origin: string, credentialId: string) => Promise<boolean>;
  markAccountInvalid: (origin: string, credentialId: string, reason?: string) => Promise<boolean>;
  setCliDisabled: (origin: string, disabled: boolean) => Promise<boolean>;
  setCliActive: (origin: string, active: boolean) => Promise<boolean>;
}

type GitLabAuthError = Error & { code: 'INVALID_SOURCE_CONTROL_AUTH' };

const AUTH_VERSION = 2 as const;
const emptyState = (): GitLabAuthState => ({ version: AUTH_VERSION, providers: { gitlab: { instances: {} } } });
const emptyInstance = (): GitLabAuthInstance => ({ activeCredentialId: null, credentials: [], cliDisabled: false, cliActive: false });
const invalidState = (cause?: ErrorOptions['cause']): GitLabAuthError =>
  Object.assign(new Error('Source control auth storage is invalid', { cause }), {
    code: 'INVALID_SOURCE_CONTROL_AUTH' as const,
  });
const validText = (value: GitLabAuthJson | undefined): value is string =>
  isString(value) && value.length > 0 && value.trim() === value && !/[\0\r\n]/.test(value);
const exactKeys = <Value extends object>(value: Value, required: readonly string[], optional: readonly string[] = []): boolean => {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => allowed.has(key));
};
const isJsonRecord = (value: GitLabAuthJson | GitLabAuthUserInput | undefined): value is Record<string, GitLabAuthJson | undefined> =>
  isPlainObject(value);
const isBooleanTag = (value: unknown): value is boolean => Object.prototype.toString.call(value) === '[object Boolean]';
const isIntegerNumber = (value: GitLabAuthJson | undefined): value is number => Number.isInteger(value);

function providerUserId(origin: string, userId: number): string {
  return `${origin}#${userId}`;
}

function newCredentialId(): string {
  return `occred:v1:gitlab:${randomUUID()}:r1`;
}

function parseUser(value: GitLabAuthJson | GitLabAuthUserInput | undefined): GitLabAuthUser {
  if (!isJsonRecord(value) || !isIntegerNumber(value.id) || !validText(value.login)
    || !exactKeys(value, ['id', 'login'], ['avatarUrl', 'name', 'email'])) throw invalidState();
  const user: GitLabAuthUser = { id: value.id, login: value.login };
  for (const key of ['avatarUrl', 'name', 'email'] as const) {
    const field = value[key];
    if (field !== undefined && field !== null && !isString(field)) throw invalidState();
    if (isString(field)) user[key] = field;
  }
  return user;
}

function runtimeCredential(value: GitLabStoredCredential): GitLabAuthCredential {
  return { ...value, id: value.credentialId, credentialRevision: value.revision };
}

interface RawCredentialRecord {
  credentialId: string;
  revision: number;
  providerUserId: string;
  token: string;
  user: GitLabAuthJson | undefined;
  source: 'oauth' | 'pat';
  scope: string;
  status: 'valid' | 'invalid';
  invalidReason?: GitLabAuthJson | undefined;
  refreshToken?: GitLabAuthJson | undefined;
  expiresAt?: GitLabAuthJson | undefined;
}

const isRawCredentialRecord = (value: GitLabAuthJson | undefined): value is GitLabAuthJson & RawCredentialRecord =>
  isJsonRecord(value)
  && exactKeys(value, ['credentialId', 'revision', 'providerUserId', 'token', 'user', 'source', 'scope', 'status'], ['invalidReason', 'refreshToken', 'expiresAt'])
  && validText(value.credentialId)
  && isSourceControlInteger(value.revision)
  && value.revision >= 1
  && validText(value.providerUserId)
  && validText(value.token)
  && (value.source === 'oauth' || value.source === 'pat')
  && isString(value.scope)
  && (value.status === 'valid' || value.status === 'invalid');

function parseCredential(value: GitLabAuthJson | undefined, origin: string): GitLabAuthCredential {
  if (!isRawCredentialRecord(value)) throw invalidState();
  const user = parseUser(value.user);
  if (providerUserId(origin, user.id) !== value.providerUserId) throw invalidState();
  if (value.invalidReason !== undefined && !validText(value.invalidReason)) throw invalidState();
  if (value.status === 'valid' && value.invalidReason !== undefined) throw invalidState();
  if (value.refreshToken !== undefined && (value.source !== 'oauth' || !validText(value.refreshToken))) throw invalidState();
  if (value.expiresAt !== undefined && (!isSourceControlInteger(value.expiresAt) || value.expiresAt < 0)) throw invalidState();
  const stored: GitLabStoredCredential = {
    credentialId: value.credentialId,
    revision: value.revision,
    providerUserId: value.providerUserId,
    token: value.token,
    user,
    source: value.source,
    scope: value.scope,
    status: value.status,
  };
  if (value.invalidReason !== undefined) stored.invalidReason = value.invalidReason;
  if (value.refreshToken !== undefined) stored.refreshToken = value.refreshToken;
  if (value.expiresAt !== undefined) stored.expiresAt = value.expiresAt;
  return runtimeCredential(stored);
}

interface RawInstanceRecord {
  activeCredentialId: string | null;
  credentials: GitLabAuthJson[];
  cliDisabled: boolean;
  cliActive: boolean;
}

const isRawInstanceRecord = (value: GitLabAuthJson | undefined): value is GitLabAuthJson & RawInstanceRecord =>
  isJsonRecord(value)
  && exactKeys(value, ['activeCredentialId', 'credentials', 'cliDisabled', 'cliActive'])
  && (value.activeCredentialId === null || validText(value.activeCredentialId))
  && Array.isArray(value.credentials)
  && isBooleanTag(value.cliDisabled)
  && isBooleanTag(value.cliActive)
  && !(value.cliDisabled && value.cliActive);

function parseVersionTwo(value: GitLabAuthJson | undefined): GitLabAuthState {
  if (!isJsonRecord(value) || !exactKeys(value, ['version', 'providers']) || value.version !== AUTH_VERSION
    || !isJsonRecord(value.providers) || !exactKeys(value.providers, ['gitlab'])
    || !isJsonRecord(value.providers.gitlab) || !exactKeys(value.providers.gitlab, ['instances'])
    || !isJsonRecord(value.providers.gitlab.instances)) throw invalidState();
  const state = emptyState();
  for (const [rawOrigin, rawInstance] of Object.entries(value.providers.gitlab.instances)) {
    let origin: string;
    try { origin = normalizeGitLabInstance(rawOrigin); }
    catch (error) { throw invalidState(error); }
    if (origin !== rawOrigin || !isRawInstanceRecord(rawInstance)) throw invalidState();
    const credentials = rawInstance.credentials.map((credential) => parseCredential(credential, origin));
    if (new Set(credentials.map((credential) => credential.credentialId)).size !== credentials.length) throw invalidState();
    if (rawInstance.activeCredentialId !== null
      && !credentials.some((credential) => credential.credentialId === rawInstance.activeCredentialId)) throw invalidState();
    state.providers.gitlab.instances[origin] = {
      activeCredentialId: rawInstance.activeCredentialId,
      credentials,
      cliDisabled: rawInstance.cliDisabled,
      cliActive: rawInstance.cliActive,
    };
  }
  return state;
}

function serializeState(state: GitLabAuthState) {
  const instances: Record<string, {
    activeCredentialId: string | null;
    credentials: GitLabStoredCredential[];
    cliDisabled: boolean;
    cliActive: boolean;
  }> = {};
  for (const [origin, instance] of Object.entries(state.providers.gitlab.instances)) {
    instances[origin] = {
      activeCredentialId: instance.activeCredentialId,
      credentials: instance.credentials.map((credential) => {
        const stored: GitLabStoredCredential = {
          credentialId: credential.credentialId,
          revision: credential.revision,
          providerUserId: credential.providerUserId,
          token: credential.token,
          user: credential.user,
          source: credential.source,
          scope: credential.scope,
          status: credential.status,
        };
        if (credential.status === 'invalid') stored.invalidReason = credential.invalidReason;
        if (credential.refreshToken) stored.refreshToken = credential.refreshToken;
        if (credential.expiresAt !== undefined) stored.expiresAt = credential.expiresAt;
        return stored;
      }),
      cliDisabled: instance.cliDisabled,
      cliActive: instance.cliActive,
    };
  }
  return { version: AUTH_VERSION, providers: { gitlab: { instances } } };
}

function publicInstance(instance: GitLabAuthInstance): PublicGitLabAuthInstance {
  return {
    activeAccountId: instance.activeCredentialId,
    accounts: instance.credentials,
    cliDisabled: instance.cliDisabled,
    cliActive: instance.cliActive,
  };
}
const REFRESH_MARGIN_MS = 5 * 60_000;
const RENEW_LOCK_WAIT_MS = 15_000;

export function createSourceControlAuthStore({
  filePath,
  fsImpl = fs,
  lockWaitMs = 2_000,
  refreshOAuthToken,
  now = Date.now,
}: GitLabAuthStoreOptions): GitLabAuthStore {
  let transactions: Promise<unknown> = Promise.resolve();
  const writeState = async (state: GitLabAuthState): Promise<void> => {
    await fsImpl.mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    try {
      await fsImpl.writeFile(temporary, `${JSON.stringify(serializeState(state), null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      await fsImpl.chmod(temporary, 0o600);
      await fsImpl.rename(temporary, filePath);
    } catch (error) {
      await fsImpl.rm(temporary, { force: true }).catch(() => { });
      throw error;
    }
  };
  const readState = async (): Promise<GitLabAuthState> => {
    let encoded: string;
    try { encoded = await fsImpl.readFile(filePath, 'utf8'); }
    catch (error) {
      if (hasSourceControlErrorCode(error) && error.code === 'ENOENT') return emptyState();
      throw error;
    }
    let value: GitLabAuthJson;
    try { value = JSON.parse(encoded); }
    catch (error) { throw invalidState(error); }
    if (!isJsonRecord(value) || value.version !== AUTH_VERSION) throw invalidState();
    return parseVersionTwo(value);
  };
  const transaction = <Result>(operation: () => Promise<Result>): Promise<Result> => {
    const next = transactions.then(() => withSourceControlFileLock(`${filePath}.lock`, operation, { fsImpl, waitMs: lockWaitMs }));
    transactions = next.then(() => undefined, () => undefined);
    return next;
  };
  const read = <Result>(operation: (state: GitLabAuthState) => Result): Promise<Result> =>
    transaction(async () => operation(await readState()));
  const mutate = <Result>(operation: (state: GitLabAuthState) => { changed: boolean; value: Result }): Promise<Result> =>
    transaction(async () => {
      const state = await readState();
      const result = operation(state);
      if (result.changed) await writeState(state);
      return result.value;
    });
  const chooseActive = (instance: GitLabAuthInstance): void => {
    const current = instance.credentials.find((credential) => credential.credentialId === instance.activeCredentialId);
    if (current?.status === 'valid') return;
    instance.activeCredentialId = instance.credentials.find((credential) => credential.status === 'valid')?.credentialId
      ?? instance.credentials[0]?.credentialId
      ?? null;
  };
  const retainInstance = (instances: Record<string, GitLabAuthInstance>, origin: string, instance: GitLabAuthInstance): void => {
    if (!instance.credentials.length && !instance.cliDisabled && !instance.cliActive) delete instances[origin];
    else instances[origin] = instance;
  };

  const needsRenewal = (credential: GitLabAuthCredential): boolean => credential.status === 'valid' && credential.source === 'oauth'
    && Boolean(credential.refreshToken) && credential.expiresAt !== undefined
    && credential.expiresAt - now() < REFRESH_MARGIN_MS;
  const renewals = new Map<string, Promise<boolean>>();
  const findCredential = (state: GitLabAuthState, origin: string, credentialId: string): GitLabAuthCredential | null =>
    state.providers.gitlab.instances[origin]?.credentials
      .find((candidate) => candidate.credentialId === credentialId) ?? null;
  const renew = (origin: string, credential: GitLabAuthCredential): Promise<boolean> => {
    const spent = credential.refreshToken;
    if (!spent || !(refreshOAuthToken instanceof Function)) return Promise.resolve(false);
    const key = `${origin}\0${credential.credentialId}`;
    const pending = renewals.get(key);
    if (pending) return pending;
    const running = withSourceControlFileLock(`${filePath}.renew.lock`, async () => {
      const current = await read((state) => findCredential(state, origin, credential.credentialId));
      if (current?.status !== 'valid') return false;
      if (current.refreshToken !== spent) return true;
      let renewed: GitLabRefreshTokenResult;
      try {
        renewed = await refreshOAuthToken({ origin, refreshToken: spent });
      } catch {
        return false;
      }
      if (!validText(renewed?.accessToken)) return false;
      const nextToken = renewed.accessToken;
      return mutate((state) => {
        const stored = findCredential(state, origin, credential.credentialId);
        if (!stored || stored.refreshToken !== spent) return { changed: false, value: false };
        stored.token = nextToken;
        if (validText(renewed.refreshToken)) stored.refreshToken = renewed.refreshToken;
        if (renewed.expiresIn !== undefined && isSourceControlFiniteNumber(renewed.expiresIn) && renewed.expiresIn > 0) {
          stored.expiresAt = now() + renewed.expiresIn * 1000;
        } else {
          delete stored.expiresAt;
        }
        return { changed: true, value: true };
      });
    }, { fsImpl, waitMs: RENEW_LOCK_WAIT_MS }).finally(() => { renewals.delete(key); });
    renewals.set(key, running);
    return running;
  };
  const renewExpiring = async (origin: string, credentialId?: string): Promise<void> => {
    if (!(refreshOAuthToken instanceof Function)) return;
    const expiring = await read((state) => (state.providers.gitlab.instances[origin]?.credentials ?? [])
      .filter((credential) => (!credentialId || credential.credentialId === credentialId) && needsRenewal(credential)));
    await Promise.all(expiring.map((credential) => renew(origin, credential).catch((error) => {
      if (!hasSourceControlErrorCode(error) || error.code !== 'SOURCE_CONTROL_LOCK_BUSY') throw error;
    })));
  };

  return Object.freeze({
    listInstances: () => read((state) => Object.keys(state.providers.gitlab.instances)),
    listAccounts: (origin: string) => read((state) => state.providers.gitlab.instances[origin]?.credentials ?? []),
    renewAccount: async (origin: string, credentialId: string) => {
      if (!(refreshOAuthToken instanceof Function)) return false;
      const credential = await read((state) => state.providers.gitlab.instances[origin]?.credentials
        .find((candidate) => candidate.credentialId === credentialId) ?? null);
      if (credential?.status !== 'valid' || !credential.refreshToken) return false;
      return renew(origin, credential);
    },
    readInstance: async (origin: string) => {
      await renewExpiring(origin);
      return read((state) => publicInstance(state.providers.gitlab.instances[origin] ?? emptyInstance()));
    },
    readAccount: async (origin: string, credentialId: string, revision?: number) => {
      await renewExpiring(origin, credentialId);
      return read((state) => {
        const credential = state.providers.gitlab.instances[origin]?.credentials
          .find((candidate) => candidate.credentialId === credentialId);
        if (!credential || credential.status !== 'valid'
          || (revision !== undefined && credential.revision !== revision)) return null;
        return credential;
      });
    },
    setAccount: (origin: string, { token, user, source, scope = '', refreshToken, expiresIn }: GitLabAccountInput) => mutate((state) => {
      if (!validText(token) || !['oauth', 'pat'].includes(source) || !isString(scope)) throw invalidState();
      const parsedUser = parseUser(user);
      const credentialId = newCredentialId();
      const credential = runtimeCredential({
        credentialId,
        revision: 1,
        providerUserId: providerUserId(origin, parsedUser.id),
        token,
        user: parsedUser,
        source,
        scope,
        status: 'valid',
      });
      if (source === 'oauth' && validText(refreshToken)) credential.refreshToken = refreshToken;
      if (source === 'oauth' && expiresIn !== undefined && isSourceControlFiniteNumber(expiresIn) && expiresIn > 0) {
        credential.expiresAt = now() + expiresIn * 1000;
      }
      const instances = state.providers.gitlab.instances;
      const instance = instances[origin] ?? emptyInstance();
      instance.credentials.push(credential);
      instance.activeCredentialId = credentialId;
      instance.cliActive = false;
      instances[origin] = instance;
      return { changed: true, value: credential };
    }),
    activate: (origin: string, credentialId: string) => mutate((state) => {
      const instance = state.providers.gitlab.instances[origin];
      if (!instance?.credentials.some((credential) => credential.credentialId === credentialId && credential.status === 'valid')) {
        return { changed: false, value: false };
      }
      const changed = instance.activeCredentialId !== credentialId || instance.cliActive;
      instance.activeCredentialId = credentialId;
      instance.cliActive = false;
      return { changed, value: true };
    }),
    removeAccount: (origin: string, credentialId: string) => mutate((state) => {
      const instances = state.providers.gitlab.instances;
      const instance = instances[origin];
      const index = instance?.credentials.findIndex((credential) => credential.credentialId === credentialId) ?? -1;
      if (index < 0 || !instance) return { changed: false, value: false };
      instance.credentials.splice(index, 1);
      chooseActive(instance);
      retainInstance(instances, origin, instance);
      return { changed: true, value: true };
    }),
    markAccountInvalid: (origin: string, credentialId: string, reason = 'unauthorized') => mutate((state) => {
      const instance = state.providers.gitlab.instances[origin];
      const credential = instance?.credentials.find((candidate) => candidate.credentialId === credentialId);
      if (!instance || !credential) return { changed: false, value: false };
      if (credential.status === 'invalid' && credential.invalidReason === reason) return { changed: false, value: false };
      credential.status = 'invalid';
      credential.invalidReason = validText(reason) ? reason : 'unauthorized';
      chooseActive(instance);
      return { changed: true, value: true };
    }),
    setCliDisabled: (origin: string, disabled: boolean) => mutate((state) => {
      const instances = state.providers.gitlab.instances;
      const instance = instances[origin] ?? emptyInstance();
      const nextDisabled = Boolean(disabled);
      const nextActive = nextDisabled ? false : instance.cliActive;
      const changed = instance.cliDisabled !== nextDisabled || instance.cliActive !== nextActive;
      instance.cliDisabled = nextDisabled;
      instance.cliActive = nextActive;
      retainInstance(instances, origin, instance);
      return { changed, value: instance.cliDisabled };
    }),
    setCliActive: (origin: string, active: boolean) => mutate((state) => {
      const instances = state.providers.gitlab.instances;
      const instance = instances[origin] ?? emptyInstance();
      const nextActive = Boolean(active) && !instance.cliDisabled;
      const changed = instance.cliActive !== nextActive;
      instance.cliActive = nextActive;
      retainInstance(instances, origin, instance);
      return { changed, value: instance.cliActive };
    }),
  });
}
