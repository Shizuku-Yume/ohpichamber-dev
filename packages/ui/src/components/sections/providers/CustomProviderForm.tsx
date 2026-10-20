import React from 'react';
import type { ProviderConfigurationRead, ProviderModelDiscoveryResult } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SettingsSection } from '@/components/sections/shared/SettingsSection';
import { useI18n } from '@/lib/i18n';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { CustomProviderModelRow } from './CustomProviderModelRow';
import { CustomProviderModelDiscovery } from './CustomProviderModelDiscovery';
import { buildCustomProviderRequest, buildProviderDiscoveryRequest, createEmptyCustomProviderForm, createModelRow,
  CUSTOM_PROVIDER_PROTOCOLS, type CustomProviderPersistPlan } from './custom-provider-form';

export function CustomProviderForm({ workspaceId, revision, initial, existingProviderIDs, onSubmit, onCancel, busy = false }: {
  workspaceId: string; revision: string; initial?: ProviderConfigurationRead; existingProviderIDs: ReadonlySet<string>;
  onSubmit: (plan: CustomProviderPersistPlan) => Promise<void>; onCancel: () => void; busy?: boolean;
}) {
  const { t } = useI18n();
  const [form, setForm] = React.useState(() => createEmptyCustomProviderForm(initial));
  const [error, setError] = React.useState<string | null>(null);
  const [discovering, setDiscovering] = React.useState(false);
  const [discovered, setDiscovered] = React.useState<ProviderModelDiscoveryResult | null>(null);
  const lifetime = React.useRef(true);
  React.useEffect(() => { lifetime.current = true; return () => { lifetime.current = false; }; }, []);
  const discover = async () => {
    setDiscovering(true); setError(null);
    const runtime = getRuntimeKey();
    try {
      const result = await canonicalClient.discoverProviderModels(workspaceId, buildProviderDiscoveryRequest(form, Boolean(initial)));
      if (lifetime.current && runtime === getRuntimeKey()) setDiscovered(result);
    } catch {
      if (lifetime.current && runtime === getRuntimeKey()) setError(t('settings.providers.page.custom.discovery.failed'));
    } finally {
      if (lifetime.current) setDiscovering(false);
    }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || discovering) return;
    setError(null);
    let plan: CustomProviderPersistPlan;
    try {
      if (!initial && existingProviderIDs.has(form.providerId.trim())) throw new Error('Duplicate provider');
      plan = buildCustomProviderRequest(form, revision);
    } catch {
      setError(t('settings.providers.native.invalidConfiguration'));
      return;
    }
    try {
      await onSubmit(plan);
      if (lifetime.current) setForm((previous) => ({ ...previous, apiKey: '', headers: [] }));
    } catch {
      if (lifetime.current) setError(t('settings.providers.page.toast.customProviderSaveFailed'));
    }
  };
  return <form onSubmit={submit} className="space-y-4">
    <SettingsSection title={t(initial ? 'settings.providers.page.custom.editTitle' : 'settings.providers.page.custom.title')} description={t('settings.providers.native.customDescription')}>
      <fieldset disabled={busy || discovering} className="space-y-3">
        <label className="block space-y-1 text-sm">{t('settings.providers.page.custom.field.providerID.label')}
          <Input required disabled={Boolean(initial)} value={form.providerId} onChange={(event) => setForm({ ...form, providerId: event.target.value })} />
        </label>
        <label className="block space-y-1 text-sm">{t('settings.providers.page.custom.field.name.label')}
          <Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <label className="block space-y-1 text-sm">{t('settings.providers.page.custom.field.baseURL.label')}
          <Input required type="url" value={form.endpoint} onChange={(event) => setForm({ ...form, endpoint: event.target.value })} />
        </label>
        <label className="block space-y-1 text-sm">{t('settings.providers.page.custom.field.protocol.label')}
          <select className="w-full rounded-md border bg-transparent p-2" value={form.protocol} onChange={(event) => {
            const protocol = CUSTOM_PROVIDER_PROTOCOLS.find((value) => value === event.target.value);
            if (protocol) setForm({ ...form, protocol });
          }}>{CUSTOM_PROVIDER_PROTOCOLS.map((protocol) => <option key={protocol} value={protocol}>{protocol}</option>)}</select>
        </label>
        <label className="block space-y-1 text-sm">{t('settings.providers.page.custom.field.apiKey.label')}
          <Input type="password" autoComplete="new-password" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} />
        </label>
        <p className="text-xs text-muted-foreground">{t('settings.providers.native.secretHint')}</p>
      </fieldset>
    </SettingsSection>
    <SettingsSection title={t('settings.providers.page.custom.headers.title')} description={t('settings.providers.native.headerHint')}>
      {initial && <div className="mb-3 space-y-2 text-sm">
        <p>{t('settings.providers.native.configuredHeaders', { names: form.headerNames.join(', ') || '—' })}</p>
        <label className="flex items-center gap-2"><input type="checkbox" disabled={busy || discovering} checked={form.replaceHeaders}
          onChange={(event) => setForm({ ...form, replaceHeaders: event.target.checked, headers: [] })} />{t('settings.providers.native.replaceHeaders')}</label>
      </div>}
      {form.replaceHeaders && <fieldset disabled={busy || discovering} className="space-y-3">
        {form.headers.map((header, index) => <div key={header.row} className="flex flex-wrap items-end gap-2">
          <label className="min-w-40 flex-1 text-sm">{t('settings.providers.page.custom.headers.keyLabel')}
            <Input required value={header.name} onChange={(event) => setForm({ ...form, headers: form.headers.map((row, i) => i === index ? { ...row, name: event.target.value } : row) })} />
          </label>
          <label className="min-w-40 flex-1 text-sm">{t('settings.providers.page.custom.headers.valueLabel')}
            <Input type="password" autoComplete="new-password" value={header.value} onChange={(event) => setForm({ ...form, headers: form.headers.map((row, i) => i === index ? { ...row, value: event.target.value } : row) })} />
          </label>
          <Button type="button" variant="ghost" onClick={() => setForm({ ...form, headers: form.headers.filter((_, i) => i !== index) })}>{t('settings.providers.page.custom.headers.remove')}</Button>
        </div>)}
        <Button type="button" variant="outline" onClick={() => setForm({ ...form, headers: [...form.headers, { row: crypto.randomUUID(), name: '', value: '' }] })}>{t('settings.providers.page.custom.headers.add')}</Button>
      </fieldset>}
    </SettingsSection>
    <SettingsSection title={t('settings.providers.page.custom.models.title')} description={t('settings.providers.native.discoveryHint')}>
      <div className="space-y-3">
        <Button type="button" variant="outline" disabled={busy || discovering || !form.endpoint.trim()} onClick={() => void discover()}>
          {t(discovering ? 'settings.providers.page.custom.discovery.fetching' : 'settings.providers.page.custom.discovery.fetch')}
        </Button>
        {discovered && <CustomProviderModelDiscovery models={discovered.models} existingIds={new Set(form.models.map((model) => model.modelId.trim()))}
          onCancel={() => setDiscovered(null)} onImport={(models) => {
            setForm({ ...form, models: [...form.models.filter((model) => model.modelId.trim() || model.name.trim()), ...models.map(createModelRow)] });
            setDiscovered(null);
          }} />}
        {form.models.map((model, index) => <CustomProviderModelRow key={model.row} model={model} disabled={busy || discovering}
          onChange={(next) => setForm({ ...form, models: form.models.map((row, i) => i === index ? next : row) })}
          onRemove={() => setForm({ ...form, models: form.models.filter((_, i) => i !== index) })} />)}
        <Button type="button" variant="outline" disabled={busy || discovering} onClick={() => setForm({ ...form, models: [...form.models, createModelRow()] })}>{t('settings.providers.page.custom.models.add')}</Button>
      </div>
    </SettingsSection>
    {error && <p role="alert" className="text-sm text-[var(--status-error)]">{error}</p>}
    <div className="flex gap-2">
      <Button type="submit" disabled={busy || discovering}>{t(busy ? 'settings.providers.page.actions.saving' : 'settings.providers.page.custom.actions.save')}</Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>{t('settings.providers.page.actions.cancel')}</Button>
    </div>
  </form>;
}
