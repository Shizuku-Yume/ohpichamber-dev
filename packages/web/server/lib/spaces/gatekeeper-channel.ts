import { readFileSync } from 'node:fs';
import net from 'node:net';
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
import type { ParsedContainerResponse } from './exec-http.js';
import { ROLE_GATEKEEPER } from './labels.js';
import {
  GATEKEEPER_BIND_PATH,
  GATEKEEPER_CONTROL_HOST,
  GATEKEEPER_CONTROL_PORT,
  GATEKEEPER_PROGRAM_DIRECTORY,
  GATEKEEPER_PROGRAM_PATH,
  IMAGE_ONLY_PATH,
  IMAGE_SH,
} from './layout.js';
import type { RunCommandResult } from './run-command.js';

export const GATEKEEPER_PROGRAM = readFileSync(new URL('./gatekeeper-program.cjs', import.meta.url), 'utf8');

const REQUEST_SECONDS = 20;
const HEALTH_SECONDS = 3;
const READY_TIMEOUT_MS = 60_000;
const READY_PAUSE_MS = 250;
const READY_MAX_ATTEMPTS = 1_000;

const MAX_JOURNAL_RECORDS = 1_000;
const MAX_JOURNAL_BODY_CHARACTERS = 1024 * 1024;
const MAX_JOURNAL_FIELD_CHARACTERS = 256;

const WRITE_PROGRAM_SCRIPT = [
  IMAGE_ONLY_PATH,
  `mkdir -p ${GATEKEEPER_PROGRAM_DIRECTORY}`,
  `&& printf '%s' "$1" > ${GATEKEEPER_BIND_PATH}.new && mv ${GATEKEEPER_BIND_PATH}.new ${GATEKEEPER_BIND_PATH}`,
  `&& cat > ${GATEKEEPER_PROGRAM_PATH}.new && mv ${GATEKEEPER_PROGRAM_PATH}.new ${GATEKEEPER_PROGRAM_PATH}`,
].join(' ');

const MAX_POLICY_BODY_CHARACTERS = 256 * 1024;
const MAX_POLICY_ENTRIES = 1_000;

const errorDetailSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

const rawPolicySchema = z.object({
  mode: z.json().optional(),
  domains: z.array(z.json()),
  grants: z.array(z.json()),
});

const rawJournalSchema = z.object({
  records: z.array(z.json()),
  dropped: z.json().optional(),
  since: z.json().optional(),
});

const journalRecordSchema = z.object({
  at: z.json().optional(),
  listener: z.json().optional(),
  host: z.json().optional(),
  port: z.json().optional(),
  decision: z.json().optional(),
});

export interface PlaceExecOptions {
  stdin?: string | Buffer | undefined;
  timeoutMs?: number | undefined;
  target?: string | undefined;
  maxOutputBytes?: number | undefined;
  keepTail?: boolean | undefined;
  killTree?: boolean | undefined;
}

export type PlaceExecFn = (
  spaceId: string,
  argv: readonly string[],
  options?: PlaceExecOptions,
) => Promise<RunCommandResult>;

export interface CreateGatekeeperChannelOptions {
  exec: PlaceExecFn;
  wait?: ((milliseconds: number) => Promise<void>) | undefined;
  now?: (() => number) | undefined;
}

export interface GatekeeperRequestOptions {
  method?: string | undefined;
  path: string;
  body?: string | null | undefined;
  timeoutSeconds?: number | undefined;
}

export interface GatekeeperNetworkOptions {
  mode: 'allowlist' | 'open';
  domains?: readonly string[] | undefined;
}

export interface GatekeeperGrantOptions {
  id: string;
  upstream: string;
  header?: string | null | undefined;
  secret?: string | null | undefined;
}

export interface GatekeeperPolicy {
  mode: 'allowlist' | 'open';
  domains: string[];
  grants: string[];
}

export interface GatekeeperJournalRecord {
  at: string;
  listener: string;
  host: string;
  port: number;
  decision: string;
}

export interface GatekeeperJournal {
  records: GatekeeperJournalRecord[];
  dropped: number;
  since: string;
}

export interface GatekeeperChannel {
  writeProgram: (spaceId: string, options: { bindAddress: string }) => Promise<void>;
  waitUntilReady: (spaceId: string) => Promise<void>;
  setNetwork: (spaceId: string, options: GatekeeperNetworkOptions) => Promise<void>;
  addGrant: (spaceId: string, options: GatekeeperGrantOptions) => Promise<void>;
  readPolicy: (spaceId: string) => Promise<GatekeeperPolicy>;
  readJournal: (spaceId: string) => Promise<GatekeeperJournal>;
}

const pause = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => { setTimeout(resolve, milliseconds); });

const unreadableAnswer = (why: string): SpaceError =>
  new SpaceError('gatekeeper_answer_unreadable', `The network filter of the space ${why}`);

const isPrimitiveField = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

const isSafeInteger = (value: unknown): value is number => Number.isSafeInteger(value);

const text = (value: z.infer<ReturnType<typeof z.json>> | undefined): string =>
(isPrimitiveField(value) ? String(value).slice(0, MAX_JOURNAL_FIELD_CHARACTERS) : '');

export function createGatekeeperChannel({
  exec,
  wait = pause,
  now = Date.now,
}: CreateGatekeeperChannelOptions): GatekeeperChannel {
  const execInGatekeeper = (
    spaceId: string,
    argv: readonly string[],
    options?: Omit<PlaceExecOptions, 'target'>,
  ): Promise<RunCommandResult> => exec(spaceId, argv, { ...options, target: ROLE_GATEKEEPER });

  const writeProgram = async (spaceId: string, { bindAddress }: { bindAddress: string }): Promise<void> => {
    if (net.isIP(bindAddress) === 0 || bindAddress === '0.0.0.0' || bindAddress === '::') {
      throw new SpaceError(
        'gatekeeper_address_unknown',
        'The address of the network filter on the space\'s network is not known, so its listeners cannot be bound to it.',
      );
    }
    const result = await execInGatekeeper(
      spaceId,
      [IMAGE_SH, '-c', WRITE_PROGRAM_SCRIPT, 'sh', bindAddress],
      { stdin: GATEKEEPER_PROGRAM },
    );
    if (result.code !== 0) {
      throw new SpaceError(
        'gatekeeper_setup_failed',
        `Could not store the network filter's program: ${tail(result.stderr) || `exit code ${result.code}`}`,
      );
    }
  };

  const request = async (
    spaceId: string,
    { method = 'GET', path, body = null, timeoutSeconds = REQUEST_SECONDS }: GatekeeperRequestOptions,
  ): Promise<ParsedContainerResponse> => {
    const config = buildCurlConfig({
      url: `http://${GATEKEEPER_CONTROL_HOST}:${GATEKEEPER_CONTROL_PORT}${path}`,
      method,
      headers: body === null ? {} : { 'Content-Type': 'application/json' },
      body,
    });
    let result: RunCommandResult;
    try {
      result = await execInGatekeeper(
        spaceId,
        buildCurlArgs(timeoutSeconds),
        { stdin: `${config}\n`, timeoutMs: (timeoutSeconds + 10) * 1000 },
      );
    } catch (error) {
      const detail = errorDetailSchema.safeParse(error).data;
      if (detail?.code === 'command_output_too_large') {
        throw unreadableAnswer('answered with more data than the host accepts');
      }
      if (detail?.code !== undefined && EXEC_INTERRUPTED_CODES.includes(detail.code)) {
        const message = error instanceof Error ? error.message : (detail.message ?? String(error));
        throw new SpaceError(
          'gatekeeper_unreachable',
          `The request to the network filter did not finish in time: ${message}`,
          { curlExitCode: null, execFailed: false },
        );
      }
      throw error;
    }
    if (result.code !== 0) {
      throw new SpaceError(
        'gatekeeper_unreachable',
        `The gatekeeper of the space did not answer: ${tail(result.stderr) || `curl exit code ${result.code}`}`,
        { curlExitCode: result.code, execFailed: EXEC_FAILED_CODES.includes(result.code) && !isFromCurl(result.stderr) },
      );
    }
    return parseResponse(result.stdout, unreadableAnswer);
  };

  const command = async (spaceId: string, path: string, body: Record<string, string | readonly string[] | null>, what: string): Promise<void> => {
    const answer = await request(spaceId, { method: 'POST', path, body: JSON.stringify(body) });
    if (answer.status !== 200) {
      throw new SpaceError(
        'gatekeeper_refused',
        `The network filter refused to ${what}: ${tail(answer.body) || `status ${answer.status}`}`,
        { status: answer.status },
      );
    }
  };

  const waitUntilReady = async (spaceId: string): Promise<void> => {
    const started = now();
    let last = 'no answer yet';
    for (let attempt = 0; attempt < READY_MAX_ATTEMPTS && now() - started < READY_TIMEOUT_MS; attempt += 1) {
      try {
        const answer = await request(spaceId, { path: '/health', timeoutSeconds: HEALTH_SECONDS });
        if (answer.status === 200) {
          return;
        }
        last = `the control channel answered ${answer.status}`;
      } catch (error) {
        if (!(error instanceof SpaceError)) {
          throw error;
        }
        const fromInside = error.code === 'gatekeeper_answer_unreadable'
          || (error.code === 'gatekeeper_unreachable' && error.details?.execFailed !== true);
        if (!fromInside) {
          throw error;
        }
        last = error.message;
      }
      await wait(READY_PAUSE_MS);
    }
    throw new SpaceError(
      'gatekeeper_not_ready',
      `The gatekeeper of the space did not become ready within ${Math.round((now() - started) / 1000)} seconds (${last}). Look at the output of its container.`,
    );
  };

  const setNetwork = (spaceId: string, { mode, domains = [] }: GatekeeperNetworkOptions): Promise<void> =>
    command(spaceId, '/network', { mode, domains }, 'change the network of this space');

  const addGrant = (spaceId: string, { id, upstream, header = null, secret = null }: GatekeeperGrantOptions): Promise<void> =>
    command(
      spaceId,
      '/grants',
      secret === null ? { id, upstream } : { id, upstream, header, secret },
      `add the grant '${id}'`,
    );

  const readPolicy = async (spaceId: string): Promise<GatekeeperPolicy> => {
    const answer = await request(spaceId, { path: '/policy' });
    if (answer.status !== 200) throw unreadableAnswer(`answered ${answer.status} for its policy`);
    if (answer.body.length > MAX_POLICY_BODY_CHARACTERS) throw unreadableAnswer('answered with a policy larger than the host reads');
    let json: z.infer<ReturnType<typeof z.json>>;
    try {
      json = z.json().parse(JSON.parse(answer.body));
    } catch {
      throw unreadableAnswer('answered with a policy that is not JSON');
    }
    const parsed = rawPolicySchema.safeParse(json);
    if (!parsed.success) {
      throw unreadableAnswer('answered with a policy that holds no lists');
    }
    const names = (list: z.infer<ReturnType<typeof z.json>>[]): string[] =>
      list.slice(0, MAX_POLICY_ENTRIES).map(text).filter((entry) => entry !== '');
    return {
      mode: parsed.data.mode === 'open' ? 'open' : 'allowlist',
      domains: names(parsed.data.domains),
      grants: names(parsed.data.grants),
    };
  };

  const readJournal = async (spaceId: string): Promise<GatekeeperJournal> => {
    const answer = await request(spaceId, { path: '/journal' });
    if (answer.status !== 200) {
      throw unreadableAnswer(`answered ${answer.status} for its journal`);
    }
    if (answer.body.length > MAX_JOURNAL_BODY_CHARACTERS) {
      throw unreadableAnswer(`answered with a journal of ${answer.body.length} characters, more than the ${MAX_JOURNAL_BODY_CHARACTERS} the host reads`);
    }
    let json: z.infer<ReturnType<typeof z.json>>;
    try {
      json = z.json().parse(JSON.parse(answer.body));
    } catch {
      throw unreadableAnswer('answered with a journal that is not JSON');
    }
    const parsed = rawJournalSchema.safeParse(json);
    if (!parsed.success) {
      throw unreadableAnswer('answered with a journal that holds no records');
    }
    return {
      records: parsed.data.records.slice(0, MAX_JOURNAL_RECORDS).map((entry) => {
        const record = journalRecordSchema.safeParse(entry);
        const fields = record.success ? record.data : {};
        return {
          at: text(fields.at),
          listener: text(fields.listener),
          host: text(fields.host),
          port: isSafeInteger(fields.port) ? fields.port : 0,
          decision: text(fields.decision),
        };
      }),
      dropped: isSafeInteger(parsed.data.dropped) && parsed.data.dropped >= 0 ? parsed.data.dropped : 0,
      since: text(parsed.data.since),
    };
  };

  return { writeProgram, waitUntilReady, setNetwork, addGrant, readPolicy, readJournal };
}
