import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

export interface EnterprisePolicyOptions {
 env?: NodeJS.ProcessEnv | undefined;
 platform?: NodeJS.Platform | undefined;
 readFile?: ((filePath: string) => string) | undefined;
}

export interface JevPolicy {
 url: string;
 model: string | null;
 apiKey: string | null;
}

export interface EnterprisePolicy {
 enterpriseMode: boolean;
 source: 'policy-file' | 'environment' | null;
 organization: string | null;
 policyError: string | null;
 relayUrl: string | null;
 jev: JevPolicy | null;
 allowNetworkAccess: boolean;
 allowedExtensions: string[];
 allowLocalExtensions: boolean;
 hideBuiltinSkillCatalogs: boolean;
}

export interface PublicEnterprisePolicy {
 enterpriseMode: boolean;
 source: 'policy-file' | 'environment' | null;
 organization: string | null;
 policyError: string | null;
 networkAccessBlocked: boolean;
}

interface ParsedPolicyFile {
 enterpriseMode: boolean;
 organization: string | null;
 relayUrl: string | undefined;
 allowNetworkAccess: boolean | undefined;
 allowedExtensions: string[] | undefined;
 allowLocalExtensions: boolean | undefined;
 jev: JevPolicy | undefined;
 hideBuiltinSkillCatalogs: boolean;
}

type PolicyFileReadResult =
 | { status: 'absent' }
 | { status: 'ok'; path: string; policy: ParsedPolicyFile }
 | { status: 'invalid'; path: string; error: string };

export interface WatchEnterprisePolicyOptions<Policy = EnterprisePolicy> {
 onChange: () => void;
 intervalMs?: number | undefined;
 read?: (() => Policy) | undefined;
}

const WINDOWS_PROGRAM_DATA = 'C:\\ProgramData';

export const policyFilePaths = ({ platform = process.platform, env = process.env }: Pick<EnterprisePolicyOptions, 'platform' | 'env'> = {}): string[] => {
 if (platform === 'darwin') return ['/Library/Application Support/OhPiChamber/policy.json'];
 if (platform === 'win32') {
  const fixed = path.win32.join(WINDOWS_PROGRAM_DATA, 'OhPiChamber', 'policy.json');
  const programData = (env.ProgramData ?? '').trim();
  const fromEnv = programData ? path.win32.join(programData, 'OhPiChamber', 'policy.json') : null;
  return fromEnv && fromEnv.toLowerCase() !== fixed.toLowerCase() ? [fixed, fromEnv] : [fixed];
 }
 return ['/etc/openchamber/policy.json'];
};

const optionalText = z.string().trim().transform((value) => value || undefined).optional();

const policyFileSchema = z.object({
 enterpriseMode: z.boolean().optional(),
 organization: optionalText,
 relayUrl: optionalText,
 allowNetworkAccess: z.boolean().optional(),
 allowedExtensions: z.array(z.string().trim().min(1)).max(200).optional(),
 allowLocalExtensions: z.boolean().optional(),
 jev: z.object({ url: optionalText, model: optionalText, apiKey: optionalText }).optional(),
 hideBuiltinSkillCatalogs: z.boolean().optional(),
}).refine((policy) => !policy.jev || policy.jev.url || (!policy.jev.model && !policy.jev.apiKey), {
 message: '"jev" needs a "url"',
 path: ['jev'],
});
const jsonSchema = z.json();

const parsePolicyFile = (text: string): ParsedPolicyFile => {
 let raw: z.infer<typeof jsonSchema>;
 try {
  raw = jsonSchema.parse(JSON.parse(text.replace(/^\uFEFF/, '')));
 } catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`not valid JSON (${message})`);
 }
 const parsed = policyFileSchema.safeParse(raw);
 if (!parsed.success) {
  const issue = parsed.error.issues[0];
  if (!issue) throw new Error('invalid policy');
  const field = issue.path.length > 0 ? `"${issue.path.join('.')}": ` : '';
  throw new Error(`${field}${issue.message}`);
 }
 const { enterpriseMode, organization, relayUrl, allowNetworkAccess, allowedExtensions, allowLocalExtensions, jev, hideBuiltinSkillCatalogs } = parsed.data;
 return {
  enterpriseMode: enterpriseMode === true,
  organization: organization ?? null,
  relayUrl,
  allowNetworkAccess,
  allowedExtensions,
  allowLocalExtensions,
  jev: jev?.url ? { url: jev.url, model: jev.model ?? null, apiKey: jev.apiKey ?? null } : undefined,
  hideBuiltinSkillCatalogs: hideBuiltinSkillCatalogs === true,
 };
};

const defaultReadFile = (filePath: string): string => fs.readFileSync(filePath, 'utf8');

let lastWarning: string | null = null;
const warnOnce = (message: string): void => {
 if (message === lastWarning) return;
 lastWarning = message;
 console.warn(`[enterprise] ${message}`);
};

const fsErrorSchema = z.object({
 code: z.string().optional(),
 message: z.string().optional(),
});

const readPolicyFile = ({ platform = process.platform, env = process.env, readFile = defaultReadFile }: EnterprisePolicyOptions = {}): PolicyFileReadResult => {
 for (const filePath of policyFilePaths({ platform, env })) {
  let text: string;
  try {
   text = readFile(filePath);
  } catch (error) {
   const parsedError = fsErrorSchema.safeParse(error);
   const code = parsedError.success ? parsedError.data.code : undefined;
   if (code === 'ENOENT' || code === 'ENOTDIR') continue;
   const detail = (parsedError.success ? parsedError.data.message : undefined) || (error instanceof Error ? error.message : String(error));
   const message = `cannot read ${filePath}: ${detail}`;
   warnOnce(`${message}; enterprise mode stays on`);
   return { status: 'invalid', path: filePath, error: message };
  }
  try {
   return { status: 'ok', path: filePath, policy: parsePolicyFile(text) };
  } catch (error) {
   const detail = error instanceof Error ? error.message : String(error);
   const message = `${filePath}: ${detail}`;
   warnOnce(`${message}; enterprise mode stays on`);
   return { status: 'invalid', path: filePath, error: message };
  }
 }
 return { status: 'absent' };
};

const envFlag = (env: NodeJS.ProcessEnv, name: string): boolean => {
 const value = (env[name] ?? '').trim().toLowerCase();
 return value === '1' || value === 'true';
};

const envString = (env: NodeJS.ProcessEnv, name: string): string | null => (env[name] ?? '').trim() || null;

const envList = (env: NodeJS.ProcessEnv, name: string): string[] => (env[name] ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);

export const watchEnterprisePolicy = <Policy = EnterprisePolicy>({ onChange, intervalMs = 15_000, read }: WatchEnterprisePolicyOptions<Policy>): (() => void) => {
 const readPolicy = read ?? (() => readEnterprisePolicy());
 let last = JSON.stringify(readPolicy());
 const timer = setInterval(() => {
  const next = JSON.stringify(readPolicy());
  if (next === last) return;
  last = next;
  onChange();
 }, intervalMs);
 timer.unref?.();
 return () => clearInterval(timer);
};

export const readEnterprisePolicy = (options: EnterprisePolicyOptions = {}): EnterprisePolicy => {
 const env = options.env ?? process.env;
 const file = readPolicyFile(options);

 if (file.status === 'invalid') {
  return {
   enterpriseMode: true,
   source: 'policy-file',
   organization: null,
   policyError: file.error,
   relayUrl: null,
   jev: null,
   allowNetworkAccess: false,
   allowedExtensions: [],
   allowLocalExtensions: false,
   hideBuiltinSkillCatalogs: true,
  };
 }

 const fromFile = file.status === 'ok' ? file.policy : null;
 const fileGoverns = fromFile?.enterpriseMode === true;
 const enterpriseMode = fileGoverns || envFlag(env, 'OPENCHAMBER_ENTERPRISE_MODE');

 const envJevUrl = fileGoverns ? null : envString(env, 'OPENCHAMBER_JEV_URL');
 const jev = fromFile?.jev
  ?? (envJevUrl
   ? { url: envJevUrl, model: envString(env, 'OPENCHAMBER_JEV_MODEL'), apiKey: envString(env, 'OPENCHAMBER_JEV_API_KEY') }
   : null);
 const relayUrl = fromFile?.relayUrl ?? (fileGoverns ? null : envString(env, 'OPENCHAMBER_RELAY_URL'));
 const allowNetworkAccess = fromFile?.allowNetworkAccess
  ?? (fileGoverns ? false : envFlag(env, 'OPENCHAMBER_ALLOW_NETWORK_ACCESS'));
 const allowedExtensions = fromFile?.allowedExtensions
  ?? (fileGoverns ? [] : envList(env, 'OPENCHAMBER_ALLOWED_EXTENSIONS'));
 const allowLocalExtensions = fromFile?.allowLocalExtensions
  ?? (fileGoverns ? false : envFlag(env, 'OPENCHAMBER_ALLOW_LOCAL_EXTENSIONS'));

 return {
  enterpriseMode,
  source: fileGoverns ? 'policy-file' : enterpriseMode ? 'environment' : null,
  organization: fromFile?.organization ?? null,
  policyError: null,
  relayUrl,
  jev,
  allowNetworkAccess,
  allowedExtensions,
  allowLocalExtensions,
  hideBuiltinSkillCatalogs: fromFile?.hideBuiltinSkillCatalogs === true,
 };
};

export const isEnterpriseMode = (options: EnterprisePolicyOptions = {}): boolean => readEnterprisePolicy(options).enterpriseMode;

export const isNetworkAccessBlocked = (options: EnterprisePolicyOptions = {}): boolean => {
 const policy = readEnterprisePolicy(options);
 return policy.enterpriseMode && !policy.allowNetworkAccess;
};

export const ENTERPRISE_MODE_ERROR = 'Not available in enterprise mode: this operation is blocked by enterprise policy.';

export const NETWORK_ACCESS_BLOCKED_ERROR = 'Enterprise mode keeps OhPiChamber on this machine: it does not listen on a network address. '
 + 'An administrator can allow it with "allowNetworkAccess": true in the policy file, or OPENCHAMBER_ALLOW_NETWORK_ACCESS=1 where the environment turns enterprise mode on.';

export const publicEnterprisePolicy = (options: EnterprisePolicyOptions = {}): PublicEnterprisePolicy => {
 const { enterpriseMode, source, organization, policyError, allowNetworkAccess } = readEnterprisePolicy(options);
 return { enterpriseMode, source, organization, policyError, networkAccessBlocked: enterpriseMode && !allowNetworkAccess };
};
