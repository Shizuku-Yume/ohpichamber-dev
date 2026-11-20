import React from 'react';
import { useI18n } from '@/lib/i18n';
import { Switch } from '@/components/ui/switch';
import { getMcpServerStatus, isMcpServerConnected, useMcpStore } from '@/stores/useMcpStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { McpIcon } from '@/components/icons/McpIcon';
import { runBackgroundNetworkTask } from '@/lib/background-network';
import { toast } from 'sonner';
import { WorkStatusCollapsibleSection, WorkStatusRow, WorkStatusRowAction } from './WorkStatusPrimitives';
import { useReportWorkStatusPresence } from './presenceContext';

type Props = {
  directory: string | null;
};

const MCP_STATUS_MAX_AGE_MS = 60_000;

/**
 * MCP servers with their connection switches, reusing the dropdown's own
 * connect/disconnect actions.
 */
export const WorkStatusMcpSection: React.FC<Props> = ({ directory }) => {
  const { t } = useI18n();

  const mcpStatus = useMcpStore(
    React.useCallback((state) => state.getStatusForDirectory(directory), [directory]),
  );
  const mcpPhase = useMcpStore(
    React.useCallback((state) => state.getPhaseForDirectory(directory), [directory]),
  );
  const ensureMcpFresh = useMcpStore((state) => state.ensureFresh);
  const connect = useMcpStore((state) => state.connect);
  const disconnect = useMcpStore((state) => state.disconnect);
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


  const handleToggle = React.useCallback(async (name: string, next: boolean) => {

    setBusyServer(name);
    try {
      if (next) await connect(name, directory);
      else await disconnect(name, directory);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('mcpDropdown.status.unknownError'));
    } finally {
      setBusyServer((current) => (current === name ? null : current));
    }
  }, [connect, disconnect, directory, t]);

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
      iconNode={<McpIcon className="size-4 shrink-0 text-muted-foreground" />}
      summary={`${mcpConnected}/${mcpServers.length}`}
    >
      {mcpServers.map(([name, entry]) => {
        const connected = entry.configuration.enabled;
        const busy = busyServer === name;
        const failed = getMcpServerStatus(entry) === 'unavailable';
        return (
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
        );
      })}
    </WorkStatusCollapsibleSection>
  );
};
