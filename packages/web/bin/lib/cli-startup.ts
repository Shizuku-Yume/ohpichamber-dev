import fs from 'fs';
import { z } from 'zod';
import os from 'os';
import path from 'path';
import { spawnSync, type StdioOptions } from 'child_process';
import { DEFAULT_PORT, type CliOptions } from './cli-args.js';
import { EXIT_CODE, TunnelCliError } from './cli-errors.js';
import { getDataDir } from './cli-paths.js';
import { hasUiPasswordConfigured } from './cli-network.js';
import { injectedEnvKeys } from '../../server/lib/injected-env.js';
import { isString } from '../../server/lib/shared/object-guards.js';

const STARTUP_SERVICE_ID = 'dev.ohpichamber.web';

export type StartupServiceOptions = Partial<Pick<CliOptions, 'port' | 'host' | 'uiPassword' | 'apiOnly' | 'envSnapshot'>>;

export type StartupStatus = {
  supported: boolean;
  platform: string;
  enabled: boolean;
  active?: boolean | null;
  activeState?: string;
  servicePath: string | null;
  lingerEnabled?: boolean | null;
  lingerUser?: string | null;
};

interface StartupCommandOptions {
  stdio?: StdioOptions | undefined;
  timeout?: number | undefined;
  allowFailure?: boolean | undefined;
}

type StartupServicePaths = { platform: string; servicePath: string | null };

function getStartupServicePaths(): StartupServicePaths {
  if (process.platform === 'darwin') {
    return {
      platform: 'macos',
      servicePath: path.join(os.homedir(), 'Library', 'LaunchAgents', `${STARTUP_SERVICE_ID}.plist`),
    };
  }
  if (process.platform === 'linux') {
    return {
      platform: 'linux',
      servicePath: path.join(os.homedir(), '.config', 'systemd', 'user', 'ohpichamber.service'),
    };
  }
  if (process.platform === 'win32') {
    return { platform: 'windows', servicePath: STARTUP_SERVICE_ID };
  }
  return { platform: process.platform, servicePath: null };
}

function escapeXml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function systemdEscapeArg(value: string): string {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function startupShellQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function systemdUnitPath(value: string): string {
  return String(value).replace(/\\/g, '\\\\').replace(/ /g, '\\x20');
}

function powershellQuote(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function startupEnvFileQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function systemdEnvFileQuote(value: string): string {
  return `"${String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')}"`;
}

function getStartupEnvFilePath(): string {
  return path.join(getDataDir(), 'startup.env');
}

function getMacosStartupWrapperPath(): string {
  return path.join(getDataDir(), 'bin', 'OhPiChamber');
}

function getWindowsStartupWrapperPath(): string {
  return path.join(getDataDir(), 'bin', 'OhPiChamber.ps1');
}

function collectStartupEnv(options: StartupServiceOptions = {}) {
  const injected = injectedEnvKeys(process.env);
  const env: Record<string, string> = {};
  if (options.envSnapshot !== false) {
    for (const [key, value] of Object.entries(process.env)) {
      if (!injected.has(key) && isString(value) && shouldPersistStartupEnv(key, value)) {
        env[key] = value;
      }
    }
  }

  const uiPassword = hasUiPasswordConfigured(options.uiPassword) ? options.uiPassword : undefined;
  if (uiPassword) {
    env.OPENCHAMBER_UI_PASSWORD = uiPassword;
  }
  if (options.apiOnly === true) {
    env.OPENCHAMBER_API_ONLY = 'true';
  }
  const dataDirEnv = process.env.OPENCHAMBER_DATA_DIR;
  if (isString(dataDirEnv) && dataDirEnv.trim().length > 0) {
    env.OPENCHAMBER_DATA_DIR = path.resolve(dataDirEnv.trim());
  }
  return env;
}

function shouldPersistStartupEnv(key: string, value: string | undefined): value is string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return false;
  if (!isString(value)) return false;
  if (/[\r\n]/.test(value)) return false;

  const volatileKeys = new Set([
    '_',
    'BASH_ENV',
    'COLUMNS',
    'CONDA_DEFAULT_ENV',
    'CONDA_PREFIX',
    'CONDA_PROMPT_MODIFIER',
    'CONDA_SHLVL',
    'ENV',
    'HISTFILE',
    'HISTFILESIZE',
    'HISTSIZE',
    'LINES',
    'OLDPWD',
    'PROMPT',
    'PROMPT_COMMAND',
    'PS1',
    'PS2',
    'PS3',
    'PS4',
    'PWD',
    'PYENV_VERSION',
    'SHLVL',
    'TERM',
    'TERM_PROGRAM',
    'TERM_PROGRAM_VERSION',
    'TTY',
    'VIRTUAL_ENV',
    'VIRTUAL_ENV_PROMPT',
  ]);
  return !volatileKeys.has(key);
}

function writeStartupEnvFile(
  options: StartupServiceOptions = {},
  fileOptions: { quoteValue?: (value: string) => string } = {},
): string {
  const envFilePath = getStartupEnvFilePath();
  const lines: string[] = [];
  const env = collectStartupEnv(options);
  const quoteValue = fileOptions.quoteValue ?? startupEnvFileQuote;
  for (const [key, value] of Object.entries(env)) {
    lines.push(`${key}=${quoteValue(value)}`);
  }
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(envFilePath, lines.length > 0 ? `${lines.join('\n')}\n` : '', { mode: 0o600 });
  return envFilePath;
}

function removeStartupEnvFile(): void {
  try {
    fs.unlinkSync(getStartupEnvFilePath());
  } catch {
    void 0;
  }
}

const PNPM_STORE_SEGMENT = `${path.sep}.pnpm${path.sep}`;
const PACKAGE_SEGMENT = `${path.sep}node_modules${path.sep}ohpichamber${path.sep}`;

function stablePnpmEntrypoint(resolved: string, exists: (candidate: string) => boolean = fs.existsSync): string | null {
  const storeIndex = resolved.indexOf(PNPM_STORE_SEGMENT);
  if (storeIndex < 0) return null;
  const packageIndex = resolved.indexOf(PACKAGE_SEGMENT, storeIndex);
  if (packageIndex < 0) return null;
  const stable = path.join(
    resolved.slice(0, storeIndex),
    'ohpichamber',
    resolved.slice(packageIndex + PACKAGE_SEGMENT.length),
  );
  return exists(stable) ? stable : null;
}

function isPnpmGlobalLinkEntrypoint(invoked: string): boolean {
  const packageIndex = invoked.indexOf(PACKAGE_SEGMENT);
  if (packageIndex < 0) return false;
  const linkPath = invoked.slice(0, packageIndex);
  const layoutDir = path.dirname(linkPath);
  if (!/^v\d+$/.test(path.basename(layoutDir)) || path.basename(path.dirname(layoutDir)) !== 'global') {
    return false;
  }
  try {
    return fs.lstatSync(linkPath).isSymbolicLink();
  } catch {
    return false;
  }
}

function resolveCliEntrypoint(): string {
  const argvEntry = process.argv[1];
  const entry = isString(argvEntry) && argvEntry.trim().length > 0
    ? argvEntry
    : path.join(__dirname, 'cli.js');
  const invoked = path.resolve(entry);
  if (isPnpmGlobalLinkEntrypoint(invoked)) {
    return invoked;
  }
  let resolved: string;
  try {
    resolved = fs.realpathSync(entry);
  } catch {
    return path.resolve(entry);
  }
  return stablePnpmEntrypoint(resolved) ?? resolved;
}

function buildStartupArgs(options: StartupServiceOptions = {}): string[] {
  const args = [resolveCliEntrypoint(), 'serve', '--foreground', '--port', String(options.port || DEFAULT_PORT)];
  if (isString(options.host) && options.host.length > 0) {
    args.push('--host', options.host);
  }
  if (options.apiOnly === true) {
    args.push('--api-only');
  }
  return args;
}

function writeMacosStartupWrapper(options: StartupServiceOptions = {}): string {
  const wrapperPath = getMacosStartupWrapperPath();
  const args = buildStartupArgs(options).map(startupShellQuote).join(' ');
  const content = `#!/bin/sh
exec ${startupShellQuote(process.execPath)} ${args}
`;
  fs.mkdirSync(path.dirname(wrapperPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(wrapperPath, content, { mode: 0o700 });
  return wrapperPath;
}

function writeWindowsStartupWrapper(options: StartupServiceOptions = {}): string {
  const wrapperPath = getWindowsStartupWrapperPath();
  const envFilePath = getStartupEnvFilePath();
  const startupArgs = buildStartupArgs(options).map(powershellQuote).join(' ');
  const ps1Content = [
    `$envFile=${powershellQuote(envFilePath)}`,
    `if (Test-Path $envFile) { Get-Content $envFile | ForEach-Object { if ($_ -match '^([^=]+)=(.*)$') { $v=$matches[2]; if ($v.StartsWith("'") -and $v.EndsWith("'")) { $v=$v.Substring(1,$v.Length-2).Replace("'\\''","'") }; [Environment]::SetEnvironmentVariable($matches[1], $v, 'Process') } } }`,
    `& ${powershellQuote(process.execPath)} ${startupArgs}`,
  ].join('; ');
  fs.mkdirSync(path.dirname(wrapperPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(wrapperPath, ps1Content, { mode: 0o700 });
  return wrapperPath;
}

function buildWindowsStartupTaskCommand(wrapperPath: string): string {
  return `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${wrapperPath}"`;
}

function buildMacosLaunchAgent(options: StartupServiceOptions = {}): string {
  const wrapperPath = writeMacosStartupWrapper(options);
  const args = [wrapperPath];
  const env = collectStartupEnv(options);
  const logDir = path.join(os.homedir(), 'Library', 'Logs', 'OhPiChamber');
  const argXml = args.map((arg) => `    <string>${escapeXml(arg)}</string>`).join('\n');
  const envXml = Object.entries(env).length > 0
    ? `  <key>EnvironmentVariables</key>\n  <dict>\n${Object.entries(env).map(([key, value]) => `    <key>${escapeXml(key)}</key>\n    <string>${escapeXml(value)}</string>`).join('\n')}\n  </dict>\n`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${STARTUP_SERVICE_ID}</string>
  <key>ProgramArguments</key>
  <array>
${argXml}
  </array>
${envXml}  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>${escapeXml(os.homedir())}</string>
  <key>StandardOutPath</key>
  <string>${escapeXml(path.join(logDir, 'startup.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(path.join(logDir, 'startup.err.log'))}</string>
</dict>
</plist>
`;
}

function buildSystemdUserService(options: StartupServiceOptions = {}): string {
  const args = buildStartupArgs(options).map((arg) => `"${systemdEscapeArg(arg)}"`).join(' ');
  const envFilePath = getStartupEnvFilePath();
  return `[Unit]
Description=OhPiChamber web server
After=network-online.target

[Service]
Type=simple
EnvironmentFile=-${systemdEscapeArg(envFilePath)}
ExecStart="${systemdEscapeArg(process.execPath)}" ${args}
WorkingDirectory=${systemdUnitPath(os.homedir())}
Restart=always
RestartSec=5
# A graceful shutdown on SIGTERM exits 143; a stop is not a failure.
SuccessExitStatus=143

[Install]
WantedBy=default.target
`;
}

function runStartupCommand(command: string, args: string[], options: StartupCommandOptions = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
    timeout: options.timeout,
    windowsHide: true,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 && options.allowFailure !== true) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

function parseLingerState(stdout: string | null | undefined): boolean | null {
  if (!isString(stdout)) {
    return null;
  }
  const match = stdout.match(/^Linger=([A-Za-z]+)\s*$/m);
  if (!match?.[1]) {
    return null;
  }
  const value = match[1].toLowerCase();
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return null;
}

function getCurrentUsername(): string {
  try {
    const name = os.userInfo().username;
    if (isString(name) && name.length > 0) {
      return name;
    }
  } catch {
    void 0;
  }
  return process.env.USER || process.env.LOGNAME || '';
}

function getUserLingerEnabled(user: string): boolean | null {
  if (!user) {
    return null;
  }
  let result;
  try {
    result = runStartupCommand('loginctl', ['show-user', user, '-p', 'Linger'], { allowFailure: true });
  } catch {
    return null;
  }
  if (result.status !== 0) {
    return null;
  }
  return parseLingerState(result.stdout);
}

function getStartupStatus(): StartupStatus {
  const paths = getStartupServicePaths();
  if (!paths.servicePath) {
    return { supported: false, platform: paths.platform, enabled: false, servicePath: null };
  }
  if (paths.platform === 'windows') {
    const result = runStartupCommand('schtasks.exe', ['/Query', '/TN', STARTUP_SERVICE_ID], { allowFailure: true });
    return { supported: true, platform: paths.platform, enabled: result.status === 0, active: null, servicePath: paths.servicePath };
  }
  if (paths.platform === 'linux') {
    const enabledResult = runStartupCommand('systemctl', ['--user', 'is-enabled', 'ohpichamber.service'], { allowFailure: true });
    const activeResult = runStartupCommand('systemctl', ['--user', 'is-active', 'ohpichamber.service'], { allowFailure: true });
    const activeState = (activeResult.stdout || '').trim() || 'inactive';
    const lingerUser = getCurrentUsername();
    return {
      supported: true,
      platform: paths.platform,
      enabled: enabledResult.status === 0 || fs.existsSync(paths.servicePath),
      active: activeState === 'active',
      activeState,
      servicePath: paths.servicePath,
      lingerEnabled: getUserLingerEnabled(lingerUser),
      lingerUser: lingerUser || null,
    };
  }
  return {
    supported: true,
    platform: paths.platform,
    enabled: fs.existsSync(paths.servicePath),
    active: null,
    servicePath: paths.servicePath,
  };
}

function restartSystemdService(): void {
  runStartupCommand('systemctl', ['--user', 'restart', 'ohpichamber.service']);
}

function enableStartupService(options: StartupServiceOptions = {}): StartupStatus {
  const paths = getStartupServicePaths();
  if (!paths.servicePath) {
    throw new TunnelCliError(`Startup integration is not supported on ${paths.platform}.`, EXIT_CODE.USAGE_ERROR);
  }

  if (paths.platform === 'macos') {
    removeStartupEnvFile();
    fs.mkdirSync(path.dirname(paths.servicePath), { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(os.homedir(), 'Library', 'Logs', 'OhPiChamber'), { recursive: true, mode: 0o700 });
    fs.writeFileSync(paths.servicePath, buildMacosLaunchAgent(options), { mode: 0o600 });
    const uid = z.function().parse(process.getuid)();
    runStartupCommand('/bin/launchctl', ['bootout', `gui/${uid}`, paths.servicePath], { allowFailure: true });
    runStartupCommand('/bin/launchctl', ['bootstrap', `gui/${uid}`, paths.servicePath]);
    runStartupCommand('/bin/launchctl', ['kickstart', '-k', `gui/${uid}/${STARTUP_SERVICE_ID}`], { allowFailure: true });
    return getStartupStatus();
  }

  if (paths.platform === 'linux') {
    writeStartupEnvFile(options, { quoteValue: systemdEnvFileQuote });
    fs.mkdirSync(path.dirname(paths.servicePath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(paths.servicePath, buildSystemdUserService(options), { mode: 0o600 });
    runStartupCommand('systemctl', ['--user', 'daemon-reload']);
    runStartupCommand('systemctl', ['--user', 'enable', 'ohpichamber.service']);
    restartSystemdService();
    return getStartupStatus();
  }

  writeStartupEnvFile(options);
  const wrapperPath = writeWindowsStartupWrapper(options);
  const taskCommand = buildWindowsStartupTaskCommand(wrapperPath);
  runStartupCommand('schtasks.exe', [
    '/Create',
    '/TN', STARTUP_SERVICE_ID,
    '/SC', 'ONLOGON',
    '/RL', 'LIMITED',
    '/F',
    '/TR', taskCommand,
  ]);
  runStartupCommand('schtasks.exe', ['/Run', '/TN', STARTUP_SERVICE_ID], { allowFailure: true });
  return getStartupStatus();
}

function disableStartupService(): StartupStatus {
  const paths = getStartupServicePaths();
  if (!paths.servicePath) {
    throw new TunnelCliError(`Startup integration is not supported on ${paths.platform}.`, EXIT_CODE.USAGE_ERROR);
  }

  if (paths.platform === 'macos') {
    const uid = z.function().parse(process.getuid)();
    runStartupCommand('/bin/launchctl', ['bootout', `gui/${uid}`, paths.servicePath], { allowFailure: true });
    try {
      fs.unlinkSync(paths.servicePath);
    } catch {
      void 0;
    }
    return getStartupStatus();
  }

  if (paths.platform === 'linux') {
    runStartupCommand('systemctl', ['--user', 'disable', '--now', 'ohpichamber.service'], { allowFailure: true });
    try {
      fs.unlinkSync(paths.servicePath);
    } catch {
      void 0;
    }
    runStartupCommand('systemctl', ['--user', 'daemon-reload'], { allowFailure: true });
    return getStartupStatus();
  }

  runStartupCommand('schtasks.exe', ['/End', '/TN', STARTUP_SERVICE_ID], { allowFailure: true });
  runStartupCommand('schtasks.exe', ['/Delete', '/TN', STARTUP_SERVICE_ID, '/F'], { allowFailure: true });
  try {
    fs.unlinkSync(getWindowsStartupWrapperPath());
  } catch {
    void 0;
  }
  removeStartupEnvFile();
  return getStartupStatus();
}

export {
  stablePnpmEntrypoint,
  buildSystemdUserService,
  getStartupStatus,
  enableStartupService,
  disableStartupService,
  buildWindowsStartupTaskCommand,
};
