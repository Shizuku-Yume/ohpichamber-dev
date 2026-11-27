import crypto from 'node:crypto';
import { z } from 'zod';

import { SpaceError } from './errors.js';
import {
  EXEC_FAILED_CODES,
  EXEC_INTERRUPTED_CODES,
  buildCurlArgs,
  buildCurlConfig,
  isFromCurl,
  parseResponse,
  tail,
} from './exec-http.js';
import {
  IMAGE_CAT,
  IMAGE_ONLY_PATH,
  IMAGE_SH,
  SPACE_IDLE_STOP_PATH,
  SPACE_SERVER_HOST,
  SPACE_SERVER_PORT,
  SPACE_TOKEN_DIRECTORY,
  SPACE_TOKEN_PATH,
} from './layout.js';

const REQUEST_SECONDS = 20;
const HEALTH_SECONDS = 3;
const READY_TIMEOUT_MS = 120_000;
const READY_PAUSE_MS = 500;
const READY_MAX_ATTEMPTS = 1_000;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const READ_TOKEN_TIMEOUT_MS = 10_000;

const WRITE_TOKEN_SCRIPT = [
  IMAGE_ONLY_PATH,
  'umask 077;',
  `mkdir -p ${SPACE_TOKEN_DIRECTORY} && chmod 700 ${SPACE_TOKEN_DIRECTORY}`,
  `&& cat > ${SPACE_TOKEN_PATH}.new && mv ${SPACE_TOKEN_PATH}.new ${SPACE_TOKEN_PATH}`,
].join(' ');

const WRITE_IDLE_STOP_SCRIPT = [
  IMAGE_ONLY_PATH,
  'umask 077;',
  `mkdir -p ${SPACE_TOKEN_DIRECTORY} && chmod 700 ${SPACE_TOKEN_DIRECTORY}`,
  `&& cat > ${SPACE_IDLE_STOP_PATH}.new && mv ${SPACE_IDLE_STOP_PATH}.new ${SPACE_IDLE_STOP_PATH}`,
].join(' ');

const healthBodySchema = z.object({
  status: z.string().optional(),
});

const errorDetailSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
  details: z.object({ execFailed: z.boolean().optional() }).nullable().optional(),
});

export interface SpaceServerExecOptions {
  stdin?: string | Buffer | undefined;
  timeoutMs?: number | undefined;
}

export interface SpaceServerExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type SpaceServerExec = (
  spaceId: string,
  argv: readonly string[],
  options?: SpaceServerExecOptions,
) => Promise<SpaceServerExecResult>;

export interface SpaceServerChannelDependencies {
  exec: SpaceServerExec;
  wait?: ((milliseconds: number) => Promise<void>) | undefined;
  now?: (() => number) | undefined;
}

export interface SpaceServerRequestOptions {
  method?: string | undefined;
  path: string;
  headers?: Record<string, string> | undefined;
  body?: string | null | undefined;
  timeoutSeconds?: number | undefined;
}

export interface SpaceServerResponse {
  status: number;
  headers: Record<string, string[]>;
  body: string;
}

export interface SpaceIdleStopSetting {
  enabled: boolean;
  hours: number;
}

const pause = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => { setTimeout(resolve, milliseconds); });

export const createSpaceToken = (): string => crypto.randomBytes(32).toString('base64url');

const unreadableAnswer = (why: string): SpaceError =>
  new SpaceError('space_server_answer_unreadable', `The server inside the space ${why}`);

const MAX_HEALTH_BODY_CHARACTERS = 64 * 1024;

const reportsReady = (answer: SpaceServerResponse): boolean => {
  if (answer.status !== 200 || answer.body.length > MAX_HEALTH_BODY_CHARACTERS) {
    return false;
  }
  try {
    const parsed = healthBodySchema.safeParse(JSON.parse(answer.body));
    return parsed.success && parsed.data.status === 'ok';
  } catch {
    return false;
  }
};

export function createSpaceServerChannel({ exec, wait = pause, now = Date.now }: SpaceServerChannelDependencies) {
  const runFixedScript = async (spaceId: string, argv: readonly string[], stdin: string, what: string): Promise<string> => {
    const result = await exec(spaceId, argv, { stdin });
    if (result.code !== 0) {
      throw new SpaceError('space_setup_failed', `Could not ${what} inside the space: ${tail(result.stderr) || `exit code ${result.code}`}`);
    }
    return result.stdout;
  };

  const writeToken = (spaceId: string, token: string): Promise<string> =>
    runFixedScript(spaceId, [IMAGE_SH, '-c', WRITE_TOKEN_SCRIPT], token, 'store the server token');

  const writeIdleStop = (spaceId: string, setting: SpaceIdleStopSetting): Promise<string> =>
    runFixedScript(spaceId, [IMAGE_SH, '-c', WRITE_IDLE_STOP_SCRIPT], JSON.stringify(setting), 'store the idle stop setting');

  const readToken = async (spaceId: string): Promise<string> => {
    const unreadable = (why: string): SpaceError =>
      new SpaceError('space_token_unreadable', `The token file of the server inside the space ${why}. Something inside the space changed it.`);
    let result: SpaceServerExecResult;
    try {
      result = await exec(spaceId, [IMAGE_CAT, SPACE_TOKEN_PATH], { stdin: '', timeoutMs: READ_TOKEN_TIMEOUT_MS });
    } catch (error) {
      const code = errorDetailSchema.safeParse(error).data?.code;
      if (code === 'command_output_too_large') throw unreadable('is far too large');
      if (code && EXEC_INTERRUPTED_CODES.includes(code)) throw unreadable('could not be read in time');
      throw error;
    }
    if (result.code !== 0) {
      throw new SpaceError('space_setup_failed', `Could not read the server token inside the space: ${tail(result.stderr) || `exit code ${result.code}`}`);
    }
    const token = result.stdout.trim();
    if (!TOKEN_PATTERN.test(token)) {
      throw unreadable(token === '' ? 'is empty' : 'does not hold a token');
    }
    return token;
  };

  const request = async (
    spaceId: string,
    { method = 'GET', path, headers = {}, body = null, timeoutSeconds = REQUEST_SECONDS }: SpaceServerRequestOptions,
  ): Promise<SpaceServerResponse> => {
    const config = buildCurlConfig({ url: `http://${SPACE_SERVER_HOST}:${SPACE_SERVER_PORT}${path}`, method, headers, body });
    let result: SpaceServerExecResult;
    try {
      result = await exec(
        spaceId,
        buildCurlArgs(timeoutSeconds),
        { stdin: `${config}\n`, timeoutMs: (timeoutSeconds + 10) * 1000 },
      );
    } catch (error) {
      const detail = errorDetailSchema.safeParse(error).data;
      if (detail?.code === 'command_output_too_large') {
        throw unreadableAnswer('answered with more data than the host accepts');
      }
      if (detail?.code && EXEC_INTERRUPTED_CODES.includes(detail.code)) {
        const message = detail.message ?? String(error);
        throw new SpaceError('space_server_unreachable', `The request to the server inside the space did not finish in time: ${message}`, { curlExitCode: null, execFailed: false });
      }
      throw error;
    }
    if (result.code !== 0) {
      throw new SpaceError(
        'space_server_unreachable',
        `The server inside the space did not answer: ${tail(result.stderr) || `curl exit code ${result.code}`}`,
        { curlExitCode: result.code, execFailed: EXEC_FAILED_CODES.includes(result.code) && !isFromCurl(result.stderr) },
      );
    }
    return parseResponse(result.stdout, unreadableAnswer);
  };

  const waitUntilReady = async (spaceId: string): Promise<void> => {
    const started = now();
    let last = 'no answer yet';
    for (let attempt = 0; attempt < READY_MAX_ATTEMPTS && now() - started < READY_TIMEOUT_MS; attempt += 1) {
      try {
        if (reportsReady(await request(spaceId, { path: '/health', timeoutSeconds: HEALTH_SECONDS }))) {
          return;
        }
        last = 'the answer does not report the server ready';
      } catch (error) {
        const detail = errorDetailSchema.safeParse(error).data;
        const fromInside = detail?.code === 'space_server_answer_unreadable'
          || (detail?.code === 'space_server_unreachable' && detail.details?.execFailed !== true);
        if (!fromInside) {
          throw error;
        }
        last = detail?.message ?? String(error);
      }
      await wait(READY_PAUSE_MS);
    }
    throw new SpaceError(
      'space_server_not_ready',
      `The server inside the space did not become ready within ${Math.round((now() - started) / 1000)} seconds (${last}). Look at the output of the space container, and check that the space has enough memory.`,
    );
  };

  return { writeToken, writeIdleStop, readToken, request, waitUntilReady };
}

export type SpaceServerChannel = ReturnType<typeof createSpaceServerChannel>;
