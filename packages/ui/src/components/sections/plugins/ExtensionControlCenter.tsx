import React from 'react';
import type { ExtensionInventory, ExtensionItem, ExtensionKind, ExtensionScope } from '@openchamber/agent-contract';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon/Icon';
import type { IconName } from '@/components/icon/icons';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  SETTINGS_SPACE_ROW_CLASS,
  SETTINGS_WIDTH_SHORT_TEXT_CLASS,
  SettingsSection,
} from '@/components/sections/shared/SettingsSection';
import { SettingsCardChip, SettingsCardPill } from '@/components/sections/shared/SettingsCards';
import { useI18n, type I18nKey } from '@/lib/i18n';
import { rankByQuery } from '@/lib/search/fuzzySearch';
import { cn } from '@/lib/utils';

/** Localized kind names. The worker's own `kinds[].label` is English, so the UI names each kind itself. */
const KIND_LABEL_KEY = {
 'extension-module': 'settings.plugins.kind.extension-module',
 skill: 'settings.plugins.kind.skill',
 rule: 'settings.plugins.kind.rule',
 tool: 'settings.plugins.kind.tool',
 mcp: 'settings.plugins.kind.mcp',
 prompt: 'settings.plugins.kind.prompt',
 instruction: 'settings.plugins.kind.instruction',
 'context-file': 'settings.plugins.kind.context-file',
 hook: 'settings.plugins.kind.hook',
 'slash-command': 'settings.plugins.kind.slash-command',
 ssh: 'settings.plugins.kind.ssh',
} as const satisfies Record<ExtensionKind, string>;

const KIND_ICON = {
 'extension-module': 'puzzle',
 skill: 'sparkling',
 rule: 'book-open',
 tool: 'tools',
 mcp: 'server',
 prompt: 'quill-pen',
 instruction: 'file-text',
 'context-file': 'file-code',
 hook: 'route',
 'slash-command': 'slash-commands-2',
 ssh: 'terminal-box',
} as const satisfies Record<ExtensionKind, IconName>;

/** OMP's bundled rule provider id (`BUILTIN_DEFAULTS_PROVIDER_ID` in its capability registry). */
const BUNDLED_PROVIDER_ID = 'builtin-defaults';

const ScopeChip: React.FC<{ scope: ExtensionScope }> = ({ scope }) => {
 const { t } = useI18n();
 const label = scope === 'builtin'
  ? t('settings.extensions.source.bundled')
  : scope === 'user'
   ? t('settings.skills.catalog.conflicts.scope.user')
   : t('settings.skills.catalog.conflicts.scope.project');
 return <SettingsCardChip>{label}</SettingsCardChip>;
};

/** Providers whose OMP-side name needs the UI's own wording; unknown ids keep the reported name. */
const PROVIDER_NAME_KEYS: Record<string, I18nKey> = {
 [BUNDLED_PROVIDER_ID]: 'settings.plugins.provider.builtinDefaults',
};

const getProviderDisplayName = (
 provider: { id: string; displayName: string },
 t: (key: I18nKey) => string,
): string => {
 const key = PROVIDER_NAME_KEYS[provider.id];
 return key ? t(key) : provider.displayName;
};

/** Shadowing wins over the switch, so one status drives the pill and the inspector. */
const StatusPill: React.FC<{ item: ExtensionItem }> = ({ item }) => {
 const { t } = useI18n();
 const status = item.shadowed ? 'shadowed' : item.enabled ? 'active' : 'disabled';
 return (
  <SettingsCardPill tone={status === 'active' ? 'success' : 'neutral'}>
   {status === 'shadowed'
    ? t('settings.openchamber.tunnel.state.inactive')
    : t(status === 'active' ? 'settings.extensions.status.enabled' : 'settings.extensions.status.disabled')}
  </SettingsCardPill>
 );
};

const Inspector: React.FC<{ item: ExtensionItem }> = ({ item }) => {
 const { t } = useI18n();
 const facts = item.metadata === undefined
  ? []
  : [item.metadata.transport, item.metadata.host, item.metadata.username, item.metadata.port]
   .filter((value): value is string | number => value !== undefined);
 return (
  <div className="min-w-0 space-y-2 text-start">
   <div className="flex min-w-0 flex-wrap items-center gap-1.5">
    <p className="min-w-0 flex-1 truncate typography-ui-label text-foreground">{item.name}</p>
    <StatusPill item={item} />
    <ScopeChip scope={item.scope} />
   </div>
   <p className="break-all font-mono typography-micro text-muted-foreground">{item.path}</p>
   {/* The triggers are regex source. The list row shows only the name and
       status; the full patterns stay behind a disclosure here. */}
   {item.triggers.length === 0 ? null : (
    <details className="min-w-0">
     <summary className="cursor-pointer typography-micro text-muted-foreground">
      {t('settings.plugins.capabilities.triggers', { count: item.triggers.length })}
     </summary>
     <div className="flex min-w-0 flex-wrap items-center gap-1 pt-1">
      {item.triggers.map(trigger => (
       <SettingsCardChip key={trigger} title={trigger} className="max-w-full whitespace-normal break-all">
        {trigger}
       </SettingsCardChip>
      ))}
     </div>
    </details>
   )}
   {item.shadowedBy === undefined ? null : (
    <div className="flex min-w-0 items-baseline gap-2">
     <span className="shrink-0 typography-micro text-muted-foreground">{t('settings.extensions.detail.field.source')}</span>
     <span className="min-w-0 break-words typography-meta text-foreground">{item.shadowedBy}</span>
    </div>
   )}
   {item.disabledReason === undefined ? null : (
    <p className="typography-micro text-muted-foreground">
     {t(item.disabledReason === 'provider-disabled' ? 'settings.plugins.status.disabled' : 'settings.extensions.status.disabled')}
    </p>
   )}
   {item.description === undefined ? null : (
    <p className="typography-meta text-foreground">{item.description}</p>
   )}
   {facts.length === 0 ? null : (
    <p className="typography-micro text-muted-foreground">{facts.join(' · ')}</p>
   )}
   {item.content === undefined ? null : (
    <details className="min-w-0">
     <summary className="cursor-pointer typography-micro text-muted-foreground">
      {t('settings.skills.page.section.instructions')}
     </summary>
     <pre className="oc-tile-inset mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words p-2 typography-micro text-muted-foreground">{item.content}</pre>
    </details>
   )}
  </div>
 );
};

interface ItemRowProps {
 item: ExtensionItem;
 selected: boolean;
 disabled: boolean;
 onSelect: () => void;
 onToggle: (enabled: boolean) => void;
}

/** One capability: kind icon, name, description and status. Raw triggers and paths stay in the inspector. */
const ItemRow: React.FC<ItemRowProps> = ({ item, selected, disabled, onSelect, onToggle }) => {
 const { t } = useI18n();
 return (
  <div className={cn('flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5', selected && 'bg-[var(--interactive-selection)]')}>
   <Icon name={KIND_ICON[item.kind]} className="size-4 shrink-0 text-muted-foreground" aria-hidden />
   <button
    type="button"
    className="min-w-24 flex-1 text-start"
    aria-pressed={selected}
    onClick={onSelect}
   >
    <span className={cn('block truncate typography-ui-label', !item.enabled && 'text-muted-foreground')}>{item.name}</span>
    {item.description ? (
     <span className="block truncate typography-micro text-muted-foreground">{item.description}</span>
    ) : null}
   </button>
   <StatusPill item={item} />
   {item.toggleable ? (
    <Switch
     checked={item.enabled}
     disabled={disabled || item.shadowed}
     aria-label={t(item.enabled ? 'settings.extensions.actions.disable.aria' : 'settings.extensions.actions.enable.aria', { name: item.name })}
     onCheckedChange={onToggle}
    />
   ) : null}
  </div>
 );
};

interface ExtensionControlCenterProps {
 inventory: ExtensionInventory;
 disabled: boolean;
 onToggleProvider: (providerId: string, enabled: boolean) => void;
 onToggleUserSource: (providerId: string, enabled: boolean) => void;
 onToggleItem: (providerId: string, extensionId: string, enabled: boolean) => void;
}

/**
 * OMP's Extension Control Center: one switch per discovery source, kind tabs
 * with counts, bundled rows collapsed behind a count, and an inspector that
 * shows where a row came from, its path and its trigger patterns.
 */
export const ExtensionControlCenter: React.FC<ExtensionControlCenterProps> = ({
 inventory, disabled, onToggleProvider, onToggleUserSource, onToggleItem,
}) => {
 const { t } = useI18n();
 const [kind, setKind] = React.useState<ExtensionKind | 'all'>('all');
 const [query, setQuery] = React.useState('');
 const [selectedId, setSelectedId] = React.useState<string | null>(null);
 const [bundledOpen, setBundledOpen] = React.useState(false);

 const filtered = rankByQuery(inventory.items, query, item => [item.name, item.description ?? '', item.path, item.providerName]);
 // Tabs follow the worker's kind order and show only kinds with rows under the current query.
 const tabs = inventory.kinds
  .map(entry => ({ kind: entry.kind, count: filtered.filter(item => item.kind === entry.kind).length }))
  .filter(tab => tab.count > 0);
 const activeKind = kind === 'all' || tabs.some(tab => tab.kind === kind) ? kind : 'all';
 const inKind = activeKind === 'all' ? filtered : filtered.filter(item => item.kind === activeKind);
 // OMP reports its bundled rules under the builtin-defaults provider with user scope, so both mark a bundled row.
 const visible = inKind.filter(item => item.scope !== 'builtin' && item.providerId !== BUNDLED_PROVIDER_ID);
 const bundled = inKind.filter(item => item.scope === 'builtin' || item.providerId === BUNDLED_PROVIDER_ID);
 const shown = bundledOpen ? [...visible, ...bundled] : visible;
 // A row from a previous filter, or a bundled row once it collapses, is never inspected.
 const selected = shown.find(item => item.id === selectedId) ?? shown[0] ?? null;
 // A source that discovered nothing is not a source a reader can act on.
 const providers = inventory.providers.filter(provider => provider.itemCount > 0);

 return (
  <SettingsSection
   title={t('settings.plugins.capabilities.title')}
   info={t('settings.plugins.capabilities.info')}
   divider={false}
   headerAction={(
    <Input
     value={query}
     onChange={event => setQuery(event.target.value)}
     placeholder={t('settings.plugins.grid.searchPlaceholder')}
     aria-label={t('settings.plugins.grid.searchPlaceholder')}
     className={SETTINGS_WIDTH_SHORT_TEXT_CLASS}
    />
   )}
   contentClassName={SETTINGS_SPACE_ROW_CLASS}
  >
   <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
    {providers.map(provider => {
     const displayName = getProviderDisplayName(provider, t);
     return (
     <div key={provider.id} className="flex min-w-0 items-center gap-2">
      <Switch
       checked={provider.enabled}
       disabled={disabled}
       aria-label={t(provider.enabled ? 'settings.extensions.actions.disable.aria' : 'settings.extensions.actions.enable.aria', { name: displayName })}
       onCheckedChange={enabled => onToggleProvider(provider.id, enabled)}
      />
      <span className="min-w-0 truncate typography-meta text-foreground">{displayName} ({provider.itemCount})</span>
      {provider.foreignUserSource ? (
       <>
        <Switch
         checked={provider.userSourceEnabled}
         disabled={disabled}
         aria-label={t('settings.extensions.detail.field.source')}
         onCheckedChange={enabled => onToggleUserSource(provider.id, enabled)}
        />
        <span className="typography-micro text-muted-foreground">{t('settings.extensions.detail.field.source')}</span>
       </>
      ) : null}
     </div>
     );
    })}
   </div>

   {filtered.length === 0 ? (
    <p className="py-4 typography-meta text-muted-foreground">
     {query.trim().length > 0
      ? t('settings.plugins.grid.noMatches', { query: query.trim() })
      : t('settings.extensions.empty')}
    </p>
   ) : (
    <div className="grid min-w-0 gap-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
     <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
       <Button variant="chip" size="xs" aria-pressed={activeKind === 'all'} onClick={() => setKind('all')}>
        {t('settings.agents.page.mode.all')}
        <span className="tabular-nums">{filtered.length}</span>
       </Button>
       {tabs.map(tab => (
        <Button key={tab.kind} variant="chip" size="xs" aria-pressed={activeKind === tab.kind} onClick={() => setKind(tab.kind)}>
         <Icon name={KIND_ICON[tab.kind]} className="size-3.5" aria-hidden />
         {t(KIND_LABEL_KEY[tab.kind])}
         <span className="tabular-nums">{tab.count}</span>
        </Button>
       ))}
      </div>

      <div className="min-w-0 text-start">
       {visible.map(item => (
        <ItemRow
         key={item.id}
         item={item}
         selected={selected?.id === item.id}
         disabled={disabled}
         onSelect={() => setSelectedId(item.id)}
         onToggle={enabled => onToggleItem(item.providerId, item.id, enabled)}
        />
       ))}
       {bundled.length === 0 ? null : (
        <div className="pt-2">
         <Button variant="ghost" size="xs" aria-expanded={bundledOpen} onClick={() => setBundledOpen(open => !open)}>
          {bundledOpen
           ? t('settings.plugins.capabilities.hideBundled')
           : t('settings.plugins.capabilities.showBundled', { count: bundled.length })}
         </Button>
         {bundledOpen ? bundled.map(item => (
          <ItemRow
           key={item.id}
           item={item}
           selected={selected?.id === item.id}
           disabled={disabled}
           onSelect={() => setSelectedId(item.id)}
           onToggle={enabled => onToggleItem(item.providerId, item.id, enabled)}
          />
         )) : null}
        </div>
       )}
      </div>
     </div>

     <div className="min-w-0 border-t border-[var(--surface-border)] pt-3 @3xl:border-s @3xl:border-t-0 @3xl:ps-4 @3xl:pt-0">
      {selected === null ? null : <Inspector item={selected} />}
     </div>
    </div>
   )}
  </SettingsSection>
 );
};
