import React from 'react';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { HoverTooltip } from '@/components/ui/row-tooltip';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/components/ui';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { openMobileWorkspace } from '@/lib/mobileWorkspaceTabs';
import { useChatSurfaceMode } from '../useChatSurfaceMode';
import { replyCommandShell, ReplyTerminalUnsupportedError, startReplyTerminal } from './replyTerminal';

export function ReplyCommandCode({ sessionId, directory, language, source }: { sessionId: string; directory: string; language: string; source: string }) {
  const { t } = useI18n();
  const { terminal } = useRuntimeAPIs();
  const { currentTheme } = useThemeSystem();
  const surface = useChatSurfaceMode();
  const [starting, setStarting] = React.useState(false);
  const pending = React.useRef(false);
  const available = surface !== 'mini-chat' && surface !== 'peek';

  const start = async () => {
    if (pending.current || !available || !directory.trim() || !source.trim()) return;
    pending.current = true;
    setStarting(true);
    const runtimeKey = getRuntimeKey();
    const isCurrent = () => runtimeKey === getRuntimeKey();
    const settings = useUIStore.getState();
    const conversation = sessionId;
    try {
      const tabId = await startReplyTerminal({
        terminal,
        directory,
        command: source,
        shell: replyCommandShell(language, settings.terminalShell),
        loginShells: settings.terminalLoginShells,
        createOptions: {
          cols: 80,
          rows: 24,
          themeMode: currentTheme.metadata.variant === 'light' ? 'light' : 'dark',
          terminalBackground: currentTheme.colors.surface.background,
          terminalForeground: currentTheme.colors.syntax.base.foreground,
        },
        isCurrent,
      });
      if (tabId && useSessionUIStore.getState().currentSessionId === conversation && !openMobileWorkspace({ tab: 'terminal' })) {
        useUIStore.getState().openContextPanelTab(directory, { mode: 'terminal' });
      }
    } catch (error) {
      if (isCurrent()) {
        toast.error(t('terminalView.error.startSessionFailed'), {
          description: error instanceof Error && !(error instanceof ReplyTerminalUnsupportedError) ? error.message : undefined,
        });
      }
    } finally {
      pending.current = false;
      setStarting(false);
    }
  };

  if (!available) return null;
  const label = t('markdownRenderer.code.actions.runInTerminalTitle');
  return (
    <HoverTooltip label={label}>
      <Button variant="ghost" size="xs" data-export-ignore data-reply-command-terminal
        disabled={starting} aria-label={label} onClick={() => void start()}>
        {starting ? <Spinner className="size-3.5" /> : <Icon name="terminal" className="size-3.5" />}
      </Button>
    </HoverTooltip>
  );
}
