import React from 'react';
import { ScrollShadow, ScrollShadowBands } from '@/components/ui/ScrollShadow';
import { hasReceivedPages, useReceivedPages } from '@/components/chat/sharePages/received/receivedPagesStore';
import { TooltipLabelWithShortcut } from '@/components/ui/action-toolbar';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Icon } from '@/components/icon/Icon';
<<<<<<< HEAD
import { DiffViewIcon } from '@/components/icons/DiffIcon';
||||||| bc50ba56aa
import type { IconName } from '@/components/icon/icons';
import { DiffViewIcon } from '@/components/icons/DiffIcon';
=======
import type { IconName } from '@/components/icon/icons';
>>>>>>> upstream/main
import { GuestIcon } from '@/components/layout/GuestRailIcon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { useDeviceInfo } from '@/lib/device';
import { useI18n } from '@/lib/i18n';
import {
  contextSurfaceGroup,
  getVisibleContextRailSurfaces,
  sortContextSurfaces,
  type ContextSurfaceDescriptor,
} from '@/lib/surfaces/registry';
import {
  formatShortcutForDisplay,
  getEffectiveShortcutCombo,
  getEffectiveShortcutPrefix,
  isShortcutPrefixHeld,
  UNASSIGNED_SHORTCUT,
} from '@/lib/shortcuts';
import { cn } from '@/lib/utils';
import { useGitStatus } from '@/stores/useGitStore';
import { useSourceControlAuthEntry, useSourceControlAuthStore } from '@/stores/useSourceControlAuthStore';
import { GITHUB_SOURCE_CONTROL_IDENTITY } from '@/lib/source-control/identity';
import { useRepositoryReferenceProvider } from '@/components/references/referenceSources';
import { normalizeContextPanelDirectoryKey, useUIStore } from '@/stores/useUIStore';
import { useGuestSurfaces } from '@/hooks/useGuestSurfaces';
import { useGuestBadgeStore } from '@/lib/guests/badge-store';
import { useGuestListeningStore } from '@/lib/guests/microphone';
import { isPluginContextPanelMode, pluginIdFromMode } from '@/lib/surfaces/modes';
import { useWorkflowsSurfaceShown } from '@/lib/workflows/panel';
import { ContextRailSurfacesDialog } from './ContextRailSurfacesDialog';
import { shownContextModes, zoneOfMode } from '@/lib/workspace/zones';
import { ContextRailTooltipDetails } from './ContextRailUsage';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import { ZoneMoveMenuItems } from './ZoneMoveMenuItems';
import { changeRequestCopy } from '@/lib/source-control/changeRequestCopy';
import { useChangeRequestTerm } from '@/lib/source-control/providers/registry';
import { startZoneDragGesture, type ZoneDragGesture } from './zoneDrag';

const RAIL_TOOLTIP_DELAY_MS = 150;
const RAIL_SCROLL_FADE_PX = 24;
const RAIL_NUMBER_HOLD_DELAY_MS = 500;
const EMPTY_TABS: never[] = [];

type RailItemProps = {
  surface: ContextSurfaceDescriptor;
  isActive: boolean;
  showActivityDot: boolean;
  label: string;
  description: string;
  badgeCount?: number | null;
  badgeAriaLabel?: string | null;
  badgeDescription?: string | null;
  listening?: boolean;
  orderNumber?: number | null;
  showOrderNumber?: boolean;
  onSelect: (surface: ContextSurfaceDescriptor) => void;
};

const ContextPanelRailItem: React.FC<RailItemProps> = ({
  surface,
  isActive,
  showActivityDot,
  label,
  description,
  badgeCount,
  badgeAriaLabel,
  badgeDescription,
  listening = false,
  orderNumber,
  showOrderNumber,
  onSelect,
}) => {
  const shortcutOverrides = useUIStore((state) => state.shortcutOverrides);
  const surfacePrefix = getEffectiveShortcutPrefix('switch_context_surface', shortcutOverrides);
  const surfaceShortcut = surfacePrefix && surfacePrefix !== UNASSIGNED_SHORTCUT && orderNumber != null && orderNumber <= 10
    ? formatShortcutForDisplay(`${surfacePrefix}+${orderNumber === 10 ? '0' : orderNumber}`)
    : undefined;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: surface.id,
  });

  const hasBadge = badgeCount != null && badgeCount > 0;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-10 opacity-70')}
    >
    <ContextMenu>
    <ContextMenuTrigger render={<div />}>
      <Tooltip delayDuration={RAIL_TOOLTIP_DELAY_MS}>
        <TooltipTrigger asChild>
          <button
            type="button"
            {...attributes}
            {...listeners}
            onClick={() => onSelect(surface)}
            aria-label={badgeAriaLabel ?? label}
            aria-pressed={isActive}
            data-context-surface={surface.id}
            className={cn(
              'flex h-7 w-7 touch-none select-none items-center justify-center rounded-md transition-colors',
              isActive
                ? 'oc-selected text-interactive-selection-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <GuestIcon
              icon={surface.icon}
              iconSrc={surface.iconSrc}
              className="h-[17px] w-[17px]"
            />
            {showOrderNumber && orderNumber != null ? (
              <span
                aria-hidden="true"
                className="absolute inset-e-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-surface-muted px-1 text-[0.625rem] font-medium leading-none text-muted-foreground"
              >
                {orderNumber === 10 ? '0' : orderNumber}
              </span>
            ) : listening ? (
              <span
                aria-hidden="true"
                className="absolute inset-e-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--status-error)]"
              />
            ) : hasBadge ? (
              <span
                aria-hidden="true"
                className="absolute inset-e-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--status-info)]"
              />
            ) : showActivityDot ? (
              <span
                aria-hidden="true"
                className="absolute inset-e-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--status-info)]"
              />
            ) : null}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={8} className="max-w-72 break-words">
          <div className="flex flex-col gap-0.5">
            <TooltipLabelWithShortcut label={label} shortcut={surface.id === 'terminal' ? formatShortcutForDisplay(getEffectiveShortcutCombo('toggle_terminal', shortcutOverrides), '') : surfaceShortcut} />
            <span className="typography-micro text-muted-foreground">{description}</span>
            {badgeDescription ? (
              <span className="typography-micro text-muted-foreground">{badgeDescription}</span>
            ) : null}
            {surface.id === 'context' ? <ContextRailTooltipDetails /> : null}
          </div>
        </TooltipContent>
      </Tooltip>
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ZoneMoveMenuItems mode={surface.mode} />
    </ContextMenuContent>
    </ContextMenu>
    </div>
  );
};

<<<<<<< HEAD
||||||| bc50ba56aa
// The Tracker wears the project's host: its provider's sprite icon, else the
// mark it serves as an icon URL. With no host it holds tracker items and the like.
type RailIcon = { icon: IconName; iconSrc?: string };

const trackerRailIcon = (descriptor: SourceControlProviderDescriptor | null): RailIcon => {
  if (!descriptor) return { icon: 'ticket-2' };
  const sprite = providerSpriteName(descriptor, 'line');
  return sprite ? { icon: sprite } : { icon: PROVIDER_FALLBACK_ICON, iconSrc: providerIconSrc(descriptor) };
};

=======
type RailIcon = { icon: IconName; iconSrc?: string };

const trackerRailIcon = (descriptor: SourceControlProviderDescriptor | null): RailIcon => {
  if (!descriptor) return { icon: 'ticket-2' };
  const sprite = providerSpriteName(descriptor, 'line');
  return sprite ? { icon: sprite } : { icon: PROVIDER_FALLBACK_ICON, iconSrc: providerIconSrc(descriptor) };
};

>>>>>>> upstream/main
export const ContextPanelRail: React.FC = () => {
  const { t } = useI18n();
  const effectiveDirectory = useEffectiveDirectory();
  const directoryKey = effectiveDirectory ? normalizeContextPanelDirectoryKey(effectiveDirectory) : '';

  const panelState = useUIStore((state) => (directoryKey ? state.contextPanelByDirectory[directoryKey] : undefined));
  const workStatusPanelVisible = useUIStore((state) => state.workStatusPanelVisible);
  const contextRailOrder = useUIStore((state) => state.contextRailOrder);
  const contextRailHiddenSurfaces = useUIStore((state) => state.contextRailHiddenSurfaces);
  const setContextRailOrder = useUIStore((state) => state.setContextRailOrder);
  const openContextSurface = useUIStore((state) => state.openContextSurface);
  const closeContextZone = useUIStore((state) => state.closeContextZone);
  const contextSurfaceZones = useUIStore((state) => state.contextSurfaceZones);
  const shortcutOverrides = useUIStore((state) => state.shortcutOverrides);
<<<<<<< HEAD
  const githubAuthChecked = (useSourceControlAuthEntry(GITHUB_SOURCE_CONTROL_IDENTITY)?.hasChecked ?? false);
  // Change requests come from GitHub or GitLab, whichever the project lives on,
  // so the surface is there when either kind of account is connected.
||||||| bc50ba56aa
  const providers = useSourceControlProviders();
  // Whether any provider's default instance (github.com, gitlab.com) has answered an auth check.
  const defaultInstanceAuthChecked = useSourceControlAuthStore((state) => providers.some((descriptor) => (
    descriptor.instances.defaultInstance !== null
    && state.entries[getSourceControlAuthKey({ provider: descriptor.id, instance: descriptor.instances.defaultInstance })]?.hasChecked === true
  )));
  // Change requests come from GitHub or GitLab, whichever the project lives on,
  // so the surface is there when either kind of account is connected.
=======
  const providers = useSourceControlProviders();
  const defaultInstanceAuthChecked = useSourceControlAuthStore((state) => providers.some((descriptor) => (
    descriptor.instances.defaultInstance !== null
    && state.entries[getSourceControlAuthKey({ provider: descriptor.id, instance: descriptor.instances.defaultInstance })]?.hasChecked === true
  )));
>>>>>>> upstream/main
  const sourceControlConnected = useSourceControlAuthStore((state) => Object.values(state.entries)
    .some((entry) => entry.status?.status === 'connected'));
<<<<<<< HEAD
  const repositoryProvider = useRepositoryReferenceProvider(directoryKey || null);
||||||| bc50ba56aa
  const repositoryProvider = useRepositoryHostProvider(directoryKey || null);
  // Until the project's host is known the rail reads as the first provider, as it did before hosts were read.
  const trackerDescriptor = useSourceControlProvider(repositoryProvider === 'none' ? null : repositoryProvider ?? providers[0]?.id);
  const changeRequestTerm = repositoryProvider === 'none' ? 'pullRequest' : trackerDescriptor.terminology.changeRequest;
=======
  const repositoryProvider = useRepositoryHostProvider(directoryKey || null);
  const trackerDescriptor = useSourceControlProvider(repositoryProvider === 'none' ? null : repositoryProvider ?? providers[0]?.id);
  const changeRequestTerm = repositoryProvider === 'none' ? 'pullRequest' : trackerDescriptor.terminology.changeRequest;
>>>>>>> upstream/main
  const { screenWidth } = useDeviceInfo();
<<<<<<< HEAD
  const gitStatus = useGitStatus(directoryKey || null);
||||||| bc50ba56aa
  // The Git badge counts what the Git panel shows: for a draft waiting for a new space, the space's changes;
  // for a folder holding repositories, the repository picked in the panel. Same root as GitView, so the
  // nested selection it stored is found under the same key.
  const gitRoot = panelContentDirectory(useDraftSpaceTarget(), effectiveDirectory ?? null);
  const gitDirectory = useEffectiveGitDirectory(gitRoot);
  const gitStatus = useGitStatus(gitDirectory);
  const { git } = useRuntimeAPIs();
  const ensureGitStatus = useGitStore((state) => state.ensureStatus);
  const fetchGitStatus = useGitStore((state) => state.fetchStatus);
  // The chat keeps the root's status warm and fresh; a remembered nested repository has nobody
  // reading it until its panel opens, so the badge reads it itself: once, and again on each
  // refresh hint. Hints from agent tools carry the session directory, which is the root here.
  React.useEffect(() => {
    if (!git || !gitRoot || !gitDirectory || gitDirectory === gitRoot) return;
    void runBackgroundNetworkTask(() => ensureGitStatus(gitDirectory, git));
    const root = normalizePath(gitRoot);
    const repository = normalizePath(gitDirectory);
    return sessionEvents.onGitRefreshHint((hint) => {
      const hinted = normalizePath(hint.directory);
      if (hinted !== root && hinted !== repository) return;
      void runBackgroundNetworkTask(() => fetchGitStatus(gitDirectory, git, { silent: true }));
    });
  }, [ensureGitStatus, fetchGitStatus, git, gitDirectory, gitRoot]);
=======
  const gitRoot = panelContentDirectory(useDraftSpaceTarget(), effectiveDirectory ?? null);
  const gitDirectory = useEffectiveGitDirectory(gitRoot);
  const gitStatus = useGitStatus(gitDirectory);
  const { git } = useRuntimeAPIs();
  const ensureGitStatus = useGitStore((state) => state.ensureStatus);
  const fetchGitStatus = useGitStore((state) => state.fetchStatus);
  React.useEffect(() => {
    if (!git || !gitRoot || !gitDirectory || gitDirectory === gitRoot) return;
    void runBackgroundNetworkTask(() => ensureGitStatus(gitDirectory, git));
    const root = normalizePath(gitRoot);
    const repository = normalizePath(gitDirectory);
    return sessionEvents.onGitRefreshHint((hint) => {
      const hinted = normalizePath(hint.directory);
      if (hinted !== root && hinted !== repository) return;
      void runBackgroundNetworkTask(() => fetchGitStatus(gitDirectory, git, { silent: true }));
    });
  }, [ensureGitStatus, fetchGitStatus, git, gitDirectory, gitRoot]);
>>>>>>> upstream/main

  const surfaceSwitchPrefix = React.useMemo(
    () => getEffectiveShortcutPrefix('switch_context_surface', shortcutOverrides),
    [shortcutOverrides],
  );
  const [revealNumbers, setRevealNumbers] = React.useState(false);

  React.useEffect(() => {
    const held = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let consumedWhileHeld = false;

    const isDigitKey = (key: string) => key.length === 1 && key >= '0' && key <= '9';

    const update = () => {
      const armed = isShortcutPrefixHeld(surfaceSwitchPrefix, held);
      if (armed) {
        if (!consumedWhileHeld && timer === null) {
          timer = setTimeout(() => setRevealNumbers(true), RAIL_NUMBER_HOLD_DELAY_MS);
        }
      } else {
        consumedWhileHeld = false;
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        setRevealNumbers(false);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      held.add(e.key.toLowerCase());
      if (isDigitKey(e.key) && isShortcutPrefixHeld(surfaceSwitchPrefix, held)) {
        consumedWhileHeld = true;
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        setRevealNumbers(false);
        return;
      }
      update();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      held.delete(e.key.toLowerCase());
      update();
    };
    const onWindowBlur = () => {
      held.clear();
      consumedWhileHeld = false;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      setRevealNumbers(false);
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onWindowBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onWindowBlur);
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [surfaceSwitchPrefix]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  const guestSurfaces = useGuestSurfaces();
  const guestBadges = useGuestBadgeStore((state) => state.countByGuest);
  const guestListening = useGuestListeningStore((state) => state.captureCountByGuest);
  const clearGuestBadge = useGuestBadgeStore((state) => state.clearBadge);
  const tabs = panelState?.tabs ?? EMPTY_TABS;
<<<<<<< HEAD
  // Every zone shown, not only the right one: a surface moved off the right
  // keeps its rail highlight wherever it lives.
||||||| bc50ba56aa
  const workflowsShown = useWorkflowsSurfaceShown(tabs, effectiveDirectory || null);
  // One surface per open zone is on screen; each lights its rail icon.
=======
  const workflowsShown = useWorkflowsSurfaceShown(tabs, effectiveDirectory || null);
  const receivedPagesShown = hasReceivedPages(useReceivedPages());
>>>>>>> upstream/main
  const shownModes = React.useMemo(
    () => shownContextModes(panelState, contextSurfaceZones),
    [panelState, contextSurfaceZones],
  );
  const changedFilesCount = gitStatus?.files.length ?? 0;
  const workflowsShown = useWorkflowsSurfaceShown(tabs, effectiveDirectory || null);
  const surfaces = React.useMemo(() => {
    return getVisibleContextRailSurfaces({
      railOrder: contextRailOrder,
      hiddenSurfaces: contextRailHiddenSurfaces,
      isVSCode: false,
      screenWidth,
      tabs,
      sourceControlConnected,
      workflowsShown,
      receivedPagesShown,
      extras: guestSurfaces,
<<<<<<< HEAD
    }).map((surface) => (surface.id === 'pr' && repositoryProvider === 'gitlab' ? { ...surface, icon: 'gitlab' as const } : surface));
  }, [contextRailHiddenSurfaces, contextRailOrder, guestSurfaces, repositoryProvider, screenWidth, sourceControlConnected, tabs, workflowsShown]);
||||||| bc50ba56aa
    }).map((surface) => (surface.id === 'pr' ? { ...surface, ...trackerRailIcon(repositoryProvider === 'none' ? null : trackerDescriptor) } : surface));
  }, [contextRailHiddenSurfaces, contextRailOrder, guestSurfaces, repositoryProvider, screenWidth, sourceControlConnected, tabs, trackerDescriptor, workflowsShown]);
=======
    }).map((surface) => (surface.id === 'pr' ? { ...surface, ...trackerRailIcon(repositoryProvider === 'none' ? null : trackerDescriptor) } : surface));
  }, [contextRailHiddenSurfaces, contextRailOrder, guestSurfaces, receivedPagesShown, repositoryProvider, screenWidth, sourceControlConnected, tabs, trackerDescriptor, workflowsShown]);
>>>>>>> upstream/main

<<<<<<< HEAD
  // A surface whose integration disconnected closes rather than lingering as
  // an active panel with no rail icon.
||||||| bc50ba56aa
  // A surface whose integration disconnected closes rather than lingering as
  // an active panel with no rail icon.
  const hasTrackerItems = tabs.some((tab) => tab.mode === 'pr' && tab.targetPath);
=======
  const hasTrackerItems = tabs.some((tab) => tab.mode === 'pr' && tab.targetPath);
>>>>>>> upstream/main
  React.useEffect(() => {
    if (!directoryKey || !githubAuthChecked || sourceControlConnected || !shownModes.has('pr')) {
      return;
    }
    closeContextZone(directoryKey, zoneOfMode(contextSurfaceZones, 'pr'));
  }, [closeContextZone, contextSurfaceZones, directoryKey, githubAuthChecked, shownModes, sourceControlConnected]);

  const [isSurfacesDialogOpen, setIsSurfacesDialogOpen] = React.useState(false);

<<<<<<< HEAD
  // An icon dragged out of the rail toward the workspace moves its surface to a
  // zone instead of reordering the rail (`zoneDrag.ts`).
||||||| bc50ba56aa
  // An icon dragged out of the rail toward the workspace moves its surface
  // to a zone instead of reordering the rail (zoneDrag.ts).
=======
>>>>>>> upstream/main
  const railRef = React.useRef<HTMLElement | null>(null);
  const zoneGestureRef = React.useRef<ZoneDragGesture | null>(null);
  const changeRequestTerm = useChangeRequestTerm(repositoryProvider);
  const handleDragStart = React.useCallback((event: DragStartEvent) => {
    const surface = surfaces.find((entry) => entry.id === event.active.id);
    const railLeft = railRef.current?.getBoundingClientRect().left;
    if (!surface || railLeft === undefined) return;
    zoneGestureRef.current?.cancel();
    zoneGestureRef.current = startZoneDragGesture({
      mode: surface.mode,
      label: surface.label ?? t(changeRequestCopy(surface.labelKey, changeRequestTerm)),
      from: zoneOfMode(useUIStore.getState().contextSurfaceZones, surface.mode),
    }, (point) => point.x < railLeft - 16);
  }, [changeRequestTerm, surfaces, t]);
  const handleDragCancel = React.useCallback(() => {
    zoneGestureRef.current?.cancel();
    zoneGestureRef.current = null;
  }, []);
  React.useEffect(() => () => zoneGestureRef.current?.cancel(), []);

  const handleDragEnd = React.useCallback((event: DragEndEvent) => {
    const gesture = zoneGestureRef.current;
    zoneGestureRef.current = null;
    if (gesture?.finish(directoryKey)) {
      return;
    }
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const ordered = sortContextSurfaces(useUIStore.getState().contextRailOrder, guestSurfaces);
    const groupOf = (id: string | number) => {
      const surface = ordered.find((entry) => entry.id === id);
      return surface ? contextSurfaceGroup(surface) : null;
    };
    if (groupOf(active.id) !== groupOf(over.id)) {
      return;
    }
    const orderedIds = ordered.map((surface) => surface.id);
    const fromIndex = orderedIds.indexOf(active.id as (typeof orderedIds)[number]);
    const toIndex = orderedIds.indexOf(over.id as (typeof orderedIds)[number]);
    if (fromIndex === -1 || toIndex === -1) {
      return;
    }

    setContextRailOrder(arrayMove(orderedIds, fromIndex, toIndex));
  }, [directoryKey, guestSurfaces, setContextRailOrder]);

  const groups = React.useMemo(() => {
    const runs: ContextSurfaceDescriptor[][] = [];
    for (const surface of surfaces) {
      const last = runs.at(-1);
      if (last && contextSurfaceGroup(last[0]) === contextSurfaceGroup(surface)) last.push(surface);
      else runs.push([surface]);
    }
    return runs;
  }, [surfaces]);
  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    const activeSurface = surfaces.find((surface) => surface.id === args.active.id);
    if (!activeSurface) return closestCenter(args);
    const activeGroup = contextSurfaceGroup(activeSurface);
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((container) => {
        const surface = surfaces.find((entry) => entry.id === container.id);
        return surface !== undefined && contextSurfaceGroup(surface) === activeGroup;
      }),
    });
  }, [surfaces]);

  if (!directoryKey) {
    return null;
  }

  let orderNumber = 0;

  return (
    <nav
      ref={railRef}
      aria-label={t('contextRail.aria.rail')}
<<<<<<< HEAD
      className="flex h-full w-11 flex-shrink-0 flex-col items-center gap-1 bg-background py-2"
||||||| bc50ba56aa
      className="flex h-full w-11 flex-shrink-0 flex-col items-center gap-2 bg-background py-2"
=======
      className="flex h-full w-11 flex-shrink-0 flex-col items-center gap-2 bg-background pb-2"
>>>>>>> upstream/main
    >
      <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <ScrollShadow
        surface="var(--background)"
        size={RAIL_SCROLL_FADE_PX}
        className="scrollbar-none flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto overflow-x-hidden pt-2"
      >
      <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragCancel={handleDragCancel} onDragEnd={handleDragEnd}>
        {groups.map((group, groupIndex) => (
          <React.Fragment key={contextSurfaceGroup(group[0])}>
          {groupIndex > 0 ? <div aria-hidden="true" className="h-1.5 shrink-0" /> : null}
          <SortableContext items={group.map((surface) => surface.id)} strategy={verticalListSortingStrategy}>
          {group.map((surface) => {
            orderNumber += 1;
            const label = surface.label ?? t(changeRequestCopy(surface.labelKey, changeRequestTerm));
            const gitChangedCount = surface.id === 'git' && !workStatusPanelVisible ? changedFilesCount : 0;
            const guestBadgeCount = isPluginContextPanelMode(surface.mode) && !shownModes.has(surface.mode)
              ? guestBadges[pluginIdFromMode(surface.mode)] ?? 0
              : 0;
            const badgeCount = gitChangedCount > 0 ? gitChangedCount : guestBadgeCount > 0 ? guestBadgeCount : null;
            const isGuestBadge = badgeCount !== null && gitChangedCount === 0;
            const listening = isPluginContextPanelMode(surface.mode) && (guestListening[pluginIdFromMode(surface.mode)] ?? 0) > 0;
            return (
              <ContextPanelRailItem
                key={surface.id}
                surface={surface}
                isActive={shownModes.has(surface.mode)}
                showActivityDot={false}
                label={label}
                description={t(changeRequestCopy(surface.descriptionKey, changeRequestTerm))}
                badgeCount={badgeCount}
                listening={listening}
                badgeAriaLabel={listening
                  ? t('contextRail.surface.plugin.listeningAria', { label })
                  : badgeCount !== null
                  ? t(
                    isGuestBadge
                      ? (badgeCount === 1 ? 'contextRail.surface.plugin.badgeAriaSingle' : 'contextRail.surface.plugin.badgeAriaPlural')
                      : (badgeCount === 1 ? 'contextRail.surface.git.changesCountAriaSingle' : 'contextRail.surface.git.changesCountAriaPlural'),
                    { label, count: badgeCount },
                  )
                  : null}
                badgeDescription={listening
                  ? t('contextRail.surface.plugin.listeningTooltip')
                  : badgeCount !== null
                  ? t(
                    isGuestBadge
                      ? (badgeCount === 1 ? 'contextRail.surface.plugin.badgeTooltipSingle' : 'contextRail.surface.plugin.badgeTooltipPlural')
                      : (badgeCount === 1 ? 'contextRail.surface.git.changesCountTooltipSingle' : 'contextRail.surface.git.changesCountTooltipPlural'),
                    { count: badgeCount },
                  )
                  : null}
                orderNumber={orderNumber}
                showOrderNumber={revealNumbers}
                onSelect={(selected) => {
                  if (isPluginContextPanelMode(selected.mode)) clearGuestBadge(pluginIdFromMode(selected.mode));
                  openContextSurface(directoryKey, selected.mode);
                }}
              />
            );
          })}
          </SortableContext>
          </React.Fragment>
        ))}
      </DndContext>
      </ScrollShadow>
      <ScrollShadowBands surface="var(--background)" size={RAIL_SCROLL_FADE_PX} />
      </div>
      <Tooltip delayDuration={RAIL_TOOLTIP_DELAY_MS}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t('contextRail.configure.open')}
            onClick={() => setIsSurfacesDialogOpen(true)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
          >
            <Icon name="list-settings" className="h-[17px] w-[17px]" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={8}>
          {t('contextRail.configure.open')}
        </TooltipContent>
      </Tooltip>
      <ContextRailSurfacesDialog open={isSurfacesDialogOpen} onOpenChange={setIsSurfacesDialogOpen} />
    </nav>
  );
};
