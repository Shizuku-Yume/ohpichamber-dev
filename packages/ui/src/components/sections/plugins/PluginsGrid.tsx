import React from 'react';
import type { InstalledPluginEntry, LocalExtensionEntry, PluginCatalogState, PluginUpdateCheckEntry } from '@openchamber/agent-contract';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon/Icon';
<<<<<<< HEAD
import {
 SETTINGS_CARD_GRID_CLASS,
 SettingsAddCard,
 SettingsCard,
 SettingsCardChip,
 SettingsCardIcon,
 SettingsCardPill,
 SettingsCardSearch,
=======
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { SETTINGS_DESCRIPTION_CLASS } from '@/components/sections/shared/SettingsSection';
import {
  SETTINGS_CARD_GRID_CLASS,
  SettingsAddCard,
  SettingsCard,
  SettingsCardChip,
  SettingsCardIcon,
  SettingsCardPill,
  SettingsCardToolbar,
  type SettingsCardAction,
>>>>>>> bc50ba56a
} from '@/components/sections/shared/SettingsCards';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { useI18n } from '@/lib/i18n';
import { rankByQuery } from '@/lib/search/fuzzySearch';
import { cn } from '@/lib/utils';
<<<<<<< HEAD

export type PluginSelection = { kind: 'plugin'; id: string } | { kind: 'local'; extensionId: string };
export type PluginDeleteTarget = { kind: 'plugin'; plugin: InstalledPluginEntry } | { kind: 'local'; extension: LocalExtensionEntry };
type GridItem = { kind: 'plugin'; plugin: InstalledPluginEntry } | { kind: 'local'; extension: LocalExtensionEntry };
=======
import { Switch } from '@/components/ui/switch';
import { SettingsInfoHint } from '@/components/sections/shared/SettingsInfoHint';
import { useIntegrationPolicyState } from '@/components/sections/shared/useIntegrationPolicyBlock';
import {
  getPluginsConfigDirectory,
  getPluginsScopeKey,
  getPluginUpdateKey,
  usePluginsStore,
  type PluginEntry,
  type PluginFile,
  type PluginParsedKind,
} from '@/stores/usePluginsStore';
import {
  configEntryRuntimeTarget,
  findRuntimeMatches,
  pluginFileRuntimeTarget,
  resolveUpdateFlag,
  type PluginRuntimeTarget,
} from './pluginLoadState';
import { pluginDisplayName } from './pluginDisplayName';
import { usePluginPackageUpdate, usePluginRuntimeStatus } from './usePluginRuntimeStatus';

/** How a plugin spec is loaded, as the card shows it. */
const PARSED_KIND_ICON: Record<PluginParsedKind, 'equalizer-2' | 'code-box' | 'folder' | 'git-branch'> = {
  control: 'equalizer-2',
  npm: 'code-box',
  path: 'folder',
  git: 'git-branch',
};

const PARSED_KIND_LABEL_KEY = {
  npm: 'settings.plugins.sidebar.kind.npm',
  path: 'settings.plugins.sidebar.kind.path',
  git: 'settings.plugins.sidebar.kind.git',
} as const;
>>>>>>> bc50ba56a

const entryKindLabelKey = (entry: PluginEntry) => {
  if (entry.parsedKind !== 'control') return PARSED_KIND_LABEL_KEY[entry.parsedKind];
  return entry.spec.startsWith('-') ? 'settings.plugins.sidebar.kind.disableRule' : 'settings.plugins.sidebar.kind.enableRule';
};

/**
 * Runtime is published per worker for the whole plugin catalog, never per
 * package, so a card can only report the workspace publication it shares.
 */
const WorkspaceRuntimePill: React.FC<{ catalog: PluginCatalogState }> = ({ catalog }) => {
 const { t } = useI18n();
 if (catalog.workers.length === 0) return null;
 if (catalog.workers.some(worker => worker.status === 'unavailable' || worker.error !== null)) {
  return <SettingsCardPill tone="error">{t('settings.plugins.status.unavailable')}</SettingsCardPill>;
 }
 if (catalog.workers.every(worker => worker.appliedRevision === catalog.revision)) {
  return <SettingsCardPill tone="success">{t('settings.plugins.apply.applied')}</SettingsCardPill>;
 }
 return <SettingsCardPill tone="neutral">{t('settings.plugins.status.ready')}</SettingsCardPill>;
};

/** Native scopes (`user`/`project`) and contract scopes (`global`/`workspace`) name the same install. */
// oxlint-disable-next-line react/only-export-components
export const pluginUpdateFor = (
 updates: readonly PluginUpdateCheckEntry[],
 plugin: InstalledPluginEntry,
): PluginUpdateCheckEntry | undefined => {
 if (plugin.target.kind !== 'marketplace') return undefined;
 const target = plugin.target;
 const nativeScope = plugin.scope === 'global' ? 'user' : 'project';
 return updates.find((update): update is PluginUpdateCheckEntry => update.target.kind === 'marketplace'
  && update.target.name === target.name && update.target.marketplace === target.marketplace
  && update.target.scope === nativeScope);
};

/** Browse view of the Plugins page: native plugins and local extensions as cards. */
export const PluginsGrid: React.FC<{
<<<<<<< HEAD
 catalog: PluginCatalogState;
 refreshing: boolean;
 upgradingAll: boolean;
 onRefresh: () => void;
 onAdd: () => void;
 onSelect: (selection: PluginSelection) => void;
 onDelete: (target: PluginDeleteTarget) => void;
 onUpdate: (plugin: InstalledPluginEntry) => void;
 onUpgradeAll: () => void;
 /** Operations and marketplace results surfaced above the card grid. */
 notices?: React.ReactNode;
 children?: React.ReactNode;
}> = ({ catalog, refreshing, upgradingAll, onRefresh, onAdd, onSelect, onDelete, onUpdate, onUpgradeAll, notices, children }) => {
 const { t } = useI18n();
 const [query, setQuery] = React.useState('');
 const items: GridItem[] = [
  ...catalog.plugins.map((plugin): GridItem => ({ kind: 'plugin', plugin })),
  ...catalog.localExtensions.map((extension): GridItem => ({ kind: 'local', extension })),
 ];
 const filtered = rankByQuery(items, query, item => item.kind === 'plugin'
  ? [item.plugin.name, item.plugin.description, item.plugin.target.name]
  : [item.extension.extensionId, item.extension.relativePath]);
 const hasQuery = query.trim().length > 0;
 const runtimeUnavailable = catalog.workers.some(worker => worker.status === 'unavailable');
 const updates = catalog.availableUpdates;
=======
  onAdd: () => void;
  onDelete: (target: PluginDeleteTarget) => void;
}> = ({ onAdd, onDelete }) => {
  const { t } = useI18n();
  const { entries, files, setSelected, loadPlugins } = usePluginsStore(useShallow((state) => ({
    entries: state.entries,
    files: state.files,
    setSelected: state.setSelected,
    loadPlugins: state.loadPlugins,
  })));
  const isLoadingRegistry = usePluginsStore((state) => state.isLoadingRegistry);
  const loadRegistryInfo = usePluginsStore((state) => state.loadRegistryInfo);
  const isCheckingUpdates = usePluginsStore((state) => state.isCheckingUpdates);
  const checkUpdates = usePluginsStore((state) => state.checkUpdates);
  const runtime = usePluginsStore((state) => state.runtime);
  const registryInfo = usePluginsStore((state) => state.registryInfo);
  const packageUpdates = usePluginsStore((state) => state.packageUpdates);
  const updateToLatest = usePluginsStore((state) => state.updateToLatest);
  const updatePackage = usePluginsStore((state) => state.updatePackage);
  const setEntryEnabled = usePluginsStore((state) => state.setEntryEnabled);
  const setFileEnabled = usePluginsStore((state) => state.setFileEnabled);
  const runtimeScope = getPluginsScopeKey(getPluginsConfigDirectory());
  const runtimeUnavailable = runtime.kind === 'failed' && runtime.scope === runtimeScope;
  const runtimePlugins = runtime.kind === 'ready' && runtime.scope === runtimeScope ? runtime.plugins : null;
  const [query, setQuery] = React.useState('');
  const policyRevision = usePluginsStore((state) => state.policyRevision);
  const bumpPolicyRevision = usePluginsStore((state) => state.bumpPolicyRevision);
  // More than one switch can be in flight, so pending state is kept per row.
  // A single slot let the first reply clear a second row's disabled state while
  // its request was still running.
  const [pendingSwitchIds, setPendingSwitchIds] = React.useState<ReadonlySet<string>>(() => new Set());
  const setSwitchPending = (id: string, pending: boolean) => {
    setPendingSwitchIds((previous) => {
      if (previous.has(id) === pending) return previous;
      const next = new Set(previous);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const policy = useIntegrationPolicyState(getPluginsConfigDirectory(), policyRevision);

  const toggleSwitch = (id: string, enabled: boolean, setEnabled: typeof setEntryEnabled) => {
    setSwitchPending(id, true);
    void setEnabled(id, enabled).then((result) => {
      setSwitchPending(id, false);
      if (result.switchOverridden) {
        toast.error(t('settings.plugins.switch.overriddenByConfig'));
        void loadPlugins({ force: true });
      } else if (!result.ok) {
        toast.error(t('settings.plugins.switch.toast.failed'));
      } else {
        if (result.requiresManualRestart) toast.info(t('settings.openchamber.opencodeCli.restart.manualRequired'));
        bumpPolicyRevision();
      }
    });
  };

  // The server names the plugin resource the policy matches; without one the
  // row still shows a switch, so every card keeps the same shape, and the hint
  // says why nothing can be flipped. A failed policy read leaves the switch
  // disabled: a denied plugin and an enabled one look the same from here. The
  // hint is a tap target of its own, because a disabled switch takes no tap and
  // a native title never shows on touch.
  const pluginSwitch = (
    item: Pick<PluginEntry, 'id' | 'policyResource' | 'switchState'>,
    name: string,
    setEnabled: typeof setEntryEnabled,
  ) => {
    const resource = item.policyResource;
    const switchOff = item.switchState === 'off';
    // Until a policy read lands, the row shows what the server already knows
    // about OpenChamber's own switch. After that the policy decides, including
    // through a failed re-read, which keeps the last answer. A row switched on
    // here ignores OpenChamber's own denial, which stays in OpenCode's view
    // until it reads the new layer and is no rule the user could remove.
    const blocked = resource
      ? policy.hasRead
        // An unreadable store leaves OpenChamber's last denials in place, and
        // only OpenCode's view tells whether this plugin is among them.
        ? switchOff || item.switchState === 'unreadable' ? policy.isBlocked(resource) : policy.isBlockedByRule(resource)
        : switchOff
      : false;
    // The server sees the config files; what OpenCode reports also covers system
    // and Console rules. Either way the denial does nothing, so the row must not
    // read as off.
    const overridden = item.switchState === 'overridden'
      || (switchOff && resource !== undefined && policy.status === 'ready' && policy.isAllowedByRule(resource));
    const hint = (() => {
      if (policy.status === 'error') return t('settings.plugins.status.unknown.description');
      if (!resource) return t('settings.plugins.switch.unavailable');
      if (item.switchState === 'unavailable') return t('settings.plugins.switch.notAvailable');
      if (item.switchState === 'unreadable') return t('settings.plugins.switch.unreadable');
      if (overridden) return t('settings.plugins.switch.overriddenByConfig');
      if (policy.status === 'ready' && blocked && !switchOff) return t('settings.plugins.switch.blockedByConfig');
      return null;
    })();
    return {
      blocked,
      control: (
        <div className="flex items-center gap-1">
          {hint ? <SettingsInfoHint contentClassName="max-w-64">{hint}</SettingsInfoHint> : null}
          <Switch
            checked={overridden || (!blocked && !switchOff)}
            disabled={pendingSwitchIds.has(item.id) || !resource || policy.status !== 'ready' || item.switchState === 'unavailable' || item.switchState === 'unreadable' || overridden || (blocked && !switchOff)}
            onCheckedChange={() => toggleSwitch(item.id, switchOff, setEnabled)}
            aria-label={`${name}: ${t('settings.plugins.switch.label')}`}
          />
        </div>
      ),
    };
  };
>>>>>>> bc50ba56a

 return (
  <SettingsPageLayout
   title={t('settings.page.plugins.title')}
   description={t('settings.plugins.grid.description')}
   headerEnd={(
    <div className="flex items-center gap-2">
     {runtimeUnavailable ? (
      <span className="inline-flex items-center gap-1 typography-meta text-muted-foreground">
       <Icon name="question" className="size-3.5" />
       {t('settings.plugins.status.sidebar.unavailable')}
      </span>
     ) : null}
     {updates.length > 0 ? (
      <Button variant="outline" size="sm" onClick={onUpgradeAll} disabled={upgradingAll || refreshing}>
       <Icon name="refresh" className={cn('size-3.5', upgradingAll && 'animate-spin')} />
       {upgradingAll ? t('settings.plugins.upgradeAll.running') : t('settings.plugins.action.upgradeAll')}
      </Button>
     ) : null}
     <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 shrink-0 text-muted-foreground"
      onClick={onRefresh}
      disabled={refreshing}
      aria-label={t('settings.plugins.action.refresh')}
      title={t('settings.plugins.action.refresh')}
     >
      <Icon name="refresh" className={cn('size-4', refreshing && 'animate-spin')} />
     </Button>
    </div>
   )}
  >
   {notices}

<<<<<<< HEAD
   {items.length > 0 ? (
    <SettingsCardSearch value={query} onChange={setQuery} placeholder={t('settings.plugins.grid.searchPlaceholder')} />
   ) : null}

   {items.length === 0 ? (
    <p className="py-6 typography-meta text-muted-foreground">{t('settings.plugins.grid.empty')}</p>
   ) : filtered.length === 0 ? (
    <p className="py-6 typography-meta text-muted-foreground">{t('settings.plugins.grid.noMatches', { query: query.trim() })}</p>
   ) : null}

   <div className={SETTINGS_CARD_GRID_CLASS}>
    {hasQuery ? null : (
     <SettingsAddCard
      label={t('settings.plugins.sidebar.actions.addTitle')}
      hint={t('settings.plugins.grid.addHint')}
      onClick={onAdd}
      settingsItem="plugins.create"
     />
    )}
    {filtered.map((item) => {
     if (item.kind === 'plugin') {
      const { plugin } = item;
      const update = pluginUpdateFor(updates, plugin);
      return (
       <SettingsCard
        key={plugin.id}
        icon={<SettingsCardIcon name={plugin.target.kind === 'package' ? 'code-box' : 'folder'} />}
        title={plugin.name}
        subtitle={plugin.target.kind === 'marketplace' ? plugin.target.marketplace : undefined}
        description={plugin.description || undefined}
        muted={!plugin.enabled}
        badges={(
         <>
          {update ? (
           <SettingsCardPill tone="info">
            {t('settings.plugins.update.badge', { from: update.from, to: update.to })}
           </SettingsCardPill>
          ) : null}
          <SettingsCardPill tone={plugin.enabled ? 'success' : 'neutral'}>
           {t(plugin.enabled ? 'settings.plugins.status.enabled' : 'settings.plugins.status.disabled')}
          </SettingsCardPill>
          <WorkspaceRuntimePill catalog={catalog} />
         </>
        )}
        footer={(
         <>
          <span>{plugin.version || '—'}</span>
          <SettingsCardChip>
           {t(plugin.scope === 'workspace' ? 'settings.plugins.scope.workspace' : 'settings.plugins.scope.global')}
          </SettingsCardChip>
         </>
        )}
        onOpen={() => onSelect({ kind: 'plugin', id: plugin.id })}
        actionsLabel={t('settings.plugins.grid.actionsAria', { name: plugin.name })}
        actions={[
         ...(update ? [{
          label: t('settings.plugins.action.update'), icon: 'refresh' as const,
          onSelect: () => onUpdate(plugin)
         }] : []),
         {
          label: t('settings.plugins.action.uninstall'),
          icon: 'delete-bin',
          destructive: true,
          onSelect: () => onDelete({ kind: 'plugin', plugin }),
         },
        ]}
       />
      );
     }
     const { extension } = item;
     return (
      <SettingsCard
       key={extension.extensionId}
       icon={<SettingsCardIcon name="file-text" />}
       title={extension.extensionId}
       subtitle={extension.relativePath}
       footer={(
        <>
         <span>{t('settings.plugins.local.title')}</span>
         <SettingsCardChip>{t('settings.plugins.scope.workspace')}</SettingsCardChip>
        </>
       )}
       onOpen={() => onSelect({ kind: 'local', extensionId: extension.extensionId })}
       actionsLabel={t('settings.plugins.grid.actionsAria', { name: extension.extensionId })}
       actions={[{
        label: t('settings.common.actions.delete'),
        icon: 'delete-bin',
        destructive: true,
        onSelect: () => onDelete({ kind: 'local', extension }),
       }]}
      />
     );
    })}
   </div>

   {children}
  </SettingsPageLayout>
 );
=======
  // The npm registry answers for exact pins (rewritten in config), OpenCode
  // for everything it can reinstall in place (names, ranges, tags, Git).
  const handleRefresh = async () => {
    toast.info(t('settings.plugins.toast.refreshing'));
    // A failed policy read leaves every switch disabled, so the one control
    // that can retry it re-reads here too.
    bumpPolicyRevision();
    const [registryOk, checkOk] = await Promise.all([
      loadRegistryInfo({ force: true }),
      checkUpdates(),
    ]);
    if (!registryOk) toast.error(t('settings.plugins.toast.refreshFailed'));
    if (!checkOk) toast.error(t('settings.plugins.toast.checkFailed'));
  };

  // One stable target per card, so each card's status hook memoizes.
  const runtimeTargets = React.useMemo(() => {
    const targets = new Map<string, PluginRuntimeTarget | null>();
    for (const entry of entries) {
      // A control entry is never loaded, so OpenCode reports nothing for it.
      targets.set(entry.id, entry.parsedKind === 'control' ? null : configEntryRuntimeTarget(entry.spec, entry.sourcePath));
    }
    for (const file of files) targets.set(file.id, pluginFileRuntimeTarget(file.absolutePath));
    return targets;
  }, [entries, files]);

  // The package OpenCode can reinstall in place for this entry, when a newer
  // release matches its spec and no update is already running.
  const openCodeUpdateTarget = (entryId: string): string | null => {
    const target = runtimeTargets.get(entryId);
    if (!runtimePlugins || target?.kind !== 'package') return null;
    if (packageUpdates[getPluginUpdateKey(runtimeScope, target.target)]?.kind === 'running') return null;
    return resolveUpdateFlag(findRuntimeMatches(target, runtimePlugins)) === 'available' ? target.target : null;
  };

  // The npm registry answers for exact pins (rewritten in config), OpenCode
  // for everything it can reinstall in place (names, ranges, tags, Git).
  const entryActions = (entry: PluginEntry): SettingsCardAction[] => {
    const actions: SettingsCardAction[] = [];
    const info = registryInfo[entry.spec];
    const updateTarget = openCodeUpdateTarget(entry.id);
    if (info?.kind === 'npm-ok' && info.hasUpdate && info.latestVersion) {
      const latest = info.latestVersion;
      actions.push({
        label: t('settings.plugins.registry.banner.updateAvailable.action', { latest }),
        icon: 'arrow-up-s',
        onSelect: () => {
          void updateToLatest(entry.id).then((result) => {
            if (result.ok) toast.success(t('settings.plugins.toast.updatedToLatest', { version: latest }));
            else toast.error(t('settings.plugins.toast.refreshFailed'));
          });
        },
      });
    } else if (updateTarget) {
      actions.push({
        label: t('settings.plugins.update.action'),
        icon: 'arrow-up-s',
        onSelect: () => {
          void updatePackage(updateTarget).then((ok) => {
            if (ok) toast.success(t('settings.plugins.update.toast.done', { name: entry.spec }));
            else toast.error(t('settings.plugins.update.toast.failed', { name: entry.spec }));
          });
        },
      });
    }
    actions.push({
      label: t('settings.common.actions.delete'),
      icon: 'delete-bin',
      destructive: true,
      onSelect: () => onDelete({ kind: 'entry', id: entry.id, label: entry.spec }),
    });
    return actions;
  };

  const seenPaths = new Set<string>();
  for (const entry of entries) {
    const target = entry.resolvedPath ? pluginFileRuntimeTarget(entry.resolvedPath) : runtimeTargets.get(entry.id);
    if (target?.kind === 'local') seenPaths.add(target.path);
  }
  const visibleFiles = files.filter((file) => {
    if (file.kind !== 'package') return true;
    const target = pluginFileRuntimeTarget(file.resolvedPath ?? file.absolutePath);
    if (target?.kind !== 'local') return true;
    if (seenPaths.has(target.path)) return false;
    seenPaths.add(target.path);
    return true;
  });
  const items: GridItem[] = [
    ...entries.map((entry): GridItem => ({ kind: 'entry', entry })),
    ...visibleFiles.map((file): GridItem => ({ kind: 'file', file })),
  ];
  const filtered = rankByQuery(items, query, (item) => (
    item.kind === 'entry' ? [pluginDisplayName(item.entry.spec), item.entry.spec] : [item.file.fileName, item.file.absolutePath ?? '']
  ));
  const hasQuery = query.trim().length > 0;
  const refreshing = isLoadingRegistry || isCheckingUpdates;

  return (
    <SettingsPageLayout
      title={t('settings.page.plugins.title')}
      namedBySidebar
    >
      <SettingsCardToolbar
        search={items.length > 0 ? { value: query, onChange: setQuery, placeholder: t('settings.plugins.grid.searchPlaceholder') } : null}
        actions={(
          <>
            {runtimeUnavailable ? (
              <span className="inline-flex items-center gap-1 typography-meta text-muted-foreground">
                <Icon name="question" className="size-3.5" />
                {t('settings.plugins.status.sidebar.unavailable')}
              </span>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="w-7 shrink-0 px-0 text-muted-foreground"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              aria-label={t('settings.plugins.sidebar.actions.refresh')}
              title={t('settings.plugins.sidebar.actions.refresh')}
            >
              <Icon name="refresh" className={cn('size-4', refreshing && 'animate-spin')} />
            </Button>
          </>
        )}
      />
      {/* What a card's switch changes and what it leaves alone: a consequence, so it stays on screen. */}
      <p className={cn(SETTINGS_DESCRIPTION_CLASS, 'mb-4')}>{t('settings.plugins.grid.description')}</p>

      {items.length === 0 ? (
        <p className="py-6 typography-meta text-muted-foreground">{t('settings.plugins.grid.empty')}</p>
      ) : filtered.length === 0 ? (
        <p className="py-6 typography-meta text-muted-foreground">{t('settings.plugins.grid.noMatches', { query: query.trim() })}</p>
      ) : null}

      <div className={SETTINGS_CARD_GRID_CLASS}>
        {hasQuery ? null : (
          <SettingsAddCard
            label={t('settings.plugins.sidebar.actions.addTitle')}
            hint={t('settings.plugins.grid.addHint')}
            onClick={onAdd}
            settingsItem="plugins.create"
          />
        )}
        {filtered.map((item) => {
          if (item.kind === 'entry') {
            const { entry } = item;
            const name = pluginDisplayName(entry.spec);
            const switchControl = pluginSwitch(entry, name, setEntryEnabled);
            return (
              <SettingsCard
                key={entry.id}
                icon={<SettingsCardIcon name={PARSED_KIND_ICON[entry.parsedKind]} />}
                title={name}
                subtitle={name === entry.spec ? undefined : entry.spec}
                muted={switchControl.blocked}
                badges={<PluginPills target={runtimeTargets.get(entry.id) ?? null} spec={entry.spec} />}
                footer={(
                  <>
                    <span>{t(entryKindLabelKey(entry))}</span>
                    {entry.scope === 'project' ? <SettingsCardChip>{t('settings.plugins.grid.scope.project')}</SettingsCardChip> : null}
                  </>
                )}
                // A control entry has nothing to edit, and options would turn it
                // into a package for OpenCode to install.
                onOpen={entry.parsedKind === 'control' ? undefined : () => setSelected(entry.id)}
                actionsLabel={t('settings.plugins.grid.actionsAria', { name: entry.spec })}
                actions={entryActions(entry)}
                control={entry.parsedKind !== 'control' ? switchControl.control : undefined}
              />
            );
          }
          const { file } = item;
          // A plugin package directory is OpenCode's to load and ours only to
          // show: nothing to open or delete here.
          const displayOnly = file.kind === 'package';
          const switchControl = pluginSwitch(file, file.fileName, setFileEnabled);
          return (
            <SettingsCard
              key={file.id}
              icon={<SettingsCardIcon name={displayOnly ? 'folder' : 'file-text'} />}
              title={file.fileName}
              muted={switchControl.blocked}
              badges={<PluginPills target={runtimeTargets.get(file.id) ?? null} />}
              footer={(
                <>
                  <span>{displayOnly ? t('settings.plugins.sidebar.kind.package') : t('settings.plugins.sidebar.kind.file')}</span>
                  {file.scope === 'project' ? <SettingsCardChip>{t('settings.plugins.grid.scope.project')}</SettingsCardChip> : null}
                </>
              )}
              onOpen={displayOnly ? undefined : () => setSelected(file.id)}
              actionsLabel={t('settings.plugins.grid.actionsAria', { name: file.fileName })}
              actions={displayOnly ? undefined : [{
                label: t('settings.common.actions.delete'),
                icon: 'delete-bin',
                destructive: true,
                onSelect: () => onDelete({ kind: 'file', id: file.id, label: file.fileName }),
              }]}
              control={switchControl.control}
            />
          );
        })}
      </div>
    </SettingsPageLayout>
  );
>>>>>>> bc50ba56a
};
