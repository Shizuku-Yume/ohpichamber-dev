import { canonicalClient } from '@/api/canonicalClient';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { getSyncSessions } from '@/sync/sync-refs';
import { useUIStore } from '@/stores/useUIStore';
import { getRuntimeUrlResolver } from './runtime-url';
import { hostFilesystem } from '@/lib/host-filesystem';
import { runtimeFetch } from './runtime-fetch';
import { getRecentSendFailures } from '@/sync/send-failure-log';
import { getRecentSessionErrors } from '@/sync/session-error-log';
import { resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';

declare const __APP_VERSION__: string | undefined;

const RECENT_RECORD_LINES = 8;

const getCurrentDirectory = (): string => {
  const currentSessionId = useSessionUIStore.getState().currentSessionId;
  if (!currentSessionId) return '';
  const session = getSyncSessions().find((item) => item.sessionId === currentSessionId);
  return session ? resolveGlobalSessionDirectory(session) ?? '' : '';
};

const formatIso = (timestamp: number | null | undefined): string => {
  if (!timestamp || !Number.isFinite(timestamp)) return '(n/a)';
  try {
    return new Date(timestamp).toISOString();
  } catch {
    return '(invalid)';
  }
};

const probeHostHealth = async (): Promise<{ status: number | null; error: string | null }> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await runtimeFetch('/health', { signal: controller.signal, cache: 'no-store' });
    return { status: response.status, error: null };
  } catch (error) {
    return { status: null, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
};

export const buildRuntimeStatusReport = async (): Promise<string> => {
  const now = new Date();
  const appVersion = __APP_VERSION__ || '(unknown)';
  const platform = navigator.userAgent;
  const directory = getCurrentDirectory();
  const eventStreamStatus = useUIStore.getState().eventStreamStatus;
  const origin = window.location.origin;
  const apiBase = getRuntimeUrlResolver().api('/api/');
  const [health, readiness, hostHome] = await Promise.all([
    probeHostHealth(),
    canonicalClient.checkReady().then((ready) => ({ ready, error: null }))
      .catch(() => ({ ready: false, error: 'readiness request failed' })),
    hostFilesystem.getSystemInfo()
      .then((info) => (info.homeDirectory && info.homeDirectory !== '/' ? info.homeDirectory : ''))
      .catch(() => ''),
  ]);

  const lines = [
    `Time: ${now.toISOString()}`,
    `OpenChamber version: ${appVersion}`,
    `Runtime: ${origin || '(unknown)'} (api=${apiBase || '(unknown)'})`,
    `Host health: ${health.status === null ? `unavailable (${health.error ?? 'no response'})` : `HTTP ${health.status}`}`,
    `Agent Service readiness: ${readiness.error ? `unavailable (${readiness.error})` : readiness.ready ? 'ready' : 'not ready'}`,
    `Event stream: ${eventStreamStatus}`,
    `Directory: ${directory || '(none)'}`,
    `Platform: ${platform}`,
  ];

  const sessionErrors = getRecentSessionErrors();
  lines.push('');
  lines.push(`Recent session errors: ${sessionErrors.length === 0 ? '(none this app session)' : ''}`.trimEnd());
  for (const record of sessionErrors.slice(0, RECENT_RECORD_LINES)) {
    const detail = record.message ?? '(no message)';
    lines.push(`- ${formatIso(record.at)} session=${record.sessionId.slice(0, 16)} ${record.name ? `${record.name}: ` : ''}${detail}`);
  }

  const sendFailures = getRecentSendFailures();
  lines.push('');
  lines.push(`Recent rejected sends: ${sendFailures.length === 0 ? '(none this app session)' : ''}`.trimEnd());
  for (const record of sendFailures.slice(0, RECENT_RECORD_LINES)) {
    lines.push(`- ${formatIso(record.at)} session=${record.sessionId.slice(0, 16)} status=${record.status ?? 'transport'}${record.ambiguous ? ' ambiguous' : ''} ${record.reason}`);
  }

  lines.push('');
  lines.push('Log files:');
  if (origin.startsWith('openchamber-ui://')) {
    const isWindows = /Windows NT/.test(platform);
    const isMacDesktop = /Mac OS X|Macintosh/.test(platform);
    lines.push(`- OpenChamber desktop: ${isWindows
      ? '%APPDATA%\\OpenChamber\\logs\\main.log'
      : isMacDesktop
        ? '~/Library/Logs/OpenChamber/main.log'
        : '~/.config/OpenChamber/logs/main.log'}`);
  } else {
    lines.push(`- Host console: ${hostHome ? `${hostHome}/.config/openchamber` : '(server log output)'}`);
  }

  lines.push('');
  lines.push(`Generated: ${formatIso(Date.now())}`);
  return lines.join('\n');
};

export const showRuntimeStatus = async (): Promise<void> => {
  const text = await buildRuntimeStatusReport();
  const ui = useUIStore.getState();
  ui.setRuntimeStatusText(text);
  ui.setRuntimeStatusDialogOpen(true);
};
