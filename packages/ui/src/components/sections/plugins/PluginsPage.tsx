import React from 'react';
import {
  JsonObjectSchema,
  JsonValueSchema,
  type InstalledPluginEntry,
  type LocalExtensionEntry,
  type PluginCatalogState,
  type PluginMutationResult,
} from '@openchamber/agent-contract';
import { CanonicalApiError } from '@/api/canonicalClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/icon/Icon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { SettingsBackButton, SettingsCardChip, SettingsCardIcon, SettingsCardPill, SettingsCardSearch } from '@/components/sections/shared/SettingsCards';
import {
  SettingsFieldRow,
  SettingsSection,
  SettingsStackedField,
  SETTINGS_SELECT_SIZE,
} from '@/components/sections/shared/SettingsSection';
import { AUTOSAVE_SAVED, AUTOSAVE_UNCHANGED, autosaveFailed, useAutosave, type AutosaveResult } from '@/components/sections/shared/SettingsAutosave';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useI18n } from '@/lib/i18n';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { rankByQuery } from '@/lib/search/fuzzySearch';
import { cn } from '@/lib/utils';
import { usePluginsStore } from '@/stores/usePluginsStore';
import { AddPluginDialog } from './AddPluginDialog';
import { PluginsGrid, type PluginDeleteTarget, type PluginSelection } from './PluginsGrid';
import { PluginStatusBanner } from './PluginStatusBanner';

const parseSettings = (text: string) => {
  try {
    return JsonObjectSchema.safeParse(JSON.parse(text.trim() === '' ? '{}' : text));
  } catch {
    return JsonObjectSchema.safeParse(null);
  }
};

const ScopeChip: React.FC<{ scope: InstalledPluginEntry['scope'] }> = ({ scope }) => {
  const { t } = useI18n();
  return (
    <SettingsCardChip>
      {t(scope === 'workspace' ? 'settings.plugins.scope.workspace' : 'settings.plugins.scope.global')}
    </SettingsCardChip>
  );
};

const PluginSettingsEditor: React.FC<{ plugin: InstalledPluginEntry; disabled: boolean }> = ({ plugin, disabled }) => {
  const { t } = useI18n();
  const baseline = React.useRef(JSON.stringify(plugin.globalSettings, null, 2));
  const [text, setText] = React.useState(baseline.current);
  const [secrets, setSecrets] = React.useState(() => new Map<string, string>());

  React.useEffect(() => {
    const next = JSON.stringify(plugin.globalSettings, null, 2);
    const previousBaseline = baseline.current;
    setText(previous => previous === previousBaseline ? next : previous);
    baseline.current = next;
  }, [plugin.globalSettings]);

  const parsed = parseSettings(text);
  const secretKeys = parsed.success
    ? plugin.settingDefinitions.filter(setting => setting.secret && Object.hasOwn(parsed.data, setting.key)).map(setting => setting.key)
    : [];
  const invalid = !parsed.success || secretKeys.length > 0;
  const secretDefinitions = plugin.settingDefinitions.filter(setting => setting.secret);
  const hasOverrides = plugin.settingDefinitions.some(setting => setting.overridden);

  const save = async (): Promise<AutosaveResult> => {
    if (!parsed.success) return autosaveFailed(t('settings.plugins.page.field.options.invalidJson'));
    if (secretKeys.length > 0) {
      return autosaveFailed(`${secretKeys.map(key => t('settings.plugins.field.secret', { name: key })).join(', ')}: ${t('settings.plugins.page.field.options.invalidJson')}`);
    }
    if (JSON.stringify(parsed.data, null, 2) === baseline.current && secrets.size === 0) return AUTOSAVE_UNCHANGED;

    const settings = { ...parsed.data };
    for (const [key, value] of secrets) {
      const definition = plugin.settingDefinitions.find(setting => setting.key === key);
      if (!definition || value === '') continue;
      if (definition.type === 'string' || definition.type === 'enum') {
        settings[key] = value;
      } else {
        try {
          settings[key] = JsonValueSchema.parse(JSON.parse(value));
        } catch {
          return autosaveFailed(t('settings.plugins.page.field.options.invalidJson'));
        }
      }
    }

    const submitted = text;
    const submittedSecrets = new Map(secrets);
    const result = await usePluginsStore.getState().configurePlugin({ target: plugin.target, settingsScope: 'global', settings });
    const updated = result.catalog.plugins.find(entry => entry.id === plugin.id);
    if (!updated) return autosaveFailed(t('settings.plugins.error.operation'));

    const normalized = JSON.stringify(updated.globalSettings, null, 2);
    baseline.current = normalized;
    setText(current => current === submitted ? normalized : current);
    setSecrets(current => {
      const remaining = new Map(current);
      for (const [key, value] of submittedSecrets) {
        if (remaining.get(key) === value) remaining.delete(key);
      }
      return remaining;
    });
    return AUTOSAVE_SAVED;
  };
  const autosave = useAutosave(save);

  return (
    <div onBlurCapture={autosave.onBlurCapture} className="space-y-5">
      <div className="space-y-1">
        <Textarea
          id="native-plugin-settings"
          value={text}
          onChange={event => setText(event.target.value)}
          rows={12}
          className="w-full font-mono typography-meta min-h-[200px]"
          spellCheck={false}
          aria-label={t('settings.plugins.field.globalSettings')}
          aria-invalid={invalid}
          disabled={disabled}
          onKeyDown={event => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              autosave.requestSave();
            }
          }}
        />
        {invalid ? (
          <p role="alert" className="typography-micro text-[var(--status-error)]">
            {t('settings.plugins.page.field.options.invalidJson')}
          </p>
        ) : null}
      </div>

      {secretDefinitions.map(setting => (
        <SettingsStackedField
          key={setting.key}
          settingsItem="plugins.secret"
          label={t('settings.plugins.field.secret', { name: setting.key })}
          description={setting.description}
          descriptionPlacement="after"
          controlClassName="w-full max-w-none"
        >
          <div className="w-full space-y-1">
            <Input
              id={`native-plugin-secret-${setting.key}`}
              type="password"
              autoComplete="new-password"
              value={secrets.get(setting.key) ?? ''}
              aria-label={t('settings.plugins.field.secret', { name: setting.key })}
              disabled={disabled}
              onChange={event => {
                const value = event.target.value;
                setSecrets(current => {
                  const next = new Map(current);
                  if (value === '') next.delete(setting.key);
                  else next.set(setting.key, value);
                  return next;
                });
              }}
            />
            <p className="typography-micro text-muted-foreground">
              {t(setting.globalConfigured ? 'settings.plugins.field.secretConfigured' : 'settings.plugins.field.secretUnconfigured')}
            </p>
          </div>
        </SettingsStackedField>
      ))}

      {hasOverrides ? (
        <SettingsStackedField
          settingsItem="plugins.effectiveSettings"
          label={t('settings.plugins.field.effectiveSettings')}
          description={t('settings.plugins.field.projectOverride')}
          controlClassName="w-full max-w-none"
        >
          <Textarea
            id="native-plugin-effective-settings"
            value={JSON.stringify(plugin.settings, null, 2)}
            rows={8}
            className="w-full font-mono typography-meta"
            readOnly
            spellCheck={false}
            aria-label={t('settings.plugins.field.effectiveSettings')}
          />
        </SettingsStackedField>
      ) : null}
    </div>
  );
};

const LocalExtensionEditor: React.FC<{ extension: LocalExtensionEntry; revision: string; disabled: boolean }> = ({ extension, revision, disabled }) => {
  const { t } = useI18n();
  const baseline = React.useRef<string | null>(null);
  const [content, setContent] = React.useState('');
  const [state, setState] = React.useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setState('loading');
    void usePluginsStore.getState().readLocalExtension(extension.extensionId).then(source => {
      if (cancelled) return;
      const previousBaseline = baseline.current;
      setContent(previous => previousBaseline === null || previous === previousBaseline ? source.content : previous);
      baseline.current = source.content;
      setState('ready');
    }).catch(() => {
      if (!cancelled) setState('failed');
    });
    return () => { cancelled = true; };
  }, [extension.extensionId, revision, attempt]);

  const autosave = useAutosave(async () => {
    if (state !== 'ready' || baseline.current === null || content === baseline.current) return AUTOSAVE_UNCHANGED;
    const submitted = content;
    await usePluginsStore.getState().writeLocalExtension(extension.extensionId, submitted);
    baseline.current = submitted;
    return AUTOSAVE_SAVED;
  });

  return (
    <div className="space-y-4" onBlurCapture={autosave.onBlurCapture}>
      {state === 'loading' ? (
        <p role="status" className="flex items-center gap-2 typography-meta text-muted-foreground">
          <Icon name="loader-4" className="size-4 animate-spin" />
          {t('settings.plugins.status.loading')}
        </p>
      ) : null}
      {state === 'failed' ? (
        <div role="alert" className="rounded-md border border-border bg-card p-3 flex items-start gap-3">
          <Icon name="error-warning" className="h-5 w-5 shrink-0 mt-0.5 text-[var(--status-error)]" />
          <div className="flex-1 min-w-0">
            <p className="typography-label text-foreground">{t('settings.plugins.page.header.file')}</p>
            <p className="typography-micro text-muted-foreground mt-0.5">{t('settings.plugins.error.operation')}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)}>
            {t('settings.plugins.status.retry')}
          </Button>
        </div>
      ) : null}
      <Textarea
        id="native-local-extension-content"
        rows={16}
        value={content}
        onChange={event => setContent(event.target.value)}
        disabled={disabled || state !== 'ready'}
        className="w-full font-mono typography-meta min-h-[320px]"
        spellCheck={false}
        aria-label={t('settings.plugins.page.field.content')}
        onKeyDown={event => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            autosave.requestSave();
          }
        }}
      />
    </div>
  );
};

const RuntimeSection: React.FC<{ catalog: PluginCatalogState; disabled: boolean; onApply: () => void }> = ({ catalog, disabled, onApply }) => {
  const { t } = useI18n();
  return (
    <SettingsSection title={t('settings.plugins.runtime.title')} contentClassName="space-y-2">
      {catalog.workers.length === 0 ? (
        <p className="typography-meta text-muted-foreground">{t('settings.plugins.apply.noActiveWorkers')}</p>
      ) : null}
      {catalog.workers.map(worker => (
        <div key={`${worker.worker.rootSessionId}:${worker.worker.workerGeneration}`} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
          <div className="min-w-0 typography-meta">
            <p className="truncate font-mono text-foreground">{worker.worker.rootSessionId}</p>
            <p className="text-muted-foreground">
              {t('settings.plugins.runtime.appliedRevision', { revision: worker.appliedRevision ?? '—' })}
            </p>
            {worker.error ? (
              <p className="mt-1 font-mono text-[var(--status-error)] whitespace-pre-wrap break-words">{worker.error.detail}</p>
            ) : null}
          </div>
          <SettingsCardPill tone={worker.status === 'ready' ? 'success' : 'error'}>
            {t(worker.status === 'ready' ? 'settings.plugins.status.ready' : 'settings.plugins.status.unavailable')}
          </SettingsCardPill>
        </div>
      ))}
      <div className="pt-1">
        <Button variant="outline" disabled={disabled || catalog.workers.length === 0} onClick={onApply}>
          {t('settings.plugins.action.apply')}
        </Button>
      </div>
    </SettingsSection>
  );
};

const NativePluginsPage: React.FC<{ directory: string | null }> = ({ directory }) => {
  const { t } = useI18n();
  const catalog = usePluginsStore(state => state.catalog);
  const loadedDirectory = usePluginsStore(state => state.loadedDirectory);
  const loadedRuntimeKey = usePluginsStore(state => state.loadedRuntimeKey);
  const isLoading = usePluginsStore(state => state.isLoading);
  const loadError = usePluginsStore(state => state.error);
  const isMutating = usePluginsStore(state => state.isMutating);
  const lastMutation = usePluginsStore(state => state.lastMutation);
  const doctor = usePluginsStore(state => state.doctor);
  const [selection, setSelection] = React.useState<PluginSelection | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<PluginDeleteTarget | null>(null);
  const [applyOpen, setApplyOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [operationError, setOperationError] = React.useState<string | null>(null);
  const [marketplaceRefreshing, setMarketplaceRefreshing] = React.useState(false);
  const [doctorRefreshing, setDoctorRefreshing] = React.useState(false);
  const [marketplaceScope, setMarketplaceScope] = React.useState<'user' | 'project'>('project');
  const [marketplaceQuery, setMarketplaceQuery] = React.useState('');

  const current = catalog !== null && loadedDirectory === directory && loadedRuntimeKey === getRuntimeKey();
  const disabled = pending || isMutating || !current;

  React.useEffect(() => { void usePluginsStore.getState().loadPlugins({ directory }); }, [directory]);
  React.useEffect(() => {
    const add = () => setAddOpen(true);
    window.addEventListener('openchamber:settings-open-plugin-add', add);
    return () => window.removeEventListener('openchamber:settings-open-plugin-add', add);
  }, []);

  const run = async (perform: () => Promise<void | PluginMutationResult>) => {
    setPending(true);
    setOperationError(null);
    try {
      await perform();
    } catch (error) {
      setOperationError(error instanceof CanonicalApiError ? error.message : t('settings.plugins.error.operation'));
    } finally {
      setPending(false);
    }
  };

  const plugin = current && selection?.kind === 'plugin'
    ? catalog.plugins.find(entry => entry.id === selection.id)
    : undefined;
  const extension = current && selection?.kind === 'local'
    ? catalog.localExtensions.find(entry => entry.extensionId === selection.extensionId)
    : undefined;
  const deleteName = deleteTarget?.kind === 'plugin' ? deleteTarget.plugin.name : deleteTarget?.extension.extensionId ?? '';

  const marketplaceEntries = React.useMemo(
    () => rankByQuery(catalog?.marketplace ?? [], marketplaceQuery, entry => [entry.name, entry.description, entry.marketplace]),
    [catalog, marketplaceQuery],
  );

  const requestDelete = (target: PluginDeleteTarget) => {
    setOperationError(null);
    setDeleteTarget(target);
  };
  const requestApply = () => {
    setOperationError(null);
    setApplyOpen(true);
  };
  const remove = () => {
    void run(async () => {
      const target = deleteTarget;
      if (!target) return;
      const name = target.kind === 'plugin' ? target.plugin.name : target.extension.extensionId;
      if (target.kind === 'plugin') await usePluginsStore.getState().uninstallPlugin(target.plugin.target);
      else await usePluginsStore.getState().deleteLocalExtension(target.extension.extensionId);
      setDeleteTarget(null);
      setSelection(null);
      toast.success(t('settings.plugins.sidebar.toast.deleted', { name }));
    });
  };
  const refreshMarketplace = async () => {
    setMarketplaceRefreshing(true);
    await run(() => usePluginsStore.getState().loadMarketplace());
    setMarketplaceRefreshing(false);
  };
  const refreshDoctor = async () => {
    setDoctorRefreshing(true);
    await run(() => usePluginsStore.getState().loadDoctor());
    setDoctorRefreshing(false);
  };

  const dialogs = (
    <>
      <AddPluginDialog open={addOpen && current} onOpenChange={setAddOpen} />
      <Dialog open={deleteTarget !== null} onOpenChange={open => { if (!open && !pending) setDeleteTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('settings.plugins.sidebar.deleteDialog.title')}</DialogTitle>
            <DialogDescription>{t('settings.plugins.sidebar.deleteDialog.description', { name: deleteName })}</DialogDescription>
          </DialogHeader>
          {operationError ? <p role="alert" className="typography-meta text-[var(--status-error)]">{operationError}</p> : null}
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(null)} disabled={pending}>
              {t('settings.common.actions.cancel')}
            </Button>
            <Button size="sm" variant="destructive" onClick={remove} disabled={pending}>
              {pending ? t('settings.plugins.sidebar.actions.deleting') : t('settings.common.actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={applyOpen} onOpenChange={open => { if (!open && !pending) setApplyOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('settings.plugins.apply.confirmTitle')}</DialogTitle>
            <DialogDescription>{t('settings.plugins.apply.confirmDescription')}</DialogDescription>
          </DialogHeader>
          {operationError ? <p role="alert" className="typography-meta text-[var(--status-error)]">{operationError}</p> : null}
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setApplyOpen(false)} disabled={pending}>
              {t('settings.common.actions.cancel')}
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => {
                void run(async () => {
                  await usePluginsStore.getState().applyPlugins();
                  setApplyOpen(false);
                });
              }}
            >
              {t('settings.plugins.action.apply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (!current) {
    return (
      <>
        <SettingsPageLayout
          title={t('settings.page.plugins.title')}
          description={t('settings.plugins.grid.description')}
          headerEnd={(
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground"
              onClick={() => void usePluginsStore.getState().loadPlugins({ directory, force: true })}
              disabled={isLoading || !directory}
              aria-label={t('settings.plugins.action.refresh')}
              title={t('settings.plugins.action.refresh')}
            >
              <Icon name="refresh" className={cn('size-4', isLoading && 'animate-spin')} />
            </Button>
          )}
        >
          {isLoading || (!loadError && directory) ? (
            <p role="status" className="flex items-center gap-2 typography-meta text-muted-foreground">
              <Icon name="loader-4" className="size-4 animate-spin" />
              {t('settings.plugins.status.loading')}
            </p>
          ) : null}
          {!directory ? <p className="typography-meta text-muted-foreground">{t('settings.plugins.error.workspaceRequired')}</p> : null}
          {loadError ? (
            <p role="alert" className="typography-meta text-[var(--status-error)]">
              {loadError instanceof CanonicalApiError ? loadError.message : t('settings.plugins.error.operation')}
            </p>
          ) : null}
        </SettingsPageLayout>
        {dialogs}
      </>
    );
  }

  const backButton = <SettingsBackButton label={t('settings.plugins.page.back')} onClick={() => setSelection(null)} />;
  const deleteButton = (target: PluginDeleteTarget) => (
    <Button
      variant="ghost"
      size="xs"
      className="!font-normal text-[var(--status-error)] hover:text-[var(--status-error)]"
      onClick={() => requestDelete(target)}
      disabled={disabled}
    >
      <Icon name="delete-bin" className="size-3.5" />
      {t('settings.common.actions.delete')}
    </Button>
  );

  if (plugin) {
    const details = [plugin.description, ...(plugin.enabledFeatures ?? [])].filter(Boolean).join(' · ');
    return (
      <>
        <SettingsPageLayout
          title={plugin.name}
          titleLeading={backButton}
          headerEnd={deleteButton({ kind: 'plugin', plugin })}
          titleAccessory={<ScopeChip scope={plugin.scope} />}
        >
          <SettingsSection divider={false} contentClassName="space-y-3">
            {operationError ? <p role="alert" className="typography-meta text-[var(--status-error)]">{operationError}</p> : null}
            {lastMutation ? <PluginStatusBanner result={lastMutation} /> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                disabled={disabled}
                onClick={() => void run(() => usePluginsStore.getState().configurePlugin({ target: plugin.target, enabled: !plugin.enabled }))}
              >
                {t(plugin.enabled ? 'settings.plugins.action.disable' : 'settings.plugins.action.enable')}
              </Button>
              <Button
                variant="outline"
                disabled={disabled}
                onClick={() => void run(() => usePluginsStore.getState().updatePlugin(plugin.target))}
              >
                {t('settings.plugins.action.update')}
              </Button>
              <Button variant="destructive" disabled={disabled} onClick={() => requestDelete({ kind: 'plugin', plugin })}>
                {t('settings.plugins.action.uninstall')}
              </Button>
              <Button variant="outline" disabled={disabled || catalog.workers.length === 0} onClick={requestApply}>
                {t('settings.plugins.action.apply')}
              </Button>
            </div>
          </SettingsSection>

          <SettingsSection
            title={t('settings.plugins.page.header.entry')}
            description={details || undefined}
            contentClassName="space-y-0"
          >
            <SettingsFieldRow label={t('settings.plugins.page.field.spec')}>
              <span className="min-w-0 truncate font-mono typography-meta text-foreground">
                {plugin.target.kind === 'package' ? plugin.target.name : `${plugin.target.name} · ${plugin.target.marketplace}`}
              </span>
            </SettingsFieldRow>
            <SettingsFieldRow label={t('settings.openchamber.about.field.version')}>
              <span className="typography-meta text-foreground">{plugin.version || '—'}</span>
            </SettingsFieldRow>
            <SettingsFieldRow label={t('settings.plugins.page.field.scope')}>
              <ScopeChip scope={plugin.scope} />
            </SettingsFieldRow>
          </SettingsSection>

          <SettingsSection
            title={t('settings.plugins.field.globalSettings')}
            settingsItem="plugins.settings"
          >
            <PluginSettingsEditor key={plugin.id} plugin={plugin} disabled={disabled} />
          </SettingsSection>

          <RuntimeSection catalog={catalog} disabled={disabled} onApply={requestApply} />
        </SettingsPageLayout>
        {dialogs}
      </>
    );
  }

  if (extension) {
    return (
      <>
        <SettingsPageLayout
          title={t('settings.plugins.page.header.file')}
          titleLeading={backButton}
          headerEnd={deleteButton({ kind: 'local', extension })}
          titleAccessory={(
            <span className="flex items-center gap-1.5">
              <ScopeChip scope="workspace" />
              <SettingsCardChip>{extension.extensionId}</SettingsCardChip>
            </span>
          )}
        >
          <SettingsSection divider={false} contentClassName="space-y-3">
            {operationError ? <p role="alert" className="typography-meta text-[var(--status-error)]">{operationError}</p> : null}
            {lastMutation ? <PluginStatusBanner result={lastMutation} /> : null}
          </SettingsSection>

          <SettingsSection
            title={t('settings.plugins.local.title')}
            contentClassName="space-y-0"
          >
            <SettingsFieldRow label={t('settings.plugins.page.field.fileName')}>
              <span className="min-w-0 truncate font-mono typography-meta text-foreground">{extension.relativePath}</span>
            </SettingsFieldRow>
          </SettingsSection>

          <SettingsSection
            title={t('settings.plugins.page.field.content')}
            settingsItem="plugins.content"
          >
            <LocalExtensionEditor key={extension.extensionId} extension={extension} revision={catalog.revision} disabled={disabled} />
          </SettingsSection>
        </SettingsPageLayout>
        {dialogs}
      </>
    );
  }

  return (
    <>
      <PluginsGrid
        catalog={catalog}
        refreshing={isLoading || isMutating}
        onRefresh={() => void usePluginsStore.getState().loadPlugins({ directory, force: true })}
        onAdd={() => setAddOpen(true)}
        onSelect={setSelection}
        onDelete={requestDelete}
        notices={(
          <div className="mb-4 space-y-3">
            {loadError ? (
              <p role="alert" className="typography-meta text-[var(--status-error)]">
                {loadError instanceof CanonicalApiError ? loadError.message : t('settings.plugins.error.operation')}
              </p>
            ) : null}
            {operationError ? <p role="alert" className="typography-meta text-[var(--status-error)]">{operationError}</p> : null}
            {lastMutation ? <PluginStatusBanner result={lastMutation} /> : null}
          </div>
        )}
      >
        <SettingsSection
          title={t('settings.plugins.marketplace.title')}
          headerAction={(
            <Button variant="ghost" size="sm" disabled={disabled} onClick={() => void refreshMarketplace()}>
              <Icon name="refresh" className={cn('size-3.5', marketplaceRefreshing && 'animate-spin')} />
              {t('settings.plugins.action.refresh')}
            </Button>
          )}
          contentClassName="space-y-4"
        >
          <SettingsCardSearch
            value={marketplaceQuery}
            onChange={setMarketplaceQuery}
            placeholder={t('settings.plugins.grid.searchPlaceholder')}
          />
          <SettingsFieldRow label={t('settings.plugins.page.field.scope')} settingsItem="plugins.marketplace.scope">
            <Select
              value={marketplaceScope}
              onValueChange={value => {
                if (value === 'user' || value === 'project') setMarketplaceScope(value);
              }}
            >
              <SelectTrigger size={SETTINGS_SELECT_SIZE} aria-label={t('settings.plugins.page.field.scope')}>
                <SelectValue>
                  {marketplaceScope === 'user' ? t('settings.plugins.scope.user') : t('settings.plugins.scope.project')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="project">{t('settings.plugins.scope.project')}</SelectItem>
                <SelectItem value="user">{t('settings.plugins.scope.user')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingsFieldRow>

          {catalog.marketplace.length === 0 ? (
            <p className="py-2 typography-meta text-muted-foreground">{t('settings.plugins.marketplace.empty')}</p>
          ) : marketplaceEntries.length === 0 ? (
            <p className="py-2 typography-meta text-muted-foreground">
              {t('settings.plugins.grid.noMatches', { query: marketplaceQuery.trim() })}
            </p>
          ) : null}

          <div className="space-y-2">
            {marketplaceEntries.map(entry => (
              <div
                key={`${entry.marketplace}:${entry.name}`}
                className="flex items-start justify-between gap-3 rounded-xl border border-[var(--interactive-border)] bg-[var(--surface-elevated)] p-4"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--surface-muted)]">
                    <SettingsCardIcon name="stack" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{entry.name}</p>
                    <p className="line-clamp-2 typography-micro text-muted-foreground">{entry.description}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 typography-micro text-muted-foreground">
                      <span>{entry.version ?? '—'}</span>
                      <SettingsCardChip>{entry.marketplace}</SettingsCardChip>
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => {
                    void run(async () => {
                      await usePluginsStore.getState().installPlugin({
                        kind: 'marketplace',
                        name: entry.name,
                        marketplace: entry.marketplace,
                        scope: marketplaceScope,
                      });
                      toast.success(t('settings.plugins.toast.created'));
                    });
                  }}
                >
                  {t('settings.plugins.action.install')}
                </Button>
              </div>
            ))}
          </div>
        </SettingsSection>

        <SettingsSection
          title={t('settings.plugins.doctor.title')}
          headerAction={(
            <Button variant="ghost" size="sm" disabled={disabled} onClick={() => void refreshDoctor()}>
              <Icon name={doctorRefreshing ? 'loader-4' : 'play'} className={cn('size-3.5', doctorRefreshing && 'animate-spin')} />
              {t('settings.plugins.doctor.run')}
            </Button>
          )}
          contentClassName="space-y-2"
        >
          {doctor?.checks.map((check, index) => (
            <div key={`${check.name}:${index}`} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
              <div className="min-w-0">
                <p className="typography-label text-foreground">{check.name}</p>
                <p className="typography-micro text-muted-foreground mt-0.5 whitespace-pre-wrap break-words">{check.message}</p>
              </div>
              <SettingsCardPill tone={check.status === 'ok' ? 'success' : check.status === 'warning' ? 'warning' : 'error'}>
                {t(check.status === 'ok'
                  ? 'settings.plugins.doctor.status.ok'
                  : check.status === 'warning'
                    ? 'settings.plugins.doctor.status.warning'
                    : 'settings.plugins.doctor.status.error')}
              </SettingsCardPill>
            </div>
          ))}
        </SettingsSection>

        <RuntimeSection catalog={catalog} disabled={disabled} onApply={requestApply} />
      </PluginsGrid>
      {dialogs}
    </>
  );
};

export const PluginsPage: React.FC = () => {
  const directory = useSettingsDirectory();
  return <NativePluginsPage key={JSON.stringify([getRuntimeKey(), directory])} directory={directory} />;
};
