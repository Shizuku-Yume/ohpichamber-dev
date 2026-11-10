import React from 'react';
import {
  JsonObjectSchema,
  JsonValueSchema,
  type InstalledPluginEntry,
  type LocalExtensionEntry,
  type MarketplaceEntry,
  type MarketplacePluginDetails,
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
import { SettingsBackButton, SettingsCardChip, SettingsCardPill, SettingsCardSearch } from '@/components/sections/shared/SettingsCards';
import {
<<<<<<< HEAD
  SETTINGS_SELECT_TRIGGER_CLASS,
  SettingsFieldRow,
  SettingsSection,
  SettingsStackedField,
} from '@/components/sections/shared/SettingsSection';
import { AUTOSAVE_SAVED, AUTOSAVE_UNCHANGED, autosaveFailed, useAutosave, type AutosaveResult } from '@/components/sections/shared/SettingsAutosave';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useI18n } from '@/lib/i18n';
=======
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AddPluginDialog } from './AddPluginDialog';
import { PluginsGrid, type PluginDeleteTarget } from './PluginsGrid';
import { SettingsSection } from '@/components/sections/shared/SettingsSection';
import { useIntegrationPolicyState } from '@/components/sections/shared/useIntegrationPolicyBlock';
import {
  useAutosave,
  AUTOSAVE_SAVED,
  AUTOSAVE_UNCHANGED,
  autosaveFailed,
  type AutosaveResult,
} from '@/components/sections/shared/SettingsAutosave';
>>>>>>> bc50ba56a
import { getRuntimeKey } from '@/lib/runtime-switch';
import { rankByQuery } from '@/lib/search/fuzzySearch';
import { cn } from '@/lib/utils';
import { usePluginsStore } from '@/stores/usePluginsStore';
import { AddPluginDialog } from './AddPluginDialog';
import { PluginsGrid, pluginUpdateFor, type PluginDeleteTarget, type PluginSelection } from './PluginsGrid';
import { MarketplaceSourcesDialog } from './MarketplaceSourcesDialog';
import { ExtensionControlCenter } from './ExtensionControlCenter';
import { PluginStatusBanner } from './PluginStatusBanner';

const parseSettings = (text: string) => {
  try {
    return JsonObjectSchema.safeParse(JSON.parse(text.trim() === '' ? '{}' : text));
  } catch {
    return JsonObjectSchema.safeParse(null);
  }
};


/** Counts a declared capability without expanding its shape: a string is one item, a list/map is its length. */
const capabilityCount = (value: MarketplacePluginDetails[keyof MarketplacePluginDetails]): number => {
  if (typeof value === 'string') return 1;
  if (Array.isArray(value)) return value.length;
  if (value !== null && typeof value === 'object') return Object.keys(value).length;
  return 0;
};
const detailList = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
};

const ExternalDetailLink: React.FC<{ href: string; label: string }> = ({ href, label }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="flex min-w-0 items-center gap-1 typography-meta text-[var(--status-info)] hover:underline"
    title={href}
  >
    <span className="shrink-0">{label}</span>
    <span className="truncate font-mono typography-micro">{href}</span>
  </a>
);

const CAPABILITY_LABEL = {
  commands: 'settings.plugins.details.commands',
  agents: 'settings.plugins.details.agents',
  hooks: 'settings.plugins.details.hooks',
  mcpServers: 'settings.plugins.details.mcpServers',
  lspServers: 'settings.plugins.details.lspServers',
  dapAdapters: 'settings.plugins.details.dapAdapters',
} as const;

/** Manifest details published by the marketplace catalog; absent details stay absent rather than invented. */
const MarketplaceDetailsSection: React.FC<{ entry: MarketplaceEntry | undefined }> = ({ entry }) => {
  const { t } = useI18n();
  const details = entry?.details;
  if (!details) {
    return (
      <SettingsSection title={t('settings.plugins.details.title')} contentClassName="space-y-0">
        <p className="typography-meta text-muted-foreground">{t('settings.plugins.details.none')}</p>
      </SettingsSection>
    );
  }
  const categories = [details.category, ...(details.tags ?? [])].filter((value): value is string => Boolean(value));
  const capabilities = ([
    ['commands', details.commands], ['agents', details.agents], ['hooks', details.hooks],
    ['mcpServers', details.mcpServers], ['lspServers', details.lspServers], ['dapAdapters', details.dapAdapters],
  ] as const).filter(([, value]) => capabilityCount(value) > 0);

  return (
    <SettingsSection title={t('settings.plugins.details.title')} contentClassName="space-y-0">
      {details.author ? (
        <SettingsFieldRow label={t('settings.plugins.details.author')}>
          <span className="min-w-0 truncate typography-meta text-foreground">
            {details.author.name}
            {details.author.email ? ` · ${details.author.email}` : ''}
          </span>
        </SettingsFieldRow>
      ) : null}
      {details.license ? (
        <SettingsFieldRow label={t('settings.plugins.details.license')}>
          <span className="typography-meta text-foreground">{details.license}</span>
        </SettingsFieldRow>
      ) : null}
      {details.repository ? (
        <SettingsFieldRow label={t('settings.plugins.details.repository')}>
          <ExternalDetailLink href={details.repository} label={t('settings.plugins.details.repository')} />
        </SettingsFieldRow>
      ) : null}
      {details.homepage ? (
        <SettingsFieldRow label={t('settings.plugins.details.homepage')}>
          <ExternalDetailLink href={details.homepage} label={t('settings.plugins.details.homepage')} />
        </SettingsFieldRow>
      ) : null}
      {categories.length > 0 ? (
        <SettingsFieldRow label={t('settings.plugins.details.category')} alignEnd>
          <span className="flex min-w-0 flex-wrap justify-end gap-1">
            {categories.map(category => (
              <SettingsCardChip key={category}>{category}</SettingsCardChip>
            ))}
          </span>
        </SettingsFieldRow>
      ) : null}
      {(details.keywords ?? []).length > 0 ? (
        <SettingsFieldRow label={t('settings.plugins.details.keywords')} alignEnd>
          <span className="flex min-w-0 flex-wrap justify-end gap-1">
            {(details.keywords ?? []).slice(0, 12).map(keyword => (
              <SettingsCardChip key={keyword}>{keyword}</SettingsCardChip>
            ))}
          </span>
        </SettingsFieldRow>
      ) : null}
      {capabilities.map(([key, value]) => (
        <SettingsFieldRow
          key={key}
          label={t(CAPABILITY_LABEL[key])}
          description={detailList(value).slice(0, 6).join(', ') || undefined}
        >
          <span className="typography-meta tabular-nums text-foreground">{capabilityCount(value)}</span>
        </SettingsFieldRow>
      ))}
    </SettingsSection>
  );
};

const ScopeChip: React.FC<{ scope: InstalledPluginEntry['scope'] }> = ({ scope }) => {
  const { t } = useI18n();
  return (
    <SettingsCardChip>
      {t(scope === 'workspace' ? 'settings.plugins.scope.workspace' : 'settings.plugins.scope.global')}
    </SettingsCardChip>
  );
};

<<<<<<< HEAD
const PluginSettingsEditor: React.FC<{ plugin: InstalledPluginEntry; disabled: boolean }> = ({ plugin, disabled }) => {
  const { t } = useI18n();
  const baseline = React.useRef(JSON.stringify(plugin.globalSettings, null, 2));
  const [text, setText] = React.useState(baseline.current);
  const [secrets, setSecrets] = React.useState(() => new Map<string, string>());
=======
  const projectDirectory = useProjectsStore((state) => state.getActiveProject()?.path);
  const configDirectory = projectDirectory?.trim() || getPluginsConfigDirectory();
  const loadedDirectory = usePluginsStore((state) => state.loadedDirectory);
  const loadedRuntimeKey = usePluginsStore((state) => state.loadedRuntimeKey);
  const catalogIsCurrent = loadedDirectory === configDirectory && loadedRuntimeKey === getRuntimeKey();
  const selectedId = usePluginsStore((s) => s.selectedId);
  const entries = usePluginsStore((s) => s.entries);
  const files = usePluginsStore((s) => s.files);
  const draft = usePluginsStore((s) => s.draft);
  const setDraft = usePluginsStore((s) => s.setDraft);
  const updateEntry = usePluginsStore((s) => s.updateEntry);
  const updateFile = usePluginsStore((s) => s.updateFile);
  const readFile = usePluginsStore((s) => s.readFile);
  const setSelected = usePluginsStore((s) => s.setSelected);
  const deleteEntry = usePluginsStore((s) => s.deleteEntry);
  const deleteFile = usePluginsStore((s) => s.deleteFile);
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<PluginDeleteTarget | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  // The switch that writes these policies lives in the grid, so this reads the
  // same revision the grid and config events bump; otherwise the page keeps an
  // old deny after the plugin is on again.
  const policyRevision = usePluginsStore((state) => state.policyRevision);
  const policy = useIntegrationPolicyState(configDirectory, policyRevision);
>>>>>>> bc50ba56a

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
            <p className="typography-ui-label text-foreground">{t('settings.plugins.page.header.file')}</p>
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
    <SettingsSection title={t('settings.plugins.runtime.title')} contentClassName="space-y-4">
      {catalog.workers.length === 0 ? (
        <p className="typography-meta text-muted-foreground">{t('settings.plugins.apply.noActiveWorkers')}</p>
      ) : (
        <div className="divide-y divide-[var(--surface-subtle)]">
          {catalog.workers.map(worker => (
            <div key={`${worker.worker.rootSessionId}:${worker.worker.workerGeneration}`} className="flex items-start justify-between gap-3 py-2">
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
        </div>
      )}
      <Button variant="outline" disabled={disabled || catalog.workers.length === 0} onClick={onApply}>
        {t('settings.plugins.action.apply')}
      </Button>
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
  const extensions = usePluginsStore(state => state.extensions);
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
  const [marketplaceFacet, setMarketplaceFacet] = React.useState<string | null>(null);
  const [upgradingAll, setUpgradingAll] = React.useState(false);
  const [sourcesOpen, setSourcesOpen] = React.useState(false);

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

  /** Categories and keywords the configured catalogs actually publish, deduplicated across marketplaces. */
  const marketplaceFacets = React.useMemo(() => {
    const facets = new Set<string>();
    for (const entry of catalog?.marketplace ?? []) {
      if (entry.details?.category) facets.add(entry.details.category);
      for (const keyword of entry.details?.keywords ?? []) facets.add(keyword);
    }
    return [...facets].sort((left, right) => left.localeCompare(right));
  }, [catalog]);
  const marketplaceEntries = React.useMemo(() => {
    const scoped = marketplaceFacet === null ? catalog?.marketplace ?? []
      : (catalog?.marketplace ?? []).filter(entry => entry.details?.category === marketplaceFacet
        || (entry.details?.keywords ?? []).includes(marketplaceFacet));
    return rankByQuery(scoped, marketplaceQuery, entry => [entry.name, entry.description, entry.marketplace,
    entry.details?.category ?? '', ...(entry.details?.keywords ?? []), entry.details?.author?.name ?? '']);
  }, [catalog, marketplaceFacet, marketplaceQuery]);

  const requestDelete = (target: PluginDeleteTarget) => {
    setOperationError(null);
    setDeleteTarget(target);
  };

  /**
    * Extension switches live in native settings, so a refused revision has to
    * surface as an operation error instead of quietly re-reading a new one.
    */
  const toggleExtensionProvider = (providerId: string, enabled: boolean) => run(async () => {
    await usePluginsStore.getState().toggleExtensionProvider(providerId, enabled);
  });
  const toggleExtensionUserSource = (providerId: string, enabled: boolean) => run(async () => {
    await usePluginsStore.getState().toggleExtensionUserSource(providerId, enabled);
  });
  const toggleExtensionItem = (providerId: string, extensionId: string, enabled: boolean) => run(async () => {
    await usePluginsStore.getState().toggleExtensionItem(providerId, extensionId, enabled);
  });
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
  const updatePlugin = async (plugin: InstalledPluginEntry) => {
    await run(async () => {
      await usePluginsStore.getState().updatePlugin(plugin.target);
      toast.success(t('settings.plugins.update.toast.done', { name: plugin.name }));
    });
  };
  const upgradeAll = async () => {
    setUpgradingAll(true);
    await run(async () => {
      const updates = catalog?.availableUpdates ?? [];
      const result = await usePluginsStore.getState().upgradeAllPlugins();
      if (updates.length === 0) toast.success(t('settings.plugins.upgradeAll.toast.none'));
      else toast.success(t('settings.plugins.upgradeAll.toast.done', { count: updates.length }));
      return result;
    });
    setUpgradingAll(false);
  };
  const refreshDoctor = async () => {
    setDoctorRefreshing(true);
    await run(() => usePluginsStore.getState().loadDoctor());
    setDoctorRefreshing(false);
  };

  const dialogs = (
    <>
      <AddPluginDialog open={addOpen && current} onOpenChange={setAddOpen} />
      <MarketplaceSourcesDialog open={sourcesOpen && current} onOpenChange={setSourcesOpen} />
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
      className="text-[var(--status-error)] hover:text-[var(--status-error)]"
      onClick={() => requestDelete(target)}
      disabled={disabled}
    >
      <Icon name="delete-bin" className="size-3.5" />
      {t('settings.common.actions.delete')}
    </Button>
  );

<<<<<<< HEAD
  if (plugin) {
    const details = [plugin.description, ...(plugin.enabledFeatures ?? [])].filter(Boolean).join(' · ');
    const update = pluginUpdateFor(catalog.availableUpdates, plugin);
    const marketplaceTarget = plugin.target.kind === 'marketplace' ? plugin.target : undefined;
    const marketplaceEntry = marketplaceTarget === undefined ? undefined
      : catalog.marketplace.find(entry => entry.name === marketplaceTarget.name && entry.marketplace === marketplaceTarget.marketplace);
    return (
      <>
        <SettingsPageLayout
          title={plugin.name}
          titleLeading={backButton}
          headerEnd={deleteButton({ kind: 'plugin', plugin })}
          titleAccessory={<ScopeChip scope={plugin.scope} />}
=======
  if (selectedEntry && draft && draft.mode === 'entry') {
    const optionsResult = parseOptionsJson(draft.optionsJson);
    const optionsValid = optionsResult.ok;
    // A row switched off here stays silent: the list already carries that
    // state on its switch. Only a rule the user wrote themselves needs a
    // sentence, because nothing on this page can flip it.
    const blockedByConfig = selectedEntry.policyResource
      ? policy.status === 'ready' && selectedEntry.switchState !== 'off' && policy.isBlockedByRule(selectedEntry.policyResource)
      : false;

    return (
      <>
      <SettingsPageLayout
        title={t('settings.plugins.page.header.entry')}
        titleLeading={backButton}
        headerEnd={deleteButton}
        titleAccessory={(
          <ScopeBadge
            scope={selectedEntry.scope}
            label={
              selectedEntry.scope === 'project'
                ? t('settings.plugins.sidebar.group.projectEntries')
                : t('settings.plugins.sidebar.group.userEntries')
            }
          />
        )}
        onBlurCapture={autosave.onBlurCapture}
      >
        <SettingsSection divider={false}>
          <div className="flex flex-col gap-3">
            <PluginStatusBanner target={selectedEntryTarget} name={selectedEntry.spec} />
            {blockedByConfig ? (
              <p className="typography-meta text-muted-foreground">{t('settings.plugins.switch.blockedByConfig')}</p>
            ) : null}
            <RegistryBanner entryId={selectedEntry.id} spec={selectedEntry.spec} />
          </div>
        </SettingsSection>

        <SettingsSection
          title={t('settings.plugins.page.field.spec')}
          settingsItem="plugins.spec"
>>>>>>> bc50ba56a
        >
          <SettingsSection divider={false} contentClassName="space-y-3">
            {operationError ? <p role="alert" className="typography-meta text-[var(--status-error)]">{operationError}</p> : null}
            {lastMutation ? <PluginStatusBanner result={lastMutation} /> : null}
            {update ? (
              <p className="typography-meta text-[var(--status-info)]">
                {t('settings.plugins.update.badge', { from: update.from, to: update.to })}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                disabled={disabled}
                onClick={() => void run(() => usePluginsStore.getState().configurePlugin({ target: plugin.target, enabled: !plugin.enabled }))}
              >
                {t(plugin.enabled ? 'settings.plugins.action.disable' : 'settings.plugins.action.enable')}
              </Button>
              {plugin.target.kind === 'marketplace' ? (
                <Button variant="outline" disabled={disabled} onClick={() => void updatePlugin(plugin)}>
                  {t('settings.plugins.action.update')}
                </Button>
              ) : null}
              <Button variant="destructive" disabled={disabled} onClick={() => requestDelete({ kind: 'plugin', plugin })}>
                {t('settings.plugins.action.uninstall')}
              </Button>
              <Button variant="outline" disabled={disabled || catalog.workers.length === 0} onClick={requestApply}>
                {t('settings.plugins.action.apply')}
              </Button>
            </div>
          </SettingsSection>

<<<<<<< HEAD
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

          {plugin.target.kind === 'marketplace' ? <MarketplaceDetailsSection entry={marketplaceEntry} /> : null}

          <SettingsSection
            title={t('settings.plugins.field.globalSettings')}
            settingsItem="plugins.settings"
          >
            <PluginSettingsEditor key={plugin.id} plugin={plugin} disabled={disabled} />
          </SettingsSection>

          <RuntimeSection catalog={catalog} disabled={disabled} onApply={requestApply} />
        </SettingsPageLayout>
        {dialogs}
=======
        <SettingsSection
          title={t('settings.plugins.page.field.options')}
          settingsItem="plugins.options"
        >
          <Textarea
            dir="ltr"
            value={draft.optionsJson}
            onChange={(e) =>
              setDraft({ ...draft, optionsJson: e.target.value })
            }
            rows={10}
            className={cn(
              'font-mono typography-meta min-h-[200px]',
              !optionsValid && 'border-[var(--status-error-border)]',
            )}
            spellCheck={false}
            placeholder='{ }'
          />
          {!optionsValid && (
            <p className="typography-micro text-[var(--status-error)]">
              {t('settings.plugins.page.field.options.invalidJson')}
            </p>
          )}
        </SettingsSection>
      </SettingsPageLayout>
      {dialogs}
>>>>>>> bc50ba56a
      </>
    );
  }

<<<<<<< HEAD
  if (extension) {
=======
  if (selectedFile && draft && draft.mode === 'file') {
    const blockedByConfig = selectedFile.policyResource
      ? policy.status === 'ready' && selectedFile.switchState !== 'off' && policy.isBlockedByRule(selectedFile.policyResource)
      : false;

>>>>>>> bc50ba56a
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
<<<<<<< HEAD
          )}
=======
          </>
        )}
        onBlurCapture={autosave.onBlurCapture}
      >
        <SettingsSection divider={false}>
          <div className="flex flex-col gap-3">
            <PluginStatusBanner target={selectedFileTarget} name={selectedFile.fileName} />
            {blockedByConfig ? (
              <p className="typography-meta text-muted-foreground">{t('settings.plugins.switch.blockedByConfig')}</p>
            ) : null}
          </div>
        </SettingsSection>

        <SettingsSection
          title={t('settings.plugins.page.field.content')}
          settingsItem="plugins.content"
>>>>>>> bc50ba56a
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
        upgradingAll={upgradingAll}
        onRefresh={() => void usePluginsStore.getState().loadPlugins({ directory, force: true })}
        onAdd={() => setAddOpen(true)}
        onSelect={setSelection}
        onDelete={requestDelete}
        onUpdate={plugin => void updatePlugin(plugin)}
        onUpgradeAll={() => void upgradeAll()}
        notices={(
          <div className="mb-4 space-y-3">
            {loadError ? (
              <p role="alert" className="typography-meta text-[var(--status-error)]">
                {loadError instanceof CanonicalApiError ? loadError.message : t('settings.plugins.error.operation')}
              </p>
            ) : null}
            {operationError ? <p role="alert" className="typography-meta text-[var(--status-error)]">{operationError}</p> : null}
            {lastMutation ? <PluginStatusBanner result={lastMutation} /> : null}
            {extensions === null ? (
              <p role="status" className="flex items-center gap-2 typography-meta text-muted-foreground">
                <Icon name="loader-4" className="size-4 animate-spin" />
                {t('settings.plugins.status.loading')}
              </p>
            ) : (
              <ExtensionControlCenter
                inventory={extensions}
                disabled={disabled}
                onToggleProvider={(providerId, enabled) => void toggleExtensionProvider(providerId, enabled)}
                onToggleUserSource={(providerId, enabled) => void toggleExtensionUserSource(providerId, enabled)}
                onToggleItem={(providerId, extensionId, enabled) => void toggleExtensionItem(providerId, extensionId, enabled)}
              />
            )}
          </div>
        )}
      >
        <SettingsSection
          title={t('settings.plugins.marketplace.title')}
          headerAction={(
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" disabled={disabled} onClick={() => void refreshMarketplace()}>
                <Icon name="refresh" className={cn('size-3.5', marketplaceRefreshing && 'animate-spin')} />
                {t('settings.plugins.action.refresh')}
              </Button>
              <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setSourcesOpen(true)}>
                <Icon name="settings-3" className="size-3.5" />
                {t('settings.plugins.marketplace.sourcesButton')}
              </Button>
            </div>
          )}
          contentClassName="space-y-4"
        >
          {catalog.marketplaceSources.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {catalog.marketplaceSources.map(source => (
                <SettingsCardChip key={source.name}>{source.name}</SettingsCardChip>
              ))}
            </div>
          ) : null}
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
              <SelectTrigger className={SETTINGS_SELECT_TRIGGER_CLASS} aria-label={t('settings.plugins.page.field.scope')}>
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

          {marketplaceFacets.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              <Button
                variant="chip"
                size="xs"
                aria-pressed={marketplaceFacet === null}
                onClick={() => setMarketplaceFacet(null)}
              >
                {t('settings.plugins.marketplace.allCategories')}
              </Button>
              {marketplaceFacets.map(facet => (
                <Button
                  key={facet}
                  variant="chip"
                  size="xs"
                  aria-pressed={marketplaceFacet === facet}
                  onClick={() => setMarketplaceFacet(current => current === facet ? null : facet)}
                >
                  {facet}
                </Button>
              ))}
            </div>
          ) : null}

          {catalog.marketplace.length === 0 ? (
            <p className="py-2 typography-meta text-muted-foreground">{t('settings.plugins.marketplace.empty')}</p>
          ) : marketplaceEntries.length === 0 ? (
            <p className="py-2 typography-meta text-muted-foreground">
              {t('settings.plugins.grid.noMatches', { query: marketplaceQuery.trim() })}
            </p>
          ) : null}

          <div className="divide-y divide-[var(--surface-subtle)]">
            {marketplaceEntries.map(entry => (
              <div key={`${entry.marketplace}:${entry.name}`} className="flex min-w-0 flex-col gap-2 py-3 @xl:flex-row @xl:items-start @xl:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="truncate typography-ui-label text-foreground">{entry.name}</p>
                    <span className="shrink-0 font-mono typography-micro text-muted-foreground">{entry.version ?? '—'}</span>
                    <SettingsCardChip>{entry.marketplace}</SettingsCardChip>
                  </div>
                  {entry.description ? <p className="line-clamp-2 typography-micro text-muted-foreground">{entry.description}</p> : null}
                  {[entry.details?.category, ...(entry.details?.keywords ?? [])].filter((value): value is string => Boolean(value)).length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {[entry.details?.category, ...(entry.details?.keywords ?? [])].filter((value): value is string => Boolean(value)).slice(0, 6).map(badge => (
                        <span key={badge} className="oc-tile-inset rounded-full px-2 py-px text-[0.625rem] text-muted-foreground">{badge}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={disabled}
                  onClick={() => {
                    void run(async () => {
                      await usePluginsStore.getState().installPlugin({
                        kind: 'marketplace',
                        name: entry.name,
                        marketplace: entry.marketplace,
                        scope: marketplaceScope,
                      });
                      toast.success(t('settings.plugins.marketplace.toast.installed', { name: entry.name }));
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
          <div className="divide-y divide-[var(--surface-subtle)]">
            {doctor?.checks.map((check, index) => (
              <div key={`${check.name}:${index}`} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="typography-ui-label text-foreground">{check.name}</p>
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
          </div>
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
