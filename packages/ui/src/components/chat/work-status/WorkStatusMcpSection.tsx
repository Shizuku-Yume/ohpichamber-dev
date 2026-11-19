import React from 'react';
import { useI18n } from '@/lib/i18n';
import { Switch } from '@/components/ui/switch';
import { getMcpServerStatus, isMcpServerConnected, useMcpStore } from '@/stores/useMcpStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import { McpIcon } from '@/components/icons/McpIcon';
import { runBackgroundNetworkTask } from '@/lib/background-network';
import { toast } from 'sonner';
import { WorkStatusCollapsibleSection, WorkStatusRow, WorkStatusRowAction } from './WorkStatusPrimitives';
import { useReportWorkStatusPresence } from './presenceContext';
<<<<<<< HEAD
||||||| bc50ba56aa
import { WorkStatusTouchContext } from './touchContext';
import { useMcpDirectory } from '@/components/mcp/useMcpDirectory';
=======
import { WorkStatusTouchContext } from './touchContext';
import { useMcpDirectory } from '@/components/mcp/useMcpDirectory';
import { McpOAuthSignIn } from '@/components/sections/mcp/McpOAuthSignIn';
>>>>>>> upstream/main

type Props = {
  directory: string | null;
};

const MCP_STATUS_MAX_AGE_MS = 60_000;

<<<<<<< HEAD
/**
 * MCP servers with their connection switches, reusing the dropdown's own
 * connect/disconnect actions.
 */
export const WorkStatusMcpSection: React.FC<Props> = ({ directory }) => {
||||||| bc50ba56aa
/**
 * MCP servers with their on/off switches, reusing the dropdown's own action.
 */
export const WorkStatusMcpSection: React.FC<Props> = ({ sessionId, directory: selectedDirectory }) => {
  const touch = React.useContext(WorkStatusTouchContext);
=======
type SignInRequest = { server: string; directory: string; run: number };

export const WorkStatusMcpSection: React.FC<Props> = ({ sessionId, directory: selectedDirectory }) => {
  const touch = React.useContext(WorkStatusTouchContext);
>>>>>>> upstream/main
  const { t } = useI18n();

  const mcpStatus = useMcpStore(
    React.useCallback((state) => state.getStatusForDirectory(directory), [directory]),
  );
  const mcpPhase = useMcpStore(
    React.useCallback((state) => state.getPhaseForDirectory(directory), [directory]),
  );
  const ensureMcpFresh = useMcpStore((state) => state.ensureFresh);
<<<<<<< HEAD
  const connect = useMcpStore((state) => state.connect);
  const disconnect = useMcpStore((state) => state.disconnect);
||||||| bc50ba56aa
  const setEnabled = useMcpStore((state) => state.setEnabled);
=======
  const setEnabled = useMcpStore((state) => state.setEnabled);
  const connect = useMcpStore((state) => state.connect);
  const expanded = useUIStore((state) => state.workStatusExpandedSections.mcp === true);
>>>>>>> upstream/main
  const isConnected = useConfigStore((state) => state.isConnected);
  const [busyServer, setBusyServer] = React.useState<string | null>(null);

  React.useEffect(() => {
    void runBackgroundNetworkTask(() => ensureMcpFresh({ directory, silent: true, maxAgeMs: MCP_STATUS_MAX_AGE_MS }));
  }, [directory, ensureMcpFresh, isConnected]);

  const mcpServers = React.useMemo(
    () => Object.entries(mcpStatus ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    [mcpStatus],
  );
  const mcpConnected = React.useMemo(
    () => mcpServers.filter(([, entry]) => isMcpServerConnected(entry)).length,
    [mcpServers],
  );

<<<<<<< HEAD
||||||| bc50ba56aa
  // A server waiting on authorization cannot be reconnected into working
  // order: `connect` just repeats the attempt that produced `needs_auth`.
  // OpenCode v2 owns the OAuth flow now, so the panel says what is missing
  // instead of pretending it can start it.
  const reportNeedsAuth = React.useCallback(() => {
    toast.message(t('chat.workStatus.mcp.needsAuthHint'));
  }, [t]);
=======
  const [signIn, setSignIn] = React.useState<SignInRequest | null>(null);
  const signInRunRef = React.useRef(0);
  const startSignIn = React.useCallback((name: string) => {
    if (!directory) return;
    signInRunRef.current += 1;
    setSignIn({ server: name, directory, run: signInRunRef.current });
  }, [directory]);

  const [activeSignInRun, setActiveSignInRun] = React.useState<number | null>(null);
  const signInRun = signIn?.run ?? null;
  const handleSignInActiveChange = React.useCallback((active: boolean) => {
    if (signInRun === null) return;
    setActiveSignInRun((current) => (active ? signInRun : current === signInRun ? null : current));
  }, [signInRun]);

  const liveSignIn = signIn
    && expanded
    && signIn.directory === directory
    && (activeSignInRun === signIn.run || mcpStatus?.[signIn.server]?.status.status === 'needs_auth')
    ? signIn
    : null;
  React.useEffect(() => {
    if (signIn && !liveSignIn) setSignIn(null);
  }, [liveSignIn, signIn]);

  const handleSignedIn = React.useCallback(async (request: SignInRequest) => {
    setSignIn((current) => (current?.run === request.run ? null : current));
    setBusyServer(request.server);
    try {
      await connect(request.server, request.directory);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.mcp.page.toast.connectionFailed'));
    } finally {
      setBusyServer((current) => (current === request.server ? null : current));
    }
  }, [connect, t]);

  const handleSignInUnavailable = React.useCallback((request: SignInRequest) => {
    setSignIn((current) => (current?.run === request.run ? null : current));
    toast.message(t('chat.workStatus.mcp.needsAuthHint'));
  }, [t]);
>>>>>>> upstream/main

  const handleToggle = React.useCallback(async (name: string, next: boolean) => {
<<<<<<< HEAD
||||||| bc50ba56aa
    if (!directory) return;
    // Switching on a server that is waiting for sign-in cannot connect: it only
    // repeats the attempt that produced `needs_auth`. Authorization is the real
    // action, and the dropdown already routes the same switch that way — the
    // two surfaces must not disagree about what this control does.
    const status = (mcpStatus ?? {})[name]?.status.status;
    if (next && status === 'needs_auth') {
      reportNeedsAuth();
      return;
    }
=======
    if (!directory) return;
    const status = (mcpStatus ?? {})[name]?.status.status;
    if (next && status === 'needs_auth') {
      startSignIn(name);
      return;
    }
>>>>>>> upstream/main

    setBusyServer(name);
    try {
<<<<<<< HEAD
      if (next) await connect(name, directory);
      else await disconnect(name, directory);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('mcpDropdown.status.unknownError'));
||||||| bc50ba56aa
      await setEnabled(name, next, directory);
=======
      await setEnabled(name, next, directory);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errorBoundary.state.unknownError'));
>>>>>>> upstream/main
    } finally {
      setBusyServer((current) => (current === name ? null : current));
    }
<<<<<<< HEAD
  }, [connect, disconnect, directory, t]);
||||||| bc50ba56aa
  }, [directory, mcpStatus, reportNeedsAuth, setEnabled]);
=======
  }, [directory, mcpStatus, setEnabled, startSignIn, t]);
>>>>>>> upstream/main

  useReportWorkStatusPresence('mcp', mcpServers.length > 0);

  // Unread is not "no MCP servers configured": the read for this directory has
  // not answered, so the panel says that rather than showing nothing.
  if (mcpServers.length === 0) {
    return mcpPhase === 'unknown'
      ? <p className="typography-meta text-muted-foreground">{t('chat.workStatus.mcp.unknown')}</p>
      : null;
  }

  return (
    <WorkStatusCollapsibleSection
      id="mcp"
      title={t('chat.workStatus.section.mcp')}
<<<<<<< HEAD
      iconNode={<McpIcon className="size-4 shrink-0 text-muted-foreground" />}
||||||| bc50ba56aa
      iconNode={<McpIcon className="size-3.5 shrink-0 text-muted-foreground" />}
=======
      iconNode={<McpIcon className="size-[13px] shrink-0 text-muted-foreground" />}
>>>>>>> upstream/main
      summary={`${mcpConnected}/${mcpServers.length}`}
    >
      {mcpServers.map(([name, entry]) => {
        const connected = entry.configuration.enabled;
        const busy = busyServer === name;
<<<<<<< HEAD
        const failed = getMcpServerStatus(entry) === 'unavailable';
||||||| bc50ba56aa
        const needsAuth = entry?.status.status === 'needs_auth';
        const failed = entry?.status.status === 'failed';
        const toggle = (
          <Switch
            checked={connected}
            disabled={busy}
            loading={busy}
            className={cn('disabled:opacity-100 data-[checked]:bg-status-info', !touch && 'scale-75')}
            aria-label={t('chat.workStatus.mcp.toggle', { name })}
            onCheckedChange={(checked) => { void handleToggle(name, checked); }}
          />
        );
        // A server asking for sign-in or reporting a failure is asking to be
        // acted on; the state is the affordance, so it is the button.
        const stateAction = needsAuth ? (
          <WorkStatusRowAction
            tone="warning"
            disabled={busy}
            onClick={reportNeedsAuth}
          >
            {t('chat.workStatus.mcp.needsAuth')}
          </WorkStatusRowAction>
        ) : failed ? (
          <WorkStatusRowAction
            tone="error"
            disabled={busy}
            onClick={() => { void handleToggle(name, true); }}
          >
            {t('chat.workStatus.mcp.failed')}
          </WorkStatusRowAction>
        ) : null;
=======
        const needsAuth = entry?.status.status === 'needs_auth';
        const failed = entry?.status.status === 'failed';
        const toggle = (
          <Switch
            checked={connected}
            disabled={busy}
            loading={busy}
            className={cn('disabled:opacity-100 data-[checked]:bg-status-info', !touch && 'scale-75')}
            aria-label={t('chat.workStatus.mcp.toggle', { name })}
            onCheckedChange={(checked) => { void handleToggle(name, checked); }}
          />
        );
        const stateAction = needsAuth ? (
          <WorkStatusRowAction
            tone="warning"
            disabled={busy}
            onClick={() => startSignIn(name)}
          >
            {t('chat.workStatus.mcp.needsAuth')}
          </WorkStatusRowAction>
        ) : failed ? (
          <WorkStatusRowAction
            tone="error"
            disabled={busy}
            onClick={() => { void handleToggle(name, true); }}
          >
            {t('chat.workStatus.mcp.failed')}
          </WorkStatusRowAction>
        ) : null;
        const rowSignIn = liveSignIn?.server === name ? liveSignIn : null;
>>>>>>> upstream/main
        return (
<<<<<<< HEAD
          <WorkStatusRow
            key={name}
            leading={(
              <Switch
                checked={connected}
                disabled={busy}
                loading={busy}
                className="scale-75 disabled:opacity-100 data-[checked]:bg-status-info"
                aria-label={t('chat.workStatus.mcp.toggle', { name })}
                onCheckedChange={(checked) => { void handleToggle(name, checked); }}
              />
            )}
            label={name}
            muted={!connected}
            value={failed ? (
              <WorkStatusRowAction
                tone="error"
                disabled={busy}
                onClick={() => { void handleToggle(name, true); }}
              >
                {t('chat.workStatus.mcp.failed')}
              </WorkStatusRowAction>
            ) : undefined}
          />
||||||| bc50ba56aa
          <WorkStatusRow
            key={name}
            // On the phone a switch goes on the row's end, full size, as
            // settings rows put it; the icon column is too narrow for one.
            leading={touch ? undefined : toggle}
            label={name}
            labelDir="auto"
            muted={!connected}
            value={touch ? <>{stateAction}{toggle}</> : stateAction ?? undefined}
          />
=======
          <React.Fragment key={name}>
            <WorkStatusRow
              leading={touch ? undefined : toggle}
              label={name}
              labelDir="auto"
              muted={!connected}
              value={touch ? <>{stateAction}{toggle}</> : stateAction ?? undefined}
            />
            {rowSignIn ? (
              <div className={touch ? 'mb-2 ms-[2.625rem] me-2.5' : 'mx-1 mb-1'}>
                <McpOAuthSignIn
                  key={rowSignIn.run}
                  serverName={name}
                  directory={rowSignIn.directory}
                  autoStart
                  showStartButton={false}
                  connectLabel={t('chat.workStatus.mcp.needsAuth')}
                  onConnected={() => handleSignedIn(rowSignIn)}
                  onUnavailable={() => handleSignInUnavailable(rowSignIn)}
                  onActiveChange={handleSignInActiveChange}
                />
              </div>
            ) : null}
          </React.Fragment>
>>>>>>> upstream/main
        );
      })}
    </WorkStatusCollapsibleSection>
  );
};
