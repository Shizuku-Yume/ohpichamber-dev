import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isString } from '../shared/guards.js';
import { OpenChamberControlError, controlErrorFields } from './error.js';
import { createPageAnswers } from './render-page.js';
<<<<<<< HEAD:packages/web/server/lib/openchamber-control/secret-request.js
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/secret-request.js
import { createSecretRuns } from './secret-run.js';
=======
import { createSecretRuns } from './secret-run.js';
import type { ActionContext } from './contracts.js';

interface SecretInput {
  label?: unknown;
  reason?: unknown;
  placeholder?: unknown;
}

export interface SecretAnswerInput {
  sessionId?: unknown;
  callId?: unknown;
  declined?: unknown;
  value?: unknown;
  values?: unknown;
  remember?: unknown;
}

interface SecretContext extends ActionContext {
  sessionId?: string | null;
  callId?: string | null;
}

interface SecretFilesOptions {
  directory: string;
  now?: () => number;
  fsPromises?: Pick<typeof fs, 'mkdir' | 'chmod' | 'writeFile' | 'rm' | 'readdir' | 'stat'>;
}

interface SecretRequestsOptions {
  isEnabled: () => boolean | Promise<boolean>;
  files?: ReturnType<typeof createSecretFiles> | null;
  onWaitChange?: NonNullable<Parameters<typeof createPageAnswers>[0]>['onWaitChange'];
  hasUnreadChat?: (sessionId: string) => Promise<boolean>;
  leases?: Parameters<typeof createSecretRuns>[0]['leases'];
  runCommand?: Parameters<typeof createSecretRuns>[0]['run'];
}
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/secret-request.ts

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/secret-request.js
const SECRET_REQUEST_MAX_LABEL_LENGTH = 120;
const SECRET_REQUEST_MAX_REASON_LENGTH = 1000;
const SECRET_REQUEST_MAX_PLACEHOLDER_LENGTH = 80;
// A token, a key or a password: the card's field is one line.
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/secret-request.js
export const SECRET_REQUEST_MAX_LABEL_LENGTH = 120;
export const SECRET_REQUEST_MAX_REASON_LENGTH = 1000;
export const SECRET_REQUEST_MAX_PLACEHOLDER_LENGTH = 80;
// A token, a key or a password: the card's field is one line.
=======
export const SECRET_REQUEST_MAX_LABEL_LENGTH = 120;
export const SECRET_REQUEST_MAX_REASON_LENGTH = 1000;
export const SECRET_REQUEST_MAX_PLACEHOLDER_LENGTH = 80;
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/secret-request.ts
const SECRET_MAX_VALUE_LENGTH = 16_000;
export const SECRET_FILE_LIFETIME_MS = 24 * 60 * 60 * 1000;

const SAVED_NOTE = "The user saved the secret to file, which only this user can read. Read it inside the command that needs it, such as TOKEN=\"$(cat <file>)\" some-cli ...; never print, echo or log it, and never copy it into the project. The file is deleted 24 hours after it was saved.";
const DECLINED_NOTE = "The user declined to give this secret. Continue without it or say what it blocks; ask again only if they want to.";
const CHAT_SENT_EARLIER_NOTE = "The card did not wait: the user had already written in the chat before it appeared, and that message follows this result. Continue from that message; ask for the secret again only if it still fits.";

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/secret-request.js
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/secret-request.js
/**
 * What the agent reads when the user wrote in the chat instead of answering
 * the card. The plugin builds that result itself (see ../agent-tool/runtime.js),
 * because the wait ends there, before this server hears of it.
 */
export const SECRET_REQUEST_CLOSED_IN_CHAT_NOTE = "The user wrote in the chat before the call finished; their message follows this result. If the card was still waiting, they gave no secret; if they pasted one in the chat, tell them to rotate it, since the chat keeps it. A command secret.run had started was stopped.";

=======
export const SECRET_REQUEST_CLOSED_IN_CHAT_NOTE = "The user wrote in the chat before the call finished; their message follows this result. If the card was still waiting, they gave no secret; if they pasted one in the chat, tell them to rotate it, since the chat keeps it. A command secret.run had started was stopped.";

>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/secret-request.ts
const NOT_WAITING_MESSAGE = 'This request is no longer waiting for a secret';

const isText = (value: unknown): value is string => isString(value);
const readText = (value: SecretAnswerInput[keyof SecretAnswerInput]) => (isText(value) ? value.trim() : '');

export const createSecretFiles = ({ directory, now = Date.now, fsPromises = fs }: SecretFilesOptions) => {
  const write = async (value: string) => {
    await fsPromises.mkdir(directory, { recursive: true, mode: 0o700 });
    await fsPromises.chmod(directory, 0o700);
    const file = path.join(directory, crypto.randomBytes(16).toString('hex'));
    try {
      await fsPromises.writeFile(file, value, { mode: 0o600, flag: 'wx' });
    } catch (error) {
<<<<<<< HEAD:packages/web/server/lib/openchamber-control/secret-request.js
      // `wx` creates the file before writing, so a failed write can leave part of the secret.
      await fsPromises.rm(file, { force: true }).catch(() => { });
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/secret-request.js
      // `wx` creates the file before writing, so a failed write can leave part of the secret.
      await fsPromises.rm(file, { force: true }).catch(() => {});
=======
      await fsPromises.rm(file, { force: true }).catch(() => {});
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/secret-request.ts
      throw error;
    }
    return file;
  };

  const remove = (file: string) => fsPromises.rm(file, { force: true });

  const sweep = async () => {
    const names = await fsPromises.readdir(directory).catch(() => []);
    const cutoff = now() - SECRET_FILE_LIFETIME_MS;
    await Promise.all(names.map(async (name) => {
      const file = path.join(directory, name);
      const stat = await fsPromises.stat(file).catch(() => null);
      if (stat && stat.mtimeMs < cutoff) await remove(file).catch(() => { });
    }));
  };

  return { write, remove, sweep };
};

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/secret-request.js
/**
 * `secret.request`: the chat shows a card for the call, and the call waits
 * until the user saves a value or declines. The wait is a page wait
 * (`createPageAnswers`), so the session shows as waiting for the user the way
 * it does for a page, with the same pending list, events and notification.
 * Its answer carries `saved` or `declined` as the summary and the file path
 * as the data; the value itself never reaches the call.
 *
 * Like a page, the card does not wait when `hasUnreadChat` finds a message
 * the user sent before it appeared: OpenCode delivers that message only once
 * this call returns, so waiting would hold it back.
 */
export const createSecretRequests = ({ isEnabled, files, onWaitChange, hasUnreadChat = async () => false }) => {
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/secret-request.js
/**
 * `secret.request`: the chat shows a card for the call, and the call waits
 * until the user saves a value or declines. The wait is a page wait
 * (`createPageAnswers`), so the session shows as waiting for the user the way
 * it does for a page, with the same pending list, events and notification.
 * Its answer carries `saved` or `declined` as the summary and the file path
 * as the data; the value itself never reaches the call.
 *
 * Like a page, the card does not wait when `hasUnreadChat` finds a message
 * the user sent before it appeared: OpenCode delivers that message only once
 * this call returns, so waiting would hold it back.
 */
export const createSecretRequests = ({ isEnabled, files, onWaitChange, hasUnreadChat = async () => false, leases, runCommand }) => {
=======
export const createSecretRequests = ({ isEnabled, files, onWaitChange, hasUnreadChat = async () => false, leases, runCommand }: SecretRequestsOptions) => {
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/secret-request.ts
  const waits = createPageAnswers({ onWaitChange });
<<<<<<< HEAD:packages/web/server/lib/openchamber-control/secret-request.js
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/secret-request.js
  // `secret.run` waits on the same card, so one answer route reaches both.
  const runs = createSecretRuns({ waits, hasUnreadChat, leases, run: runCommand });

  const assertEnabled = async () => {
    if (!await isEnabled()) {
      throw new OpenChamberControlError('The secret tool is turned off in OpenChamber settings', 403);
    }
  };

  const run = async (input, options = {}) => {
    await assertEnabled();
    return runs.execute(input, options);
  };

  const forget = async (sessionId) => {
    await assertEnabled();
    return runs.forget(sessionId);
  };
=======
  const runs = createSecretRuns({ waits, hasUnreadChat, leases, run: runCommand });

  const assertEnabled = async () => {
    if (!await isEnabled()) {
      throw new OpenChamberControlError('The secret tool is turned off in OpenChamber settings', 403);
    }
  };

  const run = async (input: Parameters<ReturnType<typeof createSecretRuns>['execute']>[0], options: SecretContext & { authorized?: boolean } = {}) => {
    await assertEnabled();
    return runs.execute(input, options);
  };

  const forget = async (sessionId: string | null) => {
    await assertEnabled();
    return runs.forget(sessionId);
  };
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/secret-request.ts

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/secret-request.js
  const request = async (input, { sessionId, callId, directory, signal } = {}) => {
    if (!await isEnabled()) {
      throw new OpenChamberControlError('The secret tool is turned off in OhPiChamber settings', 403);
    }
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/secret-request.js
  const request = async (input, { sessionId, callId, directory, signal } = {}) => {
    await assertEnabled();
=======
  const request = async (input: SecretInput, { sessionId, callId, directory, signal }: SecretContext = {}) => {
    await assertEnabled();
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/secret-request.ts
    if (!files) {
      throw new OpenChamberControlError('This server cannot store secrets', 503);
    }
    const label = readText(input.label);
    const reason = readText(input.reason);
    const placeholder = readText(input.placeholder);
    if (!label || !reason) {
      throw new OpenChamberControlError('label and reason are required: what the secret is, and what you will do with it', 400);
    }
    if (label.length > SECRET_REQUEST_MAX_LABEL_LENGTH) {
      throw new OpenChamberControlError(`label is ${label.length} characters; the limit is ${SECRET_REQUEST_MAX_LABEL_LENGTH}`, 400);
    }
    if (reason.length > SECRET_REQUEST_MAX_REASON_LENGTH) {
      throw new OpenChamberControlError(`reason is ${reason.length} characters; the limit is ${SECRET_REQUEST_MAX_REASON_LENGTH}`, 400);
    }
    if (placeholder.length > SECRET_REQUEST_MAX_PLACEHOLDER_LENGTH) {
      throw new OpenChamberControlError(`placeholder is ${placeholder.length} characters; the limit is ${SECRET_REQUEST_MAX_PLACEHOLDER_LENGTH}`, 400);
    }
    if (!sessionId || !callId) {
      throw new OpenChamberControlError('This connection cannot wait for a secret', 400);
    }
    if (await hasUnreadChat(sessionId)) {
      return { answer: { answered: false, reason: 'chat-sent-earlier' }, note: CHAT_SENT_EARLIER_NOTE };
    }
    const answer = await waits.wait({ sessionId, callId, title: label, directory, signal });
    const data: { file?: unknown } | undefined = answer.data == null ? undefined : Object(answer.data);
    const file = isText(data?.file) ? data.file : null;
    if (signal?.aborted) {
      if (file) await files.remove(file).catch(() => { });
      throw new OpenChamberControlError('The card stopped waiting before the user answered', 499);
    }
    if (answer.summary === 'saved' && file) {
      return { answer: { status: 'saved', file }, note: SAVED_NOTE };
    }
    return { answer: { status: 'declined' }, note: DECLINED_NOTE };
  };

  const settle = (sessionId: string, callId: string, summary: string, data: { file: string } | null) => {
    try {
      waits.answer({ sessionId, callId, summary, data });
    } catch (error) {
      if (controlErrorFields(error)?.statusCode === 404) throw new OpenChamberControlError(NOT_WAITING_MESSAGE, 404);
      throw error;
    }
  };

  const answer = async (input: SecretAnswerInput = {}) => {
    const sessionId = readText(input.sessionId);
    const callId = readText(input.callId);
    if (!sessionId || !callId) {
      throw new OpenChamberControlError('sessionId and callId are required', 400);
    }
    if (input.declined === true) {
      settle(sessionId, callId, 'declined', null);
      return { status: 'declined' };
    }
<<<<<<< HEAD:packages/web/server/lib/openchamber-control/secret-request.js
    const value = isString(input.value) ? input.value : '';
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/secret-request.js
    if (runs.fieldsFor(sessionId, callId)) return runs.submit(sessionId, callId, input, settle);
    const value = isString(input.value) ? input.value : '';
=======
    if (runs.fieldsFor(sessionId, callId)) return runs.submit(sessionId, callId, input, settle);
    const value = isText(input.value) ? input.value : '';
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/secret-request.ts
    if (!value.trim()) {
      throw new OpenChamberControlError('value is required', 400);
    }
    if (value.length > SECRET_MAX_VALUE_LENGTH) {
      throw new OpenChamberControlError(`The secret is ${value.length} characters; the limit is ${SECRET_MAX_VALUE_LENGTH}`, 413);
    }
    if (!files) {
      throw new OpenChamberControlError('This server cannot store secrets', 503);
    }
    const file = await files.write(value);
    try {
      settle(sessionId, callId, 'saved', { file });
    } catch (error) {
      await files.remove(file).catch(() => { });
      throw error;
    }
    return { status: 'saved' };
  };

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/secret-request.js
  return { request, answer, release: waits.release };
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/secret-request.js
  /** The fields a waiting `secret.run` card asks for; a 404 once it stopped waiting. */
  const fields = (input = {}) => {
    const asked = runs.fieldsFor(readText(input.sessionId), readText(input.callId));
    if (!asked) throw new OpenChamberControlError(NOT_WAITING_MESSAGE, 404);
    return asked;
  };

  return { request, run, forget, answer, fields, release: waits.release };
=======
  const fields = (input: Pick<SecretAnswerInput, 'sessionId' | 'callId'> = {}) => {
    const asked = runs.fieldsFor(readText(input.sessionId), readText(input.callId));
    if (!asked) throw new OpenChamberControlError(NOT_WAITING_MESSAGE, 404);
    return asked;
  };

  return { request, run, forget, answer, fields, release: waits.release };
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/secret-request.ts
};
