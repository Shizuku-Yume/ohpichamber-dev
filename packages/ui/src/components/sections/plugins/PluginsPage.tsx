import React from 'react';
import { JsonObjectSchema, JsonValueSchema, type InstalledPluginEntry, type LocalExtensionEntry, type PluginMutationResult } from '@openchamber/agent-contract';
import { CanonicalApiError } from '@/api/canonicalClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { SettingsBackButton } from '@/components/sections/shared/SettingsCards';
import { SettingsSection } from '@/components/sections/shared/SettingsSection';
import { AUTOSAVE_SAVED, AUTOSAVE_UNCHANGED, autosaveFailed, useAutosave, type AutosaveResult } from '@/components/sections/shared/SettingsAutosave';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useI18n } from '@/lib/i18n';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { usePluginsStore } from '@/stores/usePluginsStore';
import { AddPluginDialog } from './AddPluginDialog';
import { PluginsGrid, type PluginDeleteTarget, type PluginSelection } from './PluginsGrid';
import { PluginStatusBanner } from './PluginStatusBanner';

const json = (settings: InstalledPluginEntry['globalSettings']): string => JSON.stringify(settings, null, 2);
const parseSettings = (text: string) => {
  try { return JsonObjectSchema.safeParse(JSON.parse(text.trim() || '{}')); }
  catch { return JsonObjectSchema.safeParse(null); }
};

const PluginSettingsEditor: React.FC<{ plugin: InstalledPluginEntry; disabled: boolean }> = ({ plugin, disabled }) => {
  const { t } = useI18n();
  const baseline = React.useRef(json(plugin.globalSettings));
  const [text, setText] = React.useState(baseline.current);
  const [secrets, setSecrets] = React.useState(new Map<string, string>());
  React.useEffect(() => {
    const next = json(plugin.globalSettings);
    const previousBaseline = baseline.current;
    setText(previous => previous === previousBaseline ? next : previous);
    baseline.current = next;
  }, [plugin.globalSettings]);
  const parsed = parseSettings(text);
  const containsSecret = parsed.success && plugin.settingDefinitions.some(setting => setting.secret && Object.hasOwn(parsed.data, setting.key));
  const invalid = !parsed.success || containsSecret;
  const save = async (): Promise<AutosaveResult> => {
    if (invalid || !parsed.success) return autosaveFailed(t('settings.plugins.page.field.options.invalidJson'));
    if (json(parsed.data) === baseline.current && secrets.size === 0) return AUTOSAVE_UNCHANGED;
    const settings = { ...parsed.data };
    for (const [key, value] of secrets) {
      const definition = plugin.settingDefinitions.find(setting => setting.key === key);
      if (!definition || value === '') continue;
      if (definition.type === 'string' || definition.type === 'enum') settings[key] = value;
      else {
        try { settings[key] = JsonValueSchema.parse(JSON.parse(value)); }
        catch { return autosaveFailed(t('settings.plugins.page.field.options.invalidJson')); }
      }
    }
    const submitted = text;
    const submittedSecrets = new Map(secrets);
    const result = await usePluginsStore.getState().configurePlugin({ target: plugin.target, settingsScope: 'global', settings });
    const updated = result.catalog.plugins.find(entry => entry.id === plugin.id);
    if (!updated) return autosaveFailed(t('settings.plugins.error.operation'));
    const normalized = json(updated.globalSettings);
    baseline.current = normalized;
    setText(current => current === submitted ? normalized : current);
    setSecrets(current => {
      const remaining = new Map(current);
      for (const [key, value] of submittedSecrets) if (remaining.get(key) === value) remaining.delete(key);
      return remaining;
    });
    return AUTOSAVE_SAVED;
  };
  const autosave = useAutosave(save);
  return (
    <div onBlurCapture={autosave.onBlurCapture} className="space-y-4">
      <p className="typography-meta text-muted-foreground">{plugin.description}</p>
      {plugin.enabledFeatures ? <p className="font-mono typography-meta">{plugin.enabledFeatures.join(', ')}</p> : null}
      <label htmlFor="native-plugin-settings">{t('settings.plugins.field.globalSettings')}</label>
      <Textarea id="native-plugin-settings" value={text} onChange={event => setText(event.target.value)} rows={12} className="font-mono" spellCheck={false} aria-invalid={invalid} disabled={disabled}
        onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); autosave.requestSave(); } }} />
      {invalid ? <p role="alert" className="text-[var(--status-error)]">{t('settings.plugins.page.field.options.invalidJson')}</p> : null}
      {plugin.settingDefinitions.map(setting => (
        <div key={setting.key} className="space-y-1">
          {setting.secret ? <>
            <label htmlFor={`native-plugin-secret-${setting.key}`}>{t('settings.plugins.field.secret', { name: setting.key })}</label>
            <Input id={`native-plugin-secret-${setting.key}`} type="password" autoComplete="new-password" value={secrets.get(setting.key) ?? ''} disabled={disabled}
              placeholder={t(setting.globalConfigured ? 'settings.plugins.field.secretConfigured' : 'settings.plugins.field.secretUnconfigured')}
              onChange={event => { const value = event.target.value; setSecrets(current => { const next = new Map(current); if (value === '') next.delete(setting.key); else next.set(setting.key, value); return next; }); }} />
          </> : <span className="font-mono typography-meta">{setting.key}</span>}
          <p className="typography-meta text-muted-foreground">{setting.description}</p>
        </div>
      ))}
      {plugin.settingDefinitions.some(setting => setting.overridden) ? <div className="space-y-2">
        <p className="typography-meta text-muted-foreground">{t('settings.plugins.field.projectOverride')}</p>
        <label htmlFor="native-plugin-effective-settings">{t('settings.plugins.field.effectiveSettings')}</label>
        <Textarea id="native-plugin-effective-settings" value={json(plugin.settings)} rows={8} className="font-mono" readOnly spellCheck={false} />
      </div> : null}
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
    void usePluginsStore.getState().readLocalExtension(extension.extensionId).then(source => {
      if (cancelled) return;
      const previousBaseline = baseline.current;
      setContent(previous => previousBaseline === null || previous === previousBaseline ? source.content : previous);
      baseline.current = source.content;
      setState('ready');
    }).catch(() => { if (!cancelled) setState('failed'); });
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
    <div className="space-y-3" onBlurCapture={autosave.onBlurCapture}>
      <p className="font-mono typography-meta">{extension.relativePath}</p>
      {state === 'loading' ? <p role="status">{t('settings.plugins.status.loading')}</p> : null}
      {state === 'failed' ? <div role="alert">
        <p>{t('settings.plugins.error.operation')}</p>
        <Button variant="outline" onClick={() => setAttempt(value => value + 1)}>{t('settings.plugins.action.refresh')}</Button>
      </div> : null}
      <label htmlFor="native-local-extension-content">{t('settings.plugins.page.field.content')}</label>
      <Textarea id="native-local-extension-content" rows={20} value={content} onChange={event => setContent(event.target.value)} disabled={disabled || state !== 'ready'} className="font-mono" spellCheck={false}
        onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); autosave.requestSave(); } }} />
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
  const doctor = usePluginsStore(state => state.doctor);
  const [selection, setSelection] = React.useState<PluginSelection | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<PluginDeleteTarget | null>(null);
  const [applyOpen, setApplyOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [operationError, setOperationError] = React.useState<string | null>(null);
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
  const run = async (perform: () => Promise<PluginMutationResult | void>) => {
    setPending(true); setOperationError(null);
    try { await perform(); }
    catch (error) { setOperationError(error instanceof CanonicalApiError ? error.message : t('settings.plugins.error.operation')); }
    finally { setPending(false); }
  };
  const plugin = current && selection?.kind === 'plugin' ? catalog.plugins.find(entry => entry.id === selection.id) : undefined;
  const extension = current && selection?.kind === 'local' ? catalog.localExtensions.find(entry => entry.extensionId === selection.extensionId) : undefined;
  const deleteName = deleteTarget?.kind === 'plugin' ? deleteTarget.plugin.name : deleteTarget?.extension.extensionId ?? '';
  const remove = () => run(async () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'plugin') await usePluginsStore.getState().uninstallPlugin(deleteTarget.plugin.target);
    else await usePluginsStore.getState().deleteLocalExtension(deleteTarget.extension.extensionId);
    setDeleteTarget(null); setSelection(null);
  });
  const entries = (current ? catalog.marketplace : []).filter(entry => `${entry.name} ${entry.description}`.toLocaleLowerCase().includes(marketplaceQuery.toLocaleLowerCase()));
  return (
    <>
      <SettingsPageLayout title={plugin?.name ?? extension?.extensionId ?? t('settings.page.plugins.title')}
        description={selection ? undefined : t('settings.plugins.grid.description')}
        titleLeading={selection ? <SettingsBackButton label={t('settings.plugins.page.back')} onClick={() => setSelection(null)} /> : undefined}
        headerEnd={<Button variant="outline" disabled={isLoading || pending} onClick={() => void usePluginsStore.getState().loadPlugins({ directory, force: true })}>{t('settings.plugins.action.refresh')}</Button>}>
        {isLoading && !current ? <p role="status">{t('settings.plugins.status.loading')}</p> : null}
        {!directory ? <p>{t('settings.plugins.error.workspaceRequired')}</p> : loadError ? <p role="alert" className="text-[var(--status-error)]">{loadError instanceof CanonicalApiError ? loadError.message : t('settings.plugins.error.operation')}</p> : null}
        {operationError ? <p role="alert" className="text-[var(--status-error)]">{operationError}</p> : null}
        {current ? <>
          {lastMutation ? <PluginStatusBanner result={lastMutation} /> : null}
          {plugin ? <SettingsSection divider={false}>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="typography-meta">{plugin.version} · {t(plugin.scope === 'global' ? 'settings.plugins.scope.global' : 'settings.plugins.scope.workspace')}</span>
              <Button variant="outline" disabled={disabled} onClick={() => void run(() => usePluginsStore.getState().configurePlugin({ target: plugin.target, enabled: !plugin.enabled }))}>{t(plugin.enabled ? 'settings.plugins.action.disable' : 'settings.plugins.action.enable')}</Button>
              <Button variant="outline" disabled={disabled} onClick={() => void run(() => usePluginsStore.getState().updatePlugin(plugin.target))}>{t('settings.plugins.action.update')}</Button>
              <Button variant="destructive" disabled={disabled} onClick={() => setDeleteTarget({ kind: 'plugin', plugin })}>{t('settings.plugins.action.uninstall')}</Button>
            </div>
            <PluginSettingsEditor key={plugin.id} plugin={plugin} disabled={pending} />
          </SettingsSection> : extension ? <SettingsSection divider={false}>
            <Button variant="destructive" disabled={disabled} onClick={() => setDeleteTarget({ kind: 'local', extension })}>{t('settings.common.actions.delete')}</Button>
            <LocalExtensionEditor key={extension.extensionId} extension={extension} revision={catalog.revision} disabled={pending} />
          </SettingsSection> : <PluginsGrid catalog={catalog} onAdd={() => setAddOpen(true)} onSelect={setSelection} onDelete={setDeleteTarget} />}
          <SettingsSection title={t('settings.plugins.runtime.title')}>
            <div className="space-y-2 typography-meta">
              {catalog.workers.length === 0 ? <p>{t('settings.plugins.apply.noActiveWorkers')}</p> : null}
              {catalog.workers.map(worker => <div key={`${worker.worker.rootSessionId}:${worker.worker.workerGeneration}`}>
                <p>{worker.worker.rootSessionId} · {t(worker.status === 'ready' ? 'settings.plugins.status.ready' : 'settings.plugins.status.unavailable')} · {t('settings.plugins.runtime.appliedRevision', { revision: worker.appliedRevision ?? '—' })}</p>
                {worker.error ? <p className="text-[var(--status-error)]">{worker.error.detail}</p> : null}
              </div>)}
              <Button variant="outline" disabled={disabled || catalog.workers.length === 0} onClick={() => setApplyOpen(true)}>{t('settings.plugins.action.apply')}</Button>
            </div>
          </SettingsSection>
          {!selection ? <>
            <SettingsSection title={t('settings.plugins.marketplace.title')}>
              <div className="space-y-3">
                <Button variant="outline" disabled={disabled} onClick={() => void run(() => usePluginsStore.getState().loadMarketplace())}>{t('settings.plugins.action.refresh')}</Button>
                <Input aria-label={t('settings.plugins.grid.searchPlaceholder')} value={marketplaceQuery} onChange={event => setMarketplaceQuery(event.target.value)} />
                <label className="flex items-center gap-2">{t('settings.plugins.page.field.scope')}
                  <select value={marketplaceScope} disabled={disabled} onChange={event => setMarketplaceScope(event.target.value === 'user' ? 'user' : 'project')}>
                    <option value="project">{t('settings.plugins.scope.workspace')}</option><option value="user">{t('settings.plugins.scope.global')}</option>
                  </select>
                </label>
                {entries.length === 0 ? <p className="typography-meta text-muted-foreground">{t('settings.plugins.marketplace.empty')}</p> : null}
                {entries.map(entry => <div key={`${entry.marketplace}:${entry.name}`} className="flex items-start justify-between gap-3 rounded-md border p-3">
                  <div><p>{entry.name} {entry.version}</p><p className="typography-meta text-muted-foreground">{entry.marketplace} · {entry.description}</p></div>
                  <Button variant="outline" disabled={disabled} onClick={() => void run(() => usePluginsStore.getState().installPlugin({ kind: 'marketplace', name: entry.name, marketplace: entry.marketplace, scope: marketplaceScope }))}>{t('settings.plugins.action.install')}</Button>
                </div>)}
              </div>
            </SettingsSection>
            <SettingsSection title={t('settings.plugins.doctor.title')}>
              <Button variant="outline" disabled={disabled} onClick={() => void run(() => usePluginsStore.getState().loadDoctor())}>{t('settings.plugins.doctor.run')}</Button>
              {doctor?.checks.map((check, index) => <div key={`${check.name}:${index}`} className="mt-2 typography-meta"><p>{check.name} · {t(check.status === 'ok' ? 'settings.plugins.doctor.status.ok' : check.status === 'warning' ? 'settings.plugins.doctor.status.warning' : 'settings.plugins.doctor.status.error')}</p><p>{check.message}</p></div>)}
            </SettingsSection>
          </> : null}
        </> : null}
      </SettingsPageLayout>
      <AddPluginDialog open={addOpen && current} onOpenChange={setAddOpen} />
      <Dialog open={deleteTarget !== null} onOpenChange={open => { if (!open && !disabled) setDeleteTarget(null); }}>
        <DialogContent><DialogHeader><DialogTitle>{t('settings.plugins.sidebar.deleteDialog.title')}</DialogTitle><DialogDescription>{t('settings.plugins.sidebar.deleteDialog.description', { name: deleteName })}</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="ghost" disabled={disabled} onClick={() => setDeleteTarget(null)}>{t('settings.common.actions.cancel')}</Button><Button variant="destructive" disabled={disabled} onClick={() => void remove()}>{t('settings.common.actions.delete')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={applyOpen} onOpenChange={open => { if (!open && !disabled) setApplyOpen(false); }}>
        <DialogContent><DialogHeader><DialogTitle>{t('settings.plugins.apply.confirmTitle')}</DialogTitle><DialogDescription>{t('settings.plugins.apply.confirmDescription')}</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="ghost" disabled={disabled} onClick={() => setApplyOpen(false)}>{t('settings.common.actions.cancel')}</Button><Button disabled={disabled} onClick={() => void run(async () => { await usePluginsStore.getState().applyPlugins(); setApplyOpen(false); })}>{t('settings.plugins.action.apply')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export const PluginsPage: React.FC = () => {
  const directory = useSettingsDirectory();
  return <NativePluginsPage key={JSON.stringify([getRuntimeKey(), directory])} directory={directory} />;
};
