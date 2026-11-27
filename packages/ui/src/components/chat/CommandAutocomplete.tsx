import { useHeightMorph } from '@/lib/motion/useSizeMorph';
import type { ModelSelection } from '@openchamber/agent-contract';
import React from 'react';
import { cn } from '@/lib/utils';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useChatSessionSelection } from './chatColumnSession';
import { selectBuiltinCommandsForDirectory, selectCommandsForDirectory, useCommandsStore } from '@/stores/useCommandsStore';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { useI18n, type I18nKey } from '@/lib/i18n';
import { useUIStore } from '@/stores/useUIStore';
import { isVSCodeRuntime } from '@/lib/desktop';
import { useMobileAutocompleteMaxHeight } from './useMobileAutocompleteMaxHeight';
import { mergeCommandAutocompleteItems, rankCommandAutocompleteItems } from './commandAutocompleteItems';
import { useGuestCommands } from '@/hooks/useGuestSurfaces';
import { AutocompleteRowDetail } from './composer/ui/AutocompleteRowParts';
import { useAutocompleteSelectionScroll } from './composer/ui/useAutocompleteSelectionScroll';

// Skills are not here: they have their own `$` picker.
type CommandSource = 'openchamber' | 'native' | 'extension';

export interface CommandInfo {
  id: string;
  name: string;
  source: CommandSource;
  description?: string;
  searchAliases?: string[];
  modelSelection?: ModelSelection;
  isBuiltIn?: boolean;
  isOpenChamber?: boolean;
  scope?: string;
  /** Name of the extension that contributed the command; shown as its badge. */
  extensionName?: string;
}

// Every name the composer runs itself; an extension command with one of
// these names is dropped before it reaches the list.
const LOCAL_COMMAND_NAMES = [
  'init', 'review', 'undo', 'redo', 'timeline', 'compact', 'fork', 'btw', 'summary', 'workspace-review', 'handoff-review',
  'plan-feature', 'craft-goal', 'schedule-task', 'catch-up', 'debug', 'weigh', 'explore',
];
// Descriptions resolve through the dictionary so a locale switch re-renders
// every builtin command; `compact` already owns a key on the openchamber list.
const BUILTIN_COMMAND_DESCRIPTION_KEYS: Record<string, I18nKey> = {
  compact: 'chat.commandAutocomplete.command.compactDescription',
  shake: 'chat.commandAutocomplete.command.shakeDescription',
  todo: 'chat.commandAutocomplete.command.todoDescription',
  jobs: 'chat.commandAutocomplete.command.jobsDescription',
  usage: 'chat.commandAutocomplete.command.usageDescription',
  context: 'chat.commandAutocomplete.command.contextDescription',
  tools: 'chat.commandAutocomplete.command.toolsDescription',
  handoff: 'chat.commandAutocomplete.command.handoffDescription',
  retry: 'chat.commandAutocomplete.command.retryDescription',
  rename: 'chat.commandAutocomplete.command.renameDescription',
  effort: 'chat.commandAutocomplete.command.effortDescription',
  model: 'chat.commandAutocomplete.command.modelDescription',
  switch: 'chat.commandAutocomplete.command.switchDescription',
  fast: 'chat.commandAutocomplete.command.fastDescription',
  slow: 'chat.commandAutocomplete.command.slowDescription',
  prewalk: 'chat.commandAutocomplete.command.prewalkDescription',
  force: 'chat.commandAutocomplete.command.forceDescription',
  pin: 'chat.commandAutocomplete.command.pinDescription',
  fresh: 'chat.commandAutocomplete.command.freshDescription',
  clear: 'chat.commandAutocomplete.command.clearDescription',
  dirs: 'chat.commandAutocomplete.command.dirsDescription',
  session: 'chat.commandAutocomplete.command.sessionDescription',
  memory: 'chat.commandAutocomplete.command.memoryDescription',
};

export interface CommandAutocompleteHandle {
  handleKeyDown: (key: string) => void;
  isExactMatchHighlighted: () => boolean;
}

interface CommandAutocompleteProps {
  searchQuery: string;
  onCommandSelect: (command: CommandInfo) => void;
  onClose: () => void;
  style?: React.CSSProperties;
}

export const CommandAutocomplete = React.forwardRef<CommandAutocompleteHandle, CommandAutocompleteProps>(({
  searchQuery,
  onCommandSelect,
  onClose,
  style,
}, ref) => {
  const { t } = useI18n();
  const currentSessionId = useChatSessionSelection().sessionId;
  const hasSession = Boolean(currentSessionId);
  const hasNewSessionDraft = useSessionUIStore((state) => Boolean(state.newSessionDraft?.open));
  const canStartSessionCommand = hasSession || hasNewSessionDraft;
  const isMobile = useUIStore((state) => state.isMobile);
  const canUseReviewHandoffFlow = hasSession && !isMobile && !isVSCodeRuntime();

  // Commands belong to the directory the composer sends to — the session's
  // own directory, or the Chats root for a chat draft — not to the project
  // the app was on last.
  const effectiveDirectory = useEffectiveDirectory();
  const commandsWithMetadata = useCommandsStore((s) => selectCommandsForDirectory(s, effectiveDirectory));
  const builtinCommandNames = useCommandsStore((s) => selectBuiltinCommandsForDirectory(s, effectiveDirectory));
  const loadCommandsForDirectory = useCommandsStore((s) => s.loadCommands);
  const refreshCommands = React.useCallback(() => loadCommandsForDirectory(effectiveDirectory), [effectiveDirectory, loadCommandsForDirectory]);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const selectedIndexRef = React.useRef(0);
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const { listRef, onKeyboardNavigate } = useAutocompleteSelectionScroll(selectedIndex, itemRefs);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  useHeightMorph(containerRef);
  const mobileMaxHeight = useMobileAutocompleteMaxHeight(containerRef, style?.maxHeight === undefined);
  const ignoreClickRef = React.useRef(false);
  const pointerStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const pointerMovedRef = React.useRef(false);

  React.useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target || !containerRef.current) {
        return;
      }
      if (containerRef.current.contains(target)) {
        return;
      }
      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [onClose]);

  React.useEffect(() => {
    // Force refresh to get latest project context when mounting
    void refreshCommands();
  }, [refreshCommands]);

  const reservedCommandNames = React.useMemo(() => {
    const names = new Set<string>(LOCAL_COMMAND_NAMES);
    for (const name of builtinCommandNames) names.add(name);
    for (const command of commandsWithMetadata) names.add(command.name.toLowerCase());
    return names;
  }, [builtinCommandNames, commandsWithMetadata]);
  const guestCommands = useGuestCommands(reservedCommandNames);

  // The list depends on the registries, not on what is typed: it is built
  // once per registry change, and only the ranking follows the query.
  const allCommands = React.useMemo<CommandInfo[]>(() => {
    const customCommands: CommandInfo[] = commandsWithMetadata.map((cmd, index) => ({
      id: cmd.commandId ?? `cmd:${cmd.scope ?? 'global'}:${cmd.name}:${index}`,
      name: cmd.name,
      source: 'native',
      description: cmd.description,
      agentId: cmd.agentId,
      modelSelection: cmd.modelSelection,
      isBuiltIn: cmd.name === 'init' || cmd.name === 'review',
      scope: cmd.scope,
    }));

    const builtInCommands: CommandInfo[] = [
      ...(hasSession ? builtinCommandNames.map((name): CommandInfo => {
        const descriptionKey = BUILTIN_COMMAND_DESCRIPTION_KEYS[name];
        return {
          id: `builtin:${name}`,
          name,
          source: 'native',
          isBuiltIn: true,
          description: descriptionKey ? t(descriptionKey) : undefined,
        };
      }) : []),
      ...(hasSession
        ? [{ id: 'openchamber:init', name: 'init', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.initDescription'), isBuiltIn: true }]
        : []
      ),
      ...(hasSession  // Show when session exists, not when hasMessages
        ? [
          { id: 'openchamber:undo', name: 'undo', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.undoDescription'), isBuiltIn: true },
          { id: 'openchamber:redo', name: 'redo', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.redoDescription'), isBuiltIn: true },
          { id: 'openchamber:timeline', name: 'timeline', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.timelineDescription'), isBuiltIn: true },
        ]
        : []
      ),
      ...(hasSession && !builtinCommandNames.includes('btw')
        // `/btw` is an OMP built-in that the composer runs itself (BtwPanel),
        // so it carries the OMP badge like the other native commands. The
        // catalog list wins when the service publishes it.
        ? [{ id: 'native:btw', name: 'btw', source: 'native' as const, description: t('chat.commandAutocomplete.command.btwDescription'), isBuiltIn: true }]
        : []
      ),
      ...(hasSession
        ? [{ id: 'openchamber:fork', name: 'fork', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.forkDescription'), isOpenChamber: true }]
        : []
      ),
      ...(hasSession
        ? [{ id: 'openchamber:summary', name: 'summary', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.summaryDescription'), isOpenChamber: true }]
        : []
      ),
      ...(canStartSessionCommand
        ? [{ id: 'openchamber:workspace-review', name: 'workspace-review', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.workspaceReviewDescription'), isOpenChamber: true }]
        : []
      ),
      ...(canUseReviewHandoffFlow
        ? [{ id: 'openchamber:handoff-review', name: 'handoff-review', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.handoffReviewDescription'), isOpenChamber: true }]
        : []
      ),
      ...(canStartSessionCommand
        ? [{ id: 'openchamber:plan-feature', name: 'plan-feature', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.featurePlanDescription'), isOpenChamber: true }]
        : []
      ),
      ...(canStartSessionCommand
        ? [{ id: 'openchamber:craft-goal', name: 'craft-goal', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.craftGoalDescription'), isOpenChamber: true }]
        : []
      ),
      ...(canStartSessionCommand
        ? [{ id: 'openchamber:schedule-task', name: 'schedule-task', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.scheduleTaskDescription'), isOpenChamber: true }]
        : []
      ),
      ...(canStartSessionCommand
        ? [{ id: 'openchamber:catch-up', name: 'catch-up', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.catchUpDescription'), isOpenChamber: true }]
        : []
      ),
      ...(canStartSessionCommand
        ? [{ id: 'openchamber:debug', name: 'debug', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.debugDescription'), isOpenChamber: true }]
        : []
      ),
      ...(canStartSessionCommand
        ? [{ id: 'openchamber:weigh', name: 'weigh', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.weighDescription'), isOpenChamber: true }]
        : []
      ),
      ...(canStartSessionCommand
        ? [{ id: 'openchamber:explore', name: 'explore', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.exploreDescription'), isOpenChamber: true }]
        : []
      ),
    ];
    const extensionCommands: CommandInfo[] = guestCommands.map((entry) => ({
      id: `extension:${entry.guestId}:${entry.command.name}`,
      name: entry.command.name,
      source: 'extension',
      description: entry.command.description,
      extensionName: entry.guestName,
    }));
    return [
      ...mergeCommandAutocompleteItems(builtInCommands, customCommands),
      ...extensionCommands,
    ];
  }, [hasSession, canStartSessionCommand, canUseReviewHandoffFlow, commandsWithMetadata, builtinCommandNames, guestCommands, t]);
  const commands = React.useMemo(
    () => rankCommandAutocompleteItems(allCommands, searchQuery),
    [allCommands, searchQuery],
  );

  const [prevCommands, setPrevCommands] = React.useState(commands);
  if (prevCommands !== commands) {
    setPrevCommands(commands);
    setSelectedIndex(0);
  }

  React.useLayoutEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  React.useImperativeHandle(ref, () => ({
    handleKeyDown: (key: string) => {
      const total = commands.length;
      if (key === 'Escape') {
        onClose();
        return;
      }

      if (total === 0) {
        return;
      }

      if (key === 'ArrowDown') {
        onKeyboardNavigate();
        const next = ((selectedIndexRef.current % total) + total + 1) % total;
        selectedIndexRef.current = next;
        setSelectedIndex(next);
        return;
      }

      if (key === 'ArrowUp') {
        onKeyboardNavigate();
        const next = ((selectedIndexRef.current % total) + total - 1) % total;
        selectedIndexRef.current = next;
        setSelectedIndex(next);
        return;
      }

      if (key === 'Enter' || key === 'Tab') {
        const safeIndex = ((selectedIndexRef.current % total) + total) % total;
        const command = commands[safeIndex];
        if (command) {
          onCommandSelect(command);
        }
      }
    },
    isExactMatchHighlighted: () => {
      const total = commands.length;
      if (total === 0) return false;
      const safeIndex = ((selectedIndexRef.current % total) + total) % total;
      const highlighted = commands[safeIndex];
      if (!highlighted) return false;
      return highlighted.name.toLowerCase() === searchQuery.toLowerCase();
    },
  }), [commands, onClose, onCommandSelect, onKeyboardNavigate, searchQuery]);


  return (
    <div
      ref={containerRef}
      className="absolute z-[100] min-w-0 w-full max-w-[560px] max-h-64 oc-glass-popover oc-glass-floating rounded-xl bottom-full mb-2 inset-s-0 flex flex-col"
      style={mobileMaxHeight !== undefined ? { ...style, maxHeight: mobileMaxHeight } : style}
    >
      <ScrollableOverlay ref={listRef} preventOverscroll outerClassName="flex-1 min-h-0" className="p-1">
        <div>
          {commands.map((command, index) => {
            return (
              <div
                key={command.id}
                ref={(el) => { itemRefs.current[index] = el; }}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-lg typography-ui-label",
                  index === selectedIndex && "bg-interactive-selection"
                )}
                // Block the focus transfer the tap would perform: the textarea
                // must stay focused so selecting a command doesn't dismiss the
                // soft keyboard (the blur raced the keyboard-hide trigger and
                // won against the deferred refocus).
                onMouseDown={(event) => event.preventDefault()}
                onPointerDown={(event) => {
                  if (event.pointerType !== 'touch') {
                    return;
                  }
                  pointerStartRef.current = { x: event.clientX, y: event.clientY };
                  pointerMovedRef.current = false;
                }}
                onPointerMove={(event) => {
                  if (event.pointerType !== 'touch' || !pointerStartRef.current) {
                    return;
                  }
                  const dx = event.clientX - pointerStartRef.current.x;
                  const dy = event.clientY - pointerStartRef.current.y;
                  if (Math.hypot(dx, dy) > 6) {
                    pointerMovedRef.current = true;
                  }
                }}
                onPointerUp={(event) => {
                  if (event.pointerType !== 'touch') {
                    return;
                  }
                  const didMove = pointerMovedRef.current;
                  pointerStartRef.current = null;
                  pointerMovedRef.current = false;
                  if (didMove) {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  ignoreClickRef.current = true;
                  onCommandSelect(command);
                }}
                onPointerCancel={() => {
                  pointerStartRef.current = null;
                  pointerMovedRef.current = false;
                }}
                onClick={() => {
                  if (ignoreClickRef.current) {
                    ignoreClickRef.current = false;
                    return;
                  }
                  onCommandSelect(command);
                }}
                onMouseMove={() => {
                  setSelectedIndex(index);
                }}
              >
                <span className="max-w-[60%] shrink-0 truncate font-medium">/{command.name}</span>
                <AutocompleteRowDetail
                  scope={command.isOpenChamber ? 'openchamber' : command.isBuiltIn ? 'omp' : (command.scope === 'project' || command.scope === 'workspace') ? 'project' : command.scope ? 'user' : null}
                  extension={command.extensionName}
                  description={command.description}
                />
              </div>
            );
          })}
          {commands.length === 0 && (
            <div className="px-2 py-1.5 typography-ui-label text-muted-foreground">
              {t('chat.commandAutocomplete.empty')}
            </div>
          )}
        </div>
      </ScrollableOverlay>
      {!isMobile && (
        <div className="px-3 py-1.5 border-t typography-meta text-muted-foreground">
          {t('chat.autocomplete.keyboardHint')}
        </div>
      )}
    </div>
  );
});

CommandAutocomplete.displayName = 'CommandAutocomplete';
