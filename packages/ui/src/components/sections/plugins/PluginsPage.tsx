import React from 'react';
import {
  JsonObjectSchema,
  JsonValueSchema,
  type InstalledPluginEntry,
  type JsonObject,
  type LocalExtensionEntry,
  type MarketplaceEntry,
  type MarketplacePluginDetails,
  type PluginMutationResult,
  type PluginLifecycleState,
  type PluginScope,
  type PluginUpdateCheckEntry,
} from '@openchamber/agent-contract';
import { CanonicalApiError } from '@/api/canonicalClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/icon/Icon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { SETTINGS_CARD_GRID_CLASS, SettingsAddCard, SettingsBackButton, SettingsCard, type SettingsCardAction, SettingsCardChip, SettingsCardIcon, SettingsCardPill, SettingsCardToolbar } from '@/components/sections/shared/SettingsCards';
import {
  SETTINGS_SELECT_TRIGGER_CLASS,
  SETTINGS_SPACE_ROW_CLASS,
  SettingsCheckboxRow,
  SettingsChipGroup,
  SettingsControlGroup,
  SettingsFieldRow,
  SETTINGS_HELPER_CLASS,
  SettingsSection,
  SettingsStackedField,
} from '@/components/sections/shared/SettingsSection';
import { AUTOSAVE_SAVED, AUTOSAVE_UNCHANGED, autosaveFailed, useAutosave, type AutosaveResult } from '@/components/sections/shared/SettingsAutosave';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useI18n } from '@/lib/i18n';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { rankByQuery } from '@/lib/search/fuzzySearch';
import { cn } from '@/lib/utils';
import { usePluginsStore } from '@/stores/usePluginsStore';
import { AddPluginDialog } from './AddPluginDialog';
import { MarketplaceSourcesDialog } from './MarketplaceSourcesDialog';
import { ExtensionControlCenter } from './ExtensionControlCenter';
import { problemMessage } from '@/lib/problemMessage';

type PluginSelection = { kind: 'plugin'; id: string } | { kind: 'local'; extensionId: string };
type DeleteTarget = { kind: 'plugin'; plugin: InstalledPluginEntry } | { kind: 'local'; extension: LocalExtensionEntry };

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

/** Native scopes (`user`/`project`) and contract scopes (`global`/`workspace`) name the same install. */
const updateFor = (
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

const CAPABILITY_KEYS = ['commands', 'agents', 'hooks', 'mcpServers', 'lspServers', 'dapAdapters'] as const;

/** The manifest details of an installed marketplace plugin; a plugin installed from a package has none. */
const marketplaceDetailsFor = (marketplace: readonly MarketplaceEntry[], plugin: InstalledPluginEntry): MarketplacePluginDetails | undefined => {
  if (plugin.target.kind !== 'marketplace') return undefined;
  const target = plugin.target;
  return marketplace.find(entry => entry.name === target.name && entry.marketplace === target.marketplace)?.details;
};

/** Declared capability counts as label and number chips. A capability the manifest does not declare is not shown. */
const CapabilityChips: React.FC<{ details: MarketplacePluginDetails | undefined }> = ({ details }) => {
  const { t } = useI18n();
  if (!details) return null;
  const counted = CAPABILITY_KEYS.map(key => ({ key, count: capabilityCount(details[key]) })).filter(({ count }) => count > 0);
  if (counted.length === 0) return null;
  // A shrinkable wrapping row: a card footer with many kinds wraps them instead of running into the enable control.
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {counted.map(({ key, count }) => (
        <SettingsCardChip key={key}>
          <span>{t(CAPABILITY_LABEL[key])}</span>
          <span className="tabular-nums">{count}</span>
        </SettingsCardChip>
      ))}
    </div>
  );
};

/** Manifest details published by the marketplace catalog; absent details stay absent rather than invented. */
const MarketplaceDetailsSection: React.FC<{ entry: MarketplaceEntry | undefined }> = ({ entry }) => {
  const { t } = useI18n();
  const details = entry?.details;
  if (!details) {
    return (
      <SettingsSection title={t('settings.plugins.details.title')}>
        <p className="typography-meta text-muted-foreground">{t('settings.plugins.details.none')}</p>
      </SettingsSection>
    );
  }
  const categories = [details.category, ...(details.tags ?? [])].filter((value): value is string => Boolean(value));
  // A capability the manifest does not declare is not a row: the list states
  // what the plugin carries, not what it lacks.
  const capabilities = ([
    ['commands', details.commands], ['agents', details.agents], ['hooks', details.hooks],
    ['mcpServers', details.mcpServers], ['lspServers', details.lspServers], ['dapAdapters', details.dapAdapters],
  ] as const).filter(([, value]) => capabilityCount(value) > 0);

  return (
    <SettingsSection title={t('settings.plugins.details.title')}>
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

const PluginSettingsEditor: React.FC<{
  plugin: InstalledPluginEntry; disabled: boolean; scope: PluginScope; values: JsonObject;
}> = ({ plugin, disabled, scope, values }) => {
  const { t } = useI18n();
  const baseline = React.useRef(JSON.stringify(values, null, 2));
  const [text, setText] = React.useState(baseline.current);
  const [secrets, setSecrets] = React.useState(() => new Map<string, string>());

  React.useEffect(() => {
    const next = JSON.stringify(values, null, 2);
    const previousBaseline = baseline.current;
    setText(previous => previous === previousBaseline ? next : previous);
    baseline.current = next;
  }, [values]);

  const parsed = parseSettings(text);
  const secretKeys = parsed.success
    ? plugin.settingDefinitions.filter(setting => setting.secret && Object.hasOwn(parsed.data, setting.key)).map(setting => setting.key)
    : [];
  const invalid = !parsed.success || secretKeys.length > 0;
  const secretDefinitions = scope === 'global' ? plugin.settingDefinitions.filter(setting => setting.secret) : [];
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
        } catch (error) {
          return autosaveFailed(problemMessage(error, t('settings.plugins.page.field.options.invalidJson')));
        }
      }
    }

    const submitted = text;
    const submittedSecrets = new Map(secrets);
    const result = await usePluginsStore.getState().configurePlugin({ target: plugin.target, settingsScope: scope, settings });
    const updated = result.catalog.plugins.find(entry => entry.id === plugin.id);
    if (!updated) return autosaveFailed(t('settings.plugins.error.operation'));

    const normalized = JSON.stringify(scope === 'global' ? updated.globalSettings : settings, null, 2);
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
    <div onBlurCapture={autosave.onBlurCapture} className={SETTINGS_SPACE_ROW_CLASS}>
      <div className="space-y-1" data-settings-item="plugins.options">
        <Textarea
          id={scope === 'global' ? 'native-plugin-settings' : 'native-plugin-project-settings'}
          value={text}
          onChange={event => setText(event.target.value)}
          rows={12}
          className="w-full font-mono typography-meta min-h-[200px]"
          spellCheck={false}
          aria-label={t(scope === 'global' ? 'settings.plugins.field.globalSettings' : 'settings.plugins.field.projectSettings')}
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
          info={setting.description}
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

      {hasOverrides && scope === 'global' ? (
        <SettingsStackedField
          settingsItem="plugins.effectiveSettings"
          label={t('settings.plugins.field.effectiveSettings')}
          info={t('settings.plugins.field.projectOverride')}
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

const PluginConfiguration: React.FC<{
  plugin: InstalledPluginEntry; revision: string; workspaceId: string; disabled: boolean;
  run: (perform: () => Promise<PluginMutationResult>) => Promise<void>;
}> = ({ plugin, revision, workspaceId, disabled, run }) => {
  const { t } = useI18n();
  const [scope, setScope] = React.useState<PluginScope>('global');
  const [lifecycle, setLifecycle] = React.useState<PluginLifecycleState | null>(null);
  React.useEffect(() => {
    let active = true;
    void usePluginsStore.getState().readPluginLifecycle().then(result => {
      if (active) setLifecycle(result);
    }, () => {
      if (active) setLifecycle(null);
    });
    return () => { active = false; };
  }, [revision, workspaceId]);

  const details = lifecycle?.workspaceId === workspaceId ? lifecycle.plugins.find(entry => entry.id === plugin.id) : undefined;
  const ready = lifecycle?.revision === revision && details !== undefined;
  const projectWritable = lifecycle?.projectWritable === true && details?.workspaceWritable === true;
  const activeScope = projectWritable ? scope : 'global';
  const selection = activeScope === 'global' ? details?.globalFeatures : details?.workspaceFeatures;
  const available = details?.availableFeatures ?? [];
  const selected = selection ?? (activeScope === 'workspace' ? details?.globalFeatures : null)
    ?? available.filter(feature => feature.defaultEnabled).map(feature => feature.name);
  const featureWrite = (enabledFeatures: string[] | null) => void run(() => usePluginsStore.getState().configurePlugin({
    target: plugin.target, settingsScope: activeScope, enabledFeatures
  }));

  return (
    <div className={SETTINGS_SPACE_ROW_CLASS}>
      {projectWritable ? (
        <SettingsFieldRow label={t('settings.plugins.page.field.scope')}>
          <SettingsChipGroup<PluginScope>
            aria-label={t('settings.plugins.page.field.scope')}
            value={activeScope}
            onChange={setScope}
            options={[
              { value: 'global', label: t('settings.plugins.scope.global'), disabled },
              { value: 'workspace', label: t('settings.plugins.scope.project'), disabled: disabled || !ready }
            ]}
          />
        </SettingsFieldRow>
      ) : null}
      {ready && lifecycle?.projectWriteBlock === 'registry-root-change' ? (
        <p className="typography-meta text-muted-foreground">{t('settings.plugins.projectOverrides.registryRootChange')}</p>
      ) : null}
      {available.length > 0 && (activeScope === 'workspace' || details?.globalFeaturesWritable) ? (
        <SettingsControlGroup title={t('settings.plugins.section.features')}>
          {available.map(feature => (
            <SettingsCheckboxRow key={feature.name} label={feature.name} ariaLabel={feature.name} info={feature.description}
              checked={selected.includes(feature.name)} disabled={disabled || !ready}
              onChange={checked => {
                const next = new Set(selected);
                if (checked) next.add(feature.name);
                else next.delete(feature.name);
                featureWrite(available.filter(item => next.has(item.name)).map(item => item.name));
              }}
            />
          ))}
          <Button variant="outline" disabled={disabled || !ready || selection == null} onClick={() => featureWrite(null)}>
            {t('settings.common.actions.reset')}
          </Button>
        </SettingsControlGroup>
      ) : null}
      <div hidden={activeScope !== 'global'}>
        <PluginSettingsEditor plugin={plugin} disabled={disabled} scope="global" values={plugin.globalSettings} />
      </div>
      {projectWritable && details ? (
        <div hidden={activeScope !== 'workspace'}>
          <PluginSettingsEditor plugin={plugin} disabled={disabled || !ready} scope="workspace" values={details.projectSettings} />
        </div>
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
    <div className={SETTINGS_SPACE_ROW_CLASS} onBlurCapture={autosave.onBlurCapture}>
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

const NativePluginsPage: React.FC<{ directory: string | null }> = ({ directory }) => {
  const { t } = useI18n();
  const catalog = usePluginsStore(state => state.catalog);
  const loadedDirectory = usePluginsStore(state => state.loadedDirectory);
  const loadedRuntimeKey = usePluginsStore(state => state.loadedRuntimeKey);
  const isLoading = usePluginsStore(state => state.isLoading);
  const loadError = usePluginsStore(state => state.error);
  const isMutating = usePluginsStore(state => state.isMutating);
  const lastMutation = usePluginsStore(state => state.lastMutation);
  const extensions = usePluginsStore(state => state.extensions);
  const [selection, setSelection] = React.useState<PluginSelection | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null);
  const [applyOpen, setApplyOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [operationError, setOperationError] = React.useState<string | null>(null);
  const [marketplaceRefreshing, setMarketplaceRefreshing] = React.useState(false);
  const [marketplaceScope, setMarketplaceScope] = React.useState<'user' | 'project'>('project');
  const [marketplaceQuery, setMarketplaceQuery] = React.useState('');
  const [marketplaceCategory, setMarketplaceCategory] = React.useState<string | null>(null);
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

  const marketplaceEntries = React.useMemo(
    () => rankByQuery(catalog?.marketplace ?? [], marketplaceQuery, entry => [
      entry.name, entry.description, entry.marketplace,
      entry.details?.category ?? '', ...(entry.details?.keywords ?? []), entry.details?.author?.name ?? '',
    ]).filter(entry => marketplaceCategory === null || [entry.details?.category, ...(entry.details?.tags ?? [])].includes(marketplaceCategory)),
    [catalog, marketplaceQuery, marketplaceCategory],
  );
  const marketplaceCategories = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of catalog?.marketplace ?? []) {
      const categories = [entry.details?.category, ...(entry.details?.tags ?? [])].filter((value): value is string => Boolean(value));
      for (const category of new Set(categories)) counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return [...counts].sort(([left, leftCount], [right, rightCount]) => rightCount - leftCount || left.localeCompare(right));
  }, [catalog]);
  // A category the catalog no longer has would filter out every plugin and hide the chip row that holds the reset, so it is cleared.
  React.useEffect(() => {
    if (marketplaceCategory !== null && !marketplaceCategories.some(([category]) => category === marketplaceCategory)) setMarketplaceCategory(null);
  }, [marketplaceCategories, marketplaceCategory]);
  // A marketplace entry is installed only in the scope it was installed into:
  // the same plugin can be installed globally and again for one project.
  const installedMarketplaceKeys = React.useMemo(() => new Set((catalog?.plugins ?? []).flatMap(entry => (
    entry.target.kind === 'marketplace'
      ? [`${entry.target.name}@${entry.target.marketplace}@${entry.scope === 'global' ? 'user' : 'project'}`]
      : []
  ))), [catalog]);

  const requestDelete = (target: DeleteTarget) => {
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
  const installFromMarketplace = (entry: MarketplaceEntry) => {
    void run(async () => {
      await usePluginsStore.getState().installPlugin({
        kind: 'marketplace',
        name: entry.name,
        marketplace: entry.marketplace,
        scope: marketplaceScope,
      });
      toast.success(t('settings.plugins.marketplace.toast.installed', { name: entry.name }));
    });
  };
  const refreshMarketplace = async () => {
    setMarketplaceRefreshing(true);
    await run(() => usePluginsStore.getState().loadMarketplace());
    setMarketplaceRefreshing(false);
  };
  const updatePlugin = async (entry: InstalledPluginEntry) => {
    await run(async () => {
      await usePluginsStore.getState().updatePlugin(entry.target);
      toast.success(t('settings.plugins.update.toast.done', { name: entry.name }));
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
  const deleteButton = (target: DeleteTarget) => (
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

  const hasActiveWorkers = catalog.workers.length > 0;
  // A mutation's own outcome, in the vocabulary of the thing the user
  // did. Worker identities and engine checks stay out of this view.
  const lastMutationLabel = lastMutation
    ? t(lastMutation.status === 'applied'
      ? 'settings.plugins.apply.applied'
      : lastMutation.status === 'partial'
        ? 'settings.plugins.apply.partial'
        : lastMutation.status === 'failed'
          ? 'settings.plugins.apply.failed'
          : 'settings.plugins.apply.noActiveWorkers', { failedCount: lastMutation.workers.filter(worker => worker.outcome === 'failed').length })
    : null;
  const showLifecycleSection = hasActiveWorkers || lastMutationLabel !== null;
  const lifecycleSection = showLifecycleSection ? (
    <SettingsSection divider={false} contentClassName={SETTINGS_SPACE_ROW_CLASS}>
      {hasActiveWorkers ? (
        <SettingsFieldRow
          label={t('settings.plugins.runtime.title')}
          description={lastMutationLabel ? <span role="status">{lastMutationLabel}</span> : undefined}
        >
          <Button variant="outline" size="sm" disabled={disabled} onClick={requestApply}>
            {t('settings.plugins.action.apply')}
          </Button>
        </SettingsFieldRow>
      ) : (
        <p role="status" className="typography-meta text-muted-foreground">{lastMutationLabel}</p>
      )}
    </SettingsSection>
  ) : null;

  if (plugin) {
    const details = [plugin.description, ...(plugin.enabledFeatures ?? [])].filter(Boolean).join(' · ');
    const update = updateFor(catalog.availableUpdates, plugin);
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
        >
          {lifecycleSection}
          <SettingsSection divider={showLifecycleSection} contentClassName={SETTINGS_SPACE_ROW_CLASS}>
            {operationError ? <p role="alert" className="typography-meta text-[var(--status-error)]">{operationError}</p> : null}
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
            </div>
            {!hasActiveWorkers ? (
              <p className="typography-meta text-muted-foreground">{t('settings.plugins.apply.nextSession')}</p>
            ) : null}
          </SettingsSection>

          <SettingsSection
            title={t('settings.plugins.page.header.entry')}
            description={details || undefined}
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
            title={t('settings.plugins.section.configuration')}
            settingsItem="plugins.settings"
          >
            <PluginConfiguration key={JSON.stringify([catalog.workspaceId, plugin.id])} plugin={plugin} revision={catalog.revision}
              workspaceId={catalog.workspaceId} disabled={disabled} run={run} />
          </SettingsSection>
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
          {lifecycleSection}
          {operationError ? (
            <SettingsSection divider={showLifecycleSection} contentClassName={SETTINGS_SPACE_ROW_CLASS}>
              <p role="alert" className="typography-meta text-[var(--status-error)]">{operationError}</p>
            </SettingsSection>
          ) : null}

          <SettingsSection
            title={t('settings.plugins.local.title')}
            divider={showLifecycleSection || operationError !== null}
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

  const installedCount = catalog.plugins.length + catalog.localExtensions.length;
  const updates = catalog.availableUpdates;

  return (
    <>
      <SettingsPageLayout
        title={t('settings.page.plugins.title')}
        description={t('settings.plugins.grid.description')}
        headerEnd={(
          <div className="flex items-center gap-2">
            {updates.length > 0 ? (
              <Button variant="outline" size="sm" onClick={() => void upgradeAll()} disabled={upgradingAll || disabled}>
                <Icon name="refresh" className={cn('size-3.5', upgradingAll && 'animate-spin')} />
                {upgradingAll ? t('settings.plugins.upgradeAll.running') : t('settings.plugins.action.upgradeAll')}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground"
              onClick={() => void usePluginsStore.getState().loadPlugins({ directory, force: true })}
              disabled={isLoading || isMutating}
              aria-label={t('settings.plugins.action.refresh')}
              title={t('settings.plugins.action.refresh')}
            >
              <Icon name="refresh" className={cn('size-4', (isLoading || isMutating) && 'animate-spin')} />
            </Button>
          </div>
        )}
      >
        {operationError ? <p role="alert" className="mb-4 typography-meta text-[var(--status-error)]">{operationError}</p> : null}
        {lifecycleSection}

        <SettingsSection
          title={t('settings.plugins.section.installed')}
          description={installedCount > 0 && !hasActiveWorkers ? t('settings.plugins.apply.nextSession') : undefined}
          divider={showLifecycleSection}
          settingsItem="plugins.installed"
          headerAction={(
            <div className="flex flex-wrap items-center gap-1">
              <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setAddOpen(true)}>
                <Icon name="add" className="size-3.5" />
                {t('settings.plugins.sidebar.actions.addTitle')}
              </Button>
            </div>
          )}
        >
          <div className={SETTINGS_CARD_GRID_CLASS}>
            {installedCount === 0 ? (
              <SettingsAddCard
                label={t('settings.plugins.sidebar.actions.addTitle')}
                hint={t('settings.plugins.section.installedEmpty')}
                onClick={() => setAddOpen(true)}
                settingsItem="plugins.add"
              />
            ) : null}
            {catalog.plugins.map(entry => {
              const update = updateFor(updates, entry);
              const uninstall: SettingsCardAction = { label: t('settings.plugins.action.uninstall'), icon: 'delete-bin', destructive: true, onSelect: () => requestDelete({ kind: 'plugin', plugin: entry }) };
              const actions: SettingsCardAction[] = update
                ? [{ label: t('settings.plugins.action.update'), icon: 'refresh', onSelect: () => void updatePlugin(entry) }, uninstall]
                : [uninstall];
              return (
                <SettingsCard
                  key={entry.id}
                  icon={<SettingsCardIcon name="plug" />}
                  title={entry.name}
                  description={entry.description || undefined}
                  muted={!entry.enabled}
                  badges={(
                    <>
                      {entry.version ? <SettingsCardPill tone="neutral">{entry.version}</SettingsCardPill> : null}
                      {update ? (
                        <SettingsCardPill tone="info">{t('settings.plugins.update.badge', { from: update.from, to: update.to })}</SettingsCardPill>
                      ) : null}
                      <ScopeChip scope={entry.scope} />
                    </>
                  )}
                  footer={<CapabilityChips details={marketplaceDetailsFor(catalog.marketplace, entry)} />}
                  control={(
                    <Switch
                      checked={entry.enabled}
                      disabled={disabled}
                      aria-label={t(entry.enabled ? 'settings.extensions.actions.disable.aria' : 'settings.extensions.actions.enable.aria', { name: entry.name })}
                      onCheckedChange={enabled => void run(() => usePluginsStore.getState().configurePlugin({ target: entry.target, enabled }))}
                    />
                  )}
                  onOpen={() => setSelection({ kind: 'plugin', id: entry.id })}
                  actionsLabel={t('settings.plugins.grid.actionsAria', { name: entry.name })}
                  actions={actions}
                />
              );
            })}
            {catalog.localExtensions.map(entry => (
              <SettingsCard
                key={entry.extensionId}
                icon={<SettingsCardIcon name="file-code" />}
                title={entry.extensionId}
                description={t('settings.plugins.local.title')}
                badges={<ScopeChip scope="workspace" />}
                onOpen={() => setSelection({ kind: 'local', extensionId: entry.extensionId })}
                actionsLabel={t('settings.plugins.grid.actionsAria', { name: entry.extensionId })}
                actions={[{ label: t('settings.common.actions.delete'), icon: 'delete-bin', destructive: true, onSelect: () => requestDelete({ kind: 'local', extension: entry }) }]}
              />
            ))}
          </div>
        </SettingsSection>

        {/* Capability sources are the extension inventory's own view of the
            workspace. The section renders even when it discovers nothing: its
            empty state names the section and says so, which an absent section
            could not. */}
        {extensions !== null ? (
          <ExtensionControlCenter
            inventory={extensions}
            disabled={disabled}
            onToggleProvider={(providerId, enabled) => void toggleExtensionProvider(providerId, enabled)}
            onToggleUserSource={(providerId, enabled) => void toggleExtensionUserSource(providerId, enabled)}
            onToggleItem={(providerId, extensionId, enabled) => void toggleExtensionItem(providerId, extensionId, enabled)}
          />
        ) : null}

        <SettingsSection
          title={t('settings.plugins.marketplace.title')}
          settingsItem="plugins.marketplace"
          headerAction={(
            <div className="flex flex-wrap items-center gap-1">
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
          contentClassName={SETTINGS_SPACE_ROW_CLASS}
        >
          {/* The configured sources, or a line saying none is: the button that
              edits them sits in this section's header, so an absent row left
              the filter looking broken rather than empty. */}
          {catalog.marketplaceSources.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {catalog.marketplaceSources.map(source => (
                <SettingsCardChip key={source.name}>{source.name}</SettingsCardChip>
              ))}
            </div>
          ) : (
            <p className={SETTINGS_HELPER_CLASS}>{t('settings.plugins.marketplace.sources.empty')}</p>
          )}
          <SettingsCardToolbar
            className="mb-0"
            search={{
              value: marketplaceQuery,
              onChange: setMarketplaceQuery,
              placeholder: t('settings.plugins.grid.searchPlaceholder'),
            }}
            actions={(
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
            )}
          />

          {marketplaceCategories.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Button variant="chip" size="xs" aria-pressed={marketplaceCategory === null} onClick={() => setMarketplaceCategory(null)}>
                {t('settings.plugins.marketplace.allCategories')}
              </Button>
              {marketplaceCategories.map(([category, count]) => (
                <Button
                  key={category}
                  variant="chip"
                  size="xs"
                  aria-pressed={marketplaceCategory === category}
                  onClick={() => setMarketplaceCategory(category)}
                >
                  {category}
                  <span className="tabular-nums">{count}</span>
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
            {marketplaceEntries.map(entry => {
              const installed = installedMarketplaceKeys.has(`${entry.name}@${entry.marketplace}@${marketplaceScope}`);
              return (
                <div key={`${entry.marketplace}:${entry.name}`} className="flex min-w-0 flex-col gap-2 py-3 @xl:flex-row @xl:items-start @xl:gap-4">
                  <div className="min-w-0 flex-1 break-words">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="max-w-full truncate typography-ui-label text-foreground" title={entry.name}>{entry.name}</p>
                      <span className="max-w-full shrink-0 truncate font-mono typography-micro text-muted-foreground" title={entry.version ?? undefined}>{entry.version ?? '—'}</span>
                      <SettingsCardChip className="max-w-full truncate" title={entry.marketplace}>{entry.marketplace}</SettingsCardChip>
                      {installed ? (
                        <span className="max-w-full truncate"><SettingsCardPill tone="success">{t('settings.plugins.marketplace.installed')}</SettingsCardPill></span>
                      ) : null}
                    </div>
                    {entry.description ? <p className="line-clamp-2 typography-micro text-muted-foreground">{entry.description}</p> : null}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 typography-micro text-muted-foreground">
                      <CapabilityChips details={entry.details} />
                    </div>
                  </div>
                  <Button
                    variant={installed ? 'ghost' : 'outline'}
                    size="sm"
                    className="max-w-full shrink-0 self-start whitespace-normal break-words"
                    disabled={disabled || installed}
                    onClick={() => installFromMarketplace(entry)}
                  >
                    {installed ? t('settings.plugins.marketplace.installed') : t('settings.plugins.action.install')}
                  </Button>
                </div>
              );
            })}
          </div>
        </SettingsSection>
      </SettingsPageLayout>
      {dialogs}
    </>
  );
};

export const PluginsPage: React.FC = () => {
  const directory = useSettingsDirectory();
  return <NativePluginsPage key={JSON.stringify([getRuntimeKey(), directory])} directory={directory} />;
};
