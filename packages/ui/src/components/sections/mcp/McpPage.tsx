import React from 'react';
import { MCPServerConfigSchema, type MCPServerConfig } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { SettingsBackButton } from '@/components/sections/shared/SettingsCards';
import { useAutosave, AUTOSAVE_SAVED, AUTOSAVE_UNCHANGED, autosaveFailed } from '@/components/sections/shared/SettingsAutosave';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useI18n } from '@/lib/i18n';
import { useMcpConfigStore, resolveMcpDirectory } from '@/stores/useMcpConfigStore';
import { useMcpStore } from '@/stores/useMcpStore';
import { McpGrid } from './McpGrid';
import { McpOAuthSignIn } from './McpOAuthSignIn';
import { parseImportedMcpSnippet } from './mcpImport';

const McpEditor: React.FC<{ initial: MCPServerConfig; directory: string | null; isNew: boolean }> = ({ initial, directory, isNew }) => {
  const { t } = useI18n();
  const [draft, setDraft] = React.useState(initial);
  const [created, setCreated] = React.useState(!isNew);
  const createdRef = React.useRef(!isNew);
  const saveTail = React.useRef(Promise.resolve());
  const baseline = React.useRef(isNew ? '' : JSON.stringify(initial));
  const mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [snippet, setSnippet] = React.useState('');
  const [secretKey, setSecretKey] = React.useState('');
  const [secretValue, setSecretValue] = React.useState('');
  const [bearer, setBearer] = React.useState(false);
  const [probe, setProbe] = React.useState<string | null>(null);
  const storeError = useMcpConfigStore(state => state.errorsByDirectory[directory ? resolveMcpDirectory(directory) : '']);
  const applyResult = useMcpConfigStore(state => state.applyResultsByDirectory[directory ? resolveMcpDirectory(directory) : '']);
  const statusError = useMcpStore(state => state.getErrorForDirectory(directory));
  const save = async () => {
    const captured = draft;
    const write = saveTail.current.then(async () => {
      if (!mounted.current) return AUTOSAVE_UNCHANGED;
      const serialized = JSON.stringify(captured);
      if (serialized === baseline.current) return AUTOSAVE_UNCHANGED;
      const parsed = MCPServerConfigSchema.safeParse(captured);
      if (!parsed.success) return autosaveFailed(parsed.error.message);
      const result = createdRef.current
        ? await useMcpConfigStore.getState().updateMcp(initial.serverId, parsed.data, directory)
        : await useMcpConfigStore.getState().createMcp(parsed.data, directory);
      if (!mounted.current) return AUTOSAVE_UNCHANGED;
      if (result.result) {
        baseline.current = serialized;
        createdRef.current = true;
        setCreated(true);
      }
      if (!result.ok) return autosaveFailed(result.error);
      return AUTOSAVE_SAVED;
    });
    saveTail.current = write.then(() => undefined, () => undefined);
    return write;
  };
  const autosave = useAutosave(save);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await operation(); } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { if (mounted.current) setBusy(false); }
  };
  const saveSecret = async () => {
    if ((!bearer && !secretKey.trim()) || !secretValue) return;
    const saved = await save();
    if (!saved.ok) throw new Error(saved.reason);
    const workspace = await canonicalClient.resolveWorkspace(resolveMcpDirectory(directory));
    const configuration = useMcpConfigStore.getState().configurationsByDirectory[resolveMcpDirectory(directory)];
    if (!configuration) throw new Error(t('settings.mcp.page.toast.createServerBeforeLiveActions'));
    const result = await canonicalClient.writeWorkspaceMcpCredential(workspace.workspaceId, draft.serverId, { persistedRevision: configuration.persistedRevision, value: secretValue });
    // The secret is never copied into a config, draft, persistent store or catalog.
    if (!mounted.current) return;
    setSecretValue('');
    const current = configuration.config.servers.find(server => server.serverId === draft.serverId);
    if (!current) throw new Error(t('settings.mcp.page.toast.missingServerDetails'));
    const transport = current.transport.type === 'stdio'
      ? { ...current.transport, envCredentialRefs: { ...current.transport.envCredentialRefs, [secretKey.trim()]: result.credentialRef } }
      : bearer ? { ...current.transport, credentialRef: result.credentialRef }
        : { ...current.transport, headerCredentialRefs: { ...current.transport.headerCredentialRefs, [secretKey.trim()]: result.credentialRef } };
    const updated = await useMcpConfigStore.getState().updateMcp(current.serverId, { transport }, directory);
    if (!mounted.current) return;
    // Preserve edits made while the authenticated secret write was in flight.
    setDraft(value => {
      if (value.transport.type !== transport.type) return value;
      return { ...value, transport: value.transport.type === 'stdio'
        ? { ...value.transport, envCredentialRefs: { ...value.transport.envCredentialRefs, [secretKey.trim()]: result.credentialRef } }
        : bearer ? { ...value.transport, credentialRef: result.credentialRef }
          : { ...value.transport, headerCredentialRefs: { ...value.transport.headerCredentialRefs, [secretKey.trim()]: result.credentialRef } } };
    });
    if (!updated.ok) throw new Error(updated.error);
  };
  const refs = draft.transport.type === 'stdio' ? draft.transport.envCredentialRefs : draft.transport.headerCredentialRefs;
  return <SettingsPageLayout title={draft.label || t('settings.mcp.page.header.newServer')}>
    <SettingsBackButton label={t('settings.mcp.page.back')} onClick={() => { useMcpConfigStore.getState().setSelectedMcp(null); useMcpConfigStore.getState().setMcpDraft(null); }} />
    {(error || storeError || statusError) && <p role="alert" className="text-status-error">{error || storeError || statusError}</p>}
    {applyResult && <div role="status">
      <p>{applyResult.status}</p>
      {applyResult.workers.map(worker => <p key={worker.worker.rootSessionId}>{worker.worker.rootSessionId}: {worker.outcome}{worker.outcome === 'failed' ? ` — ${worker.error.detail}` : ''}</p>)}
      {(applyResult.status === 'partial' || applyResult.status === 'failed') && <Button disabled={busy} onClick={() => void run(async () => { const result = await useMcpConfigStore.getState().apply(directory); if (!result.ok) throw new Error(result.error); })}>{t('settings.mcp.sidebar.actions.refreshStatusTitle')}</Button>}
    </div>}
    <div className="space-y-4" onBlurCapture={autosave.onBlurCapture}>
      <label className="block">{t('settings.mcp.page.server.name')}
        <Input value={draft.label} onChange={event => setDraft(value => ({ ...value, label: event.target.value }))} />
      </label>
      <code>{draft.serverId}</code>
      <label className="flex items-center gap-2">{t('settings.mcp.page.server.enable')}
        <Switch checked={draft.enabled} onCheckedChange={enabled => { setDraft(value => ({ ...value, enabled })); autosave.requestSave(); }} />
      </label>
      <label className="block">{t('settings.mcp.page.server.transportMode')}
        <select value={draft.transport.type} onChange={event => {
          const type = event.target.value;
          setDraft(value => ({ ...value, transport: type === 'stdio' ? { type, command: '', args: [] } : { type: type === 'sse' ? 'sse' : 'http', url: '' } }));
        }}>
          <option value="stdio">stdio</option><option value="http">HTTP</option><option value="sse">SSE</option>
        </select>
      </label>
      {draft.transport.type === 'stdio' ? <label className="block">{t('settings.mcp.page.connection.command')}
        <Textarea aria-label={t('settings.mcp.page.connection.command')} value={[draft.transport.command, ...draft.transport.args].join('\n')} onChange={event => {
          const [command = '', ...args] = event.target.value.split('\n');
          setDraft(value => value.transport.type === 'stdio' ? { ...value, transport: { ...value.transport, command, args } } : value);
        }} />
      </label> : <label className="block">{t('settings.mcp.page.connection.serverUrl')}
        <Input aria-label={t('settings.mcp.page.connection.serverUrl')} value={draft.transport.url} onChange={event => setDraft(value => value.transport.type !== 'stdio' ? { ...value, transport: { ...value.transport, url: event.target.value } } : value)} />
      </label>}
      <Button disabled={busy} onClick={() => void run(async () => { const result = await save(); if (!result.ok) throw new Error(result.reason); })}>{t('settings.common.actions.saveChanges')}</Button>
    </div>
    <section className="space-y-2 mt-6">
      <h3>{draft.transport.type === 'stdio' ? t('settings.mcp.page.env.title') : t('settings.mcp.page.advanced.requestHeaders')}</h3>
      {Object.entries(refs ?? {}).map(([key, reference]) => <div key={key} className="flex gap-2"><code>{key}: {reference}</code><Button onClick={() => {
        const next = { ...refs }; delete next[key];
        setDraft(value => ({ ...value, transport: value.transport.type === 'stdio' ? { ...value.transport, envCredentialRefs: next } : { ...value.transport, headerCredentialRefs: next } }));
        autosave.requestSave();
      }}>{t('settings.mcp.page.env.removeVariableAria')}</Button></div>)}
      {draft.transport.type !== 'stdio' && <label><input type="checkbox" checked={bearer} onChange={event => setBearer(event.target.checked)} />Authorization: Bearer</label>}
      {!bearer && <Input aria-label={t('settings.mcp.page.env.key')} placeholder={t('settings.mcp.page.env.key')} value={secretKey} onChange={event => setSecretKey(event.target.value)} />}
      <Input type="password" autoComplete="off" aria-label={t('settings.mcp.page.env.value')} placeholder={t('settings.mcp.page.env.value')} value={secretValue} onChange={event => setSecretValue(event.target.value)} />
      <Button disabled={busy || !secretValue || (!bearer && !secretKey.trim())} onClick={() => void run(saveSecret)}>{t('settings.common.actions.saveChanges')}</Button>
    </section>
    <section className="space-y-2 mt-6">
      <Textarea aria-label={t('settings.mcp.page.importDialog.title')} value={snippet} onChange={event => setSnippet(event.target.value)} />
      <Button onClick={() => { try { const imported = parseImportedMcpSnippet(snippet); setDraft({ ...imported, serverId: initial.serverId }); setError(null); } catch (failure) { setError(String(failure)); } }}>{t('settings.mcp.page.server.importJson')}</Button>
    </section>
    {created && <section className="space-y-3 mt-6">
      <Button disabled={busy} onClick={() => void run(async () => {
        const result = await useMcpStore.getState().testConnection(draft.serverId, directory);
        if (mounted.current) setProbe(result.status === 'connected' ? t('settings.mcp.page.toast.connectionTestSucceeded') : result.error?.detail ?? t('settings.mcp.page.toast.connectionTestFailed'));
      })}>{t('settings.mcp.page.actions.testConnection')}</Button>
      <Button disabled={busy} onClick={() => void run(() => useMcpStore.getState().reconnect(draft.serverId, directory))}>{t('settings.mcp.page.actions.connect')}</Button>
      {probe && <p role="status">{probe}</p>}
      {draft.transport.type !== 'stdio' && <McpOAuthSignIn serverId={draft.serverId} directory={directory} onConnected={() => useMcpStore.getState().reconnect(draft.serverId, directory)} />}
    </section>}
  </SettingsPageLayout>;
};

export const McpPage: React.FC = () => {
  const directory = useSettingsDirectory();
  const selected = useMcpConfigStore(state => state.selectedMcpName);
  const draft = useMcpConfigStore(state => state.mcpDraft);
  const stored = useMcpConfigStore(state => selected ? state.getMcpByName(selected, directory) : undefined);
  if (!selected || (!stored && !draft)) return <McpGrid />;
  const initial = stored ?? draft;
  return initial ? <McpEditor key={`${directory}:${selected}`} initial={initial} directory={directory} isNew={!stored} /> : <McpGrid />;
};
