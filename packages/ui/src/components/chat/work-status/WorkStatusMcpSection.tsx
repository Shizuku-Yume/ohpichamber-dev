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
 * MCP servers with their on/off switches, reusing the dropdown's own action.
 */
export const WorkStatusMcpSection: React.FC<Props> = ({ directory }) => {
  const { t } = useI18n();

  const mcpStatus = useMcpStore(
    React.useCallback((state) => state.getStatusForDirectory(directory), [directory]),
  );
  const ensureMcpFresh = useMcpStore((state) => state.ensureFresh);
  const setEnabled = useMcpStore((state) => state.setEnabled);
  const isConnected = useConfigStore((state) => state.isConnected);
  const [busyServer, setBusyServer] = React.useState<string | null>(null);

  // The panel must not depend on the header dropdown having been mounted or
  // opened to know its MCP servers. Silent and background-gated, so it cannot
  // compete with chat bootstrap traffic for sockets. The section remounts on
  // every session switch, so it only asks for a status that is missing or
  // older than a minute; connect/disconnect/auth refresh on their own.
  // `isConnected` is a dependency, not a gate: MCP status is cached by
  // directory alone and dropped on an instance switch, and two instances can
  // hold the same project path — so the switch itself has to trigger the ask.
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
<<<<<<< HEAD
      if (next) await connect(name, directory);
      else await disconnect(name, directory);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('mcpDropdown.status.unknownError'));
    } finally {
      setBusyServer((current) => (current === name ? null : current));
    }
  }, [connect, disconnect, directory, t]);
=======
      await setEnabled(name, next, directory);
    } finally {
      setBusyServer((current) => (current === name ? null : current));
    }
  }, [directory, mcpStatus, reportNeedsAuth, setEnabled]);
>>>>>>> bc50ba56a

  useReportWorkStatusPresence('mcp', mcpServers.length > 0);

  if (mcpServers.length === 0) return null;

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
            labelDir="auto"
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
