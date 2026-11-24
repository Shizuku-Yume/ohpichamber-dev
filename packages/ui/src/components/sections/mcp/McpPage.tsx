import React from 'react';
import { MCPServerConfigSchema, type MCPServerConfig } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui';
import { Icon } from '@/components/icon/Icon';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { SettingsBackButton, SettingsCardPill, type SettingsCardTone } from '@/components/sections/shared/SettingsCards';
import {
  SettingsSection,
  SettingsFieldRow,
  SettingsCheckboxRow,
  SETTINGS_FIELD_LABEL_CLASS,
  SETTINGS_HELPER_CLASS,
  SETTINGS_ICON_BUTTON_CLASS,
  SETTINGS_WIDTH_SELECT_CLASS,
  SETTINGS_WIDTH_SHORT_TEXT_CLASS,
  SETTINGS_SPACE_ROW_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { readClipboardText } from '@/lib/clipboard';
import {
  useAutosave,
  AUTOSAVE_SAVED,
  AUTOSAVE_UNCHANGED,
  autosaveFailed,
} from '@/components/sections/shared/SettingsAutosave';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SortableTabsStrip, type SortableTabsStripItem } from '@/components/ui/sortable-tabs-strip';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { useI18n, type I18nKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useMcpConfigStore, resolveMcpDirectory } from '@/stores/useMcpConfigStore';
import { getMcpServerStatus, isMcpServerConnected, useMcpStore } from '@/stores/useMcpStore';
import { McpGrid } from './McpGrid';
import { McpOAuthSignIn } from './McpOAuthSignIn';
import { McpImportError, normalizeEnvKey, normalizeHeaderKey, parseImportedMcpSnippet } from './mcpImport';
import { mcpServerIdFrom } from './mcpServerId';
import { problemMessage } from '@/lib/problemMessage';

type RemoteTransportType = 'http' | 'sse';
type RemoteTransport = Extract<MCPServerConfig['transport'], { type: 'http' | 'sse' }>;
type McpRuntimeStatus = 'ready' | 'unavailable' | 'disabled' | 'unapplied';
type CredentialKind = 'environment' | 'headers';

interface CredentialDraftRow {
  key: string;
  value: string;
}

const REMOTE_TRANSPORT_LABELS = {
  http: 'HTTP',
  sse: 'SSE',
} as const satisfies Record<RemoteTransportType, string>;

interface CommandTextareaProps {
  value: string[];
  onChange: (value: string[]) => void;
  preview: (count: number) => string;
  onDetectUrl?: (url: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
}

function parseShellCommand(raw: string): string[] {
  const args: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (character === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (character === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if ((character === ' ' || character === '\t') && !inSingle && !inDouble) {
      if (current) { args.push(current); current = ''; }
      continue;
    }
    current += character;
  }
  if (current) args.push(current);
  return args;
}

const CommandTextarea: React.FC<CommandTextareaProps> = ({ value, onChange, preview, onDetectUrl, disabled, readOnly }) => {
  const [text, setText] = React.useState(() => value.join('\n'));
  const previousValue = React.useRef(value);

  React.useEffect(() => {
    if (JSON.stringify(previousValue.current) !== JSON.stringify(value)) {
      previousValue.current = value;
      setText(value.join('\n'));
    }
  }, [value]);

  const commit = (raw: string) => {
    const lines = raw.split('\n').filter((line) => line.trim().length > 0);
    // A single line that is only a URL is a hosted server, not a command.
    if (onDetectUrl && lines.length === 1 && /^https?:\/\/\S+$/i.test(lines[0].trim())) {
      onDetectUrl(lines[0].trim());
      return;
    }
    onChange(lines);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (disabled || readOnly) return;
    const raw = event.clipboardData.getData('text');
    const trimmed = raw.trim();
    if (!trimmed || trimmed.includes('\n') || !/\s/.test(trimmed)) return;
    const target = event.currentTarget;
    if (target.selectionStart !== 0 || target.selectionEnd !== target.value.length) return;
    event.preventDefault();
    const lines = parseShellCommand(trimmed);
    setText(lines.join('\n'));
    onChange(lines);
  };

  return (
    <div className="space-y-2" data-bwignore="true" data-1p-ignore="true" data-lpignore="true">
      <Textarea
        onPaste={handlePaste}
        value={text}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(event) => {
          if (disabled || readOnly) return;
          setText(event.target.value);
          commit(event.target.value);
        }}
        onBlur={() => {
          if (disabled || readOnly) return;
          const cleaned = text.split('\n').map((line) => line.trimEnd()).join('\n');
          setText(cleaned);
          commit(cleaned);
        }}
        placeholder={'npx\n-y\n@modelcontextprotocol/server-postgres\npostgresql://user:pass@host/db'}
        rows={Math.max(4, value.length + 1)}
        className="font-mono typography-meta min-h-[80px]"
        spellCheck={false}
      />

      {value.length > 0 ? (
        <details className="group">
          <summary className="typography-micro text-muted-foreground/60 cursor-pointer select-none hover:text-muted-foreground">
            {preview(value.length)}
          </summary>
          <div className="mt-1 overflow-x-auto rounded-md bg-[var(--surface-elevated)] px-3 py-2">
            <code className="typography-micro whitespace-pre text-foreground/80">
              {value.map((argument, index) => (
                <span key={index} className="block">
                  <span className="mr-2 select-none text-muted-foreground">[{index}]</span>
                  {argument}
                </span>
              ))}
            </code>
          </div>
        </details>
      ) : null}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Credential editor: references are shown, new values are write-only.
// ─────────────────────────────────────────────────────────────
interface CredentialEditorProps {
  kind: CredentialKind;
  references: Record<string, string>;
  bearerReference?: string;
  rows: CredentialDraftRow[];
  bearerDraft: string;
  onRowsChange: (rows: CredentialDraftRow[]) => void;
  onBearerDraftChange: (value: string) => void;
  onRemoveReference: (key: string) => void;
  onRemoveBearer: () => void;
  onSave: () => void;
  saving: boolean;
  disabled: boolean;
}

const CredentialEditor: React.FC<CredentialEditorProps> = ({
  kind,
  references,
  bearerReference,
  rows,
  bearerDraft,
  onRowsChange,
  onBearerDraftChange,
  onRemoveReference,
  onRemoveBearer,
  onSave,
  saving,
  disabled,
}) => {
  const { t } = useI18n();
  const isEnv = kind === 'environment';
  const keyLabel = isEnv ? t('settings.mcp.page.env.key') : t('settings.mcp.page.advanced.headerNamePlaceholder');
  const keyTransform = isEnv ? normalizeEnvKey : normalizeHeaderKey;
  const pasteLabel = isEnv ? t('settings.mcp.page.env.pasteEnv') : t('settings.mcp.page.advanced.pasteHeaders');
  const pasteTitle = isEnv ? t('settings.mcp.page.env.pasteEnvTitle') : t('settings.mcp.page.advanced.pasteHeadersTitle');
  const configuredKeys = Object.keys(references);

  const updateRow = (index: number, field: 'key' | 'value', value: string) => {
    onRowsChange(rows.map((row, position) => position === index ? { ...row, [field]: value } : row));
  };

  const removeRow = (index: number) => {
    onRowsChange(rows.filter((_, position) => position !== index));
  };

  const addRow = () => {
    onRowsChange([...rows, { key: '', value: '' }]);
  };

  const pastePairs = async () => {
    try {
      const raw = await readClipboardText();
      const parsed: CredentialDraftRow[] = [];
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const separator = trimmed.indexOf('=');
        if (separator === -1) continue;
        const key = keyTransform(trimmed.slice(0, separator).trim());
        let value = trimmed.slice(separator + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!key) continue;
        parsed.push({ key, value });
      }
      if (parsed.length === 0) {
        toast.error(t('settings.mcp.page.toast.noKeyValuePairsFound'));
        return;
      }
      // Merge into the pending rows: same key replaces, new keys append.
      const merged = [...rows];
      for (const pair of parsed) {
        const existing = merged.findIndex((row) => row.key === pair.key);
        if (existing === -1) merged.push(pair);
        else merged[existing] = pair;
      }
      onRowsChange(merged);
    } catch (error) {
      toast.error(problemMessage(error, t('settings.mcp.page.toast.clipboardReadFailed')));
    }
  };

  const hasPending = rows.some((row) => row.key.trim() !== '' && row.value !== '') || bearerDraft !== '';

  return (
    <div className={SETTINGS_SPACE_ROW_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span className={cn('truncate typography-micro text-muted-foreground @xl:flex-none', SETTINGS_WIDTH_SHORT_TEXT_CLASS)}>{keyLabel}</span>
          <span className="typography-micro text-muted-foreground">{t('settings.mcp.page.env.value')}</span>
        </div>
        <Button
          variant="ghost"
          size="xs"
          className="gap-1 text-muted-foreground"
          onClick={() => void pastePairs()}
          type="button"
          title={pasteTitle}
          disabled={disabled}
        >
          <Icon name="clipboard" className="size-3" />
          {pasteLabel}
        </Button>
      </div>

      <div className={SETTINGS_SPACE_ROW_CLASS}>
        {configuredKeys.map((key) => (
          <div key={key} className="flex min-w-0 flex-col gap-2 @xl:flex-row @xl:items-center">
            <div className={cn('min-w-0 @xl:flex-none', SETTINGS_WIDTH_SHORT_TEXT_CLASS)}>
              <Input
                value={key}
                readOnly
                aria-label={isEnv ? t('settings.mcp.page.env.key') : key}
                className="font-mono typography-meta"
              />
            </div>
            <div className="relative flex min-w-0 flex-1 items-center">
              <Input
                value="••••••••"
                readOnly
                type="password"
                aria-label={`${key} ${t('settings.common.status.saved')}`}
                className="w-full pr-8 font-mono typography-meta"
              />
              <span className="absolute right-2 typography-micro text-muted-foreground">
                {t('settings.common.status.saved')}
              </span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className={cn(SETTINGS_ICON_BUTTON_CLASS, 'shrink-0 hover:text-[var(--status-error)]')}
              onClick={() => onRemoveReference(key)}
              aria-label={t('settings.mcp.page.env.removeVariableAria')}
              disabled={disabled}
            >
              <Icon name="delete-bin" className="size-3.5" />
            </Button>
          </div>
        ))}

        {!isEnv && bearerReference !== undefined ? (
          <div className="flex min-w-0 flex-col gap-2 @xl:flex-row @xl:items-center">
            <div className={cn('min-w-0 @xl:flex-none', SETTINGS_WIDTH_SHORT_TEXT_CLASS)}>
              <Input value="Authorization" readOnly aria-label={t('settings.mcp.page.advanced.headers')} className="font-mono typography-meta" />
            </div>
            <div className="relative flex min-w-0 flex-1 items-center">
              <Input value="Bearer ••••••••" readOnly type="password" aria-label={`Authorization ${t('settings.common.status.saved')}`} className="w-full pr-8 font-mono typography-meta" />
              <span className="absolute right-2 typography-micro text-muted-foreground">{t('settings.common.status.saved')}</span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className={cn(SETTINGS_ICON_BUTTON_CLASS, 'shrink-0 hover:text-[var(--status-error)]')}
              onClick={onRemoveBearer}
              aria-label={t('settings.mcp.page.env.removeVariableAria')}
              disabled={disabled}
            >
              <Icon name="delete-bin" className="size-3.5" />
            </Button>
          </div>
        ) : null}

        {rows.map((row, index) => (
          <div key={index} className="flex min-w-0 flex-col gap-2 @xl:flex-row @xl:items-center">
            <div className={cn('min-w-0 @xl:flex-none', SETTINGS_WIDTH_SHORT_TEXT_CLASS)}>
              <Input
                value={row.key}
                onChange={(event) => updateRow(index, 'key', keyTransform(event.target.value))}
                placeholder={isEnv ? t('settings.mcp.page.env.keyPlaceholder') : t('settings.mcp.page.advanced.headerNamePlaceholder')}
                aria-label={t('settings.mcp.page.env.key')}
                className="font-mono typography-meta"
                data-bwignore="true"
                data-1p-ignore="true"
                data-lpignore="true"
                spellCheck={false}
                disabled={disabled}
              />
            </div>
            <Input
              type="password"
              value={row.value}
              onChange={(event) => updateRow(index, 'value', event.target.value)}
              placeholder={t('settings.mcp.page.env.valuePlaceholder')}
              aria-label={t('settings.mcp.page.env.value')}
              className="w-full flex-1 font-mono typography-meta"
              autoComplete="new-password"
              data-bwignore="true"
              data-1p-ignore="true"
              data-lpignore="true"
              spellCheck={false}
              disabled={disabled}
            />
            <Button
              size="icon"
              variant="ghost"
              className={cn(SETTINGS_ICON_BUTTON_CLASS, 'shrink-0 hover:text-[var(--status-error)]')}
              onClick={() => removeRow(index)}
              aria-label={t('settings.mcp.page.env.removeVariableAria')}
              disabled={disabled}
            >
              <Icon name="delete-bin" className="size-3.5" />
            </Button>
          </div>
        ))}

        {!isEnv ? (
          <div className="flex min-w-0 flex-col gap-2 @xl:flex-row @xl:items-center">
            <span className={cn('truncate typography-meta text-muted-foreground @xl:flex-none', SETTINGS_WIDTH_SHORT_TEXT_CLASS)}>Authorization: Bearer</span>
            <Input
              type="password"
              value={bearerDraft}
              onChange={(event) => onBearerDraftChange(event.target.value)}
              placeholder={t('settings.mcp.page.env.valuePlaceholder')}
              aria-label={t('settings.mcp.page.advanced.headers')}
              className="min-w-0 flex-1 font-mono typography-meta"
              autoComplete="new-password"
              data-bwignore="true"
              data-1p-ignore="true"
              data-lpignore="true"
              spellCheck={false}
              disabled={disabled}
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="xs" className=" gap-1.5" onClick={addRow} type="button" disabled={disabled}>
          <Icon name="add" className="size-3.5" />
          {isEnv ? t('settings.mcp.page.env.addVariable') : t('settings.providers.page.custom.headers.add')}
        </Button>
        {hasPending ? (
          <Button size="xs" onClick={onSave} disabled={disabled || saving}>
            {saving ? t('settings.common.actions.saving') : t('settings.common.actions.saveChanges')}
          </Button>
        ) : null}
      </div>
    </div>
  );
};

const statusPillProps = (status: McpRuntimeStatus, enabled: boolean, t: (key: I18nKey) => string): { tone: SettingsCardTone; label: string } => {
  if (!enabled) return { tone: 'neutral', label: t('settings.mcp.grid.status.disabled') };
  if (status === 'ready') return { tone: 'success', label: t('settings.mcp.page.status.label.connected') };
  if (status === 'unavailable') return { tone: 'error', label: t('settings.mcp.page.status.label.failed') };
  return { tone: 'neutral', label: t('settings.mcp.grid.status.pending') };
};
const statusDescription = (status: McpRuntimeStatus, error: string | undefined, t: (key: I18nKey) => string): string => {
  if (status === 'ready') return t('settings.mcp.page.status.description.connected');
  if (status === 'disabled') return t('settings.mcp.page.status.description.disabled');
  if (status === 'unavailable') return error || t('settings.mcp.page.status.description.failedDefault');
  return t('settings.mcp.page.status.description.default');
};

const McpEditor: React.FC<{ initial: MCPServerConfig; directory: string | null; isNew: boolean }> = ({ initial, directory, isNew }) => {
  const { t } = useI18n();
  const isReadOnly = initial.managed === false;
  const [draft, setDraft] = React.useState(initial);
  const [created, setCreated] = React.useState(!isNew);
  const createdRef = React.useRef(!isNew);
  const persistedServerId = React.useRef(initial.serverId);
  const saveTail = React.useRef(Promise.resolve());
  const baseline = React.useRef(isNew ? '' : JSON.stringify(initial));
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [snippet, setSnippet] = React.useState('');
  const [importOpen, setImportOpen] = React.useState(false);
  const [importError, setImportError] = React.useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [probe, setProbe] = React.useState<string | null>(null);
  const [credentialRows, setCredentialRows] = React.useState<CredentialDraftRow[]>([]);
  const [bearerDraft, setBearerDraft] = React.useState('');
  const [savingCredentials, setSavingCredentials] = React.useState(false);
  const lastStdio = React.useRef(initial.transport.type === 'stdio' ? initial.transport : null);
  const lastRemote = React.useRef<RemoteTransport | null>(initial.transport.type === 'stdio' ? null : initial.transport);
  const directoryKey = directory ? resolveMcpDirectory(directory) : '';
  const storeError = useMcpConfigStore(state => state.errorsByDirectory[directoryKey]);
  const applyResult = useMcpConfigStore(state => state.applyResultsByDirectory[directoryKey]);
  const statusError = useMcpStore(state => state.getErrorForDirectory(directory));
  const statusEntry = useMcpStore(state => state.getStatusForDirectory(directory)[initial.serverId]);

  const save = async () => {
    const captured = draft;
    const write = saveTail.current.then(async () => {
      if (!mounted.current || isReadOnly) return AUTOSAVE_UNCHANGED;
      // A new server is an in-memory draft until Create writes it once.
      if (!createdRef.current) return AUTOSAVE_UNCHANGED;
      const serialized = JSON.stringify(captured);
      if (serialized === baseline.current) return AUTOSAVE_UNCHANGED;
      const parsed = MCPServerConfigSchema.safeParse(captured);
      if (!parsed.success) return autosaveFailed(parsed.error.message);
      const runtimeKey = getRuntimeKey();
      if (getRuntimeKey() !== runtimeKey) return AUTOSAVE_UNCHANGED;
      const result = await useMcpConfigStore.getState().updateMcp(persistedServerId.current, parsed.data, directory);
      if (!mounted.current || getRuntimeKey() !== runtimeKey) return AUTOSAVE_UNCHANGED;
      if (result.result) baseline.current = serialized;
      if (!result.ok) return autosaveFailed(result.error);
      return AUTOSAVE_SAVED;
    });
    saveTail.current = write.then(() => undefined, () => undefined);
    return write;
  };
  const autosave = useAutosave(save);
  const requestSave = () => {
    if (isReadOnly) return;
    autosave.requestSave();
  };

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const updateTransport = (transport: MCPServerConfig['transport'], write = true) => {
    if (isReadOnly) return;
    setDraft(value => ({ ...value, transport }));
    if (write) requestSave();
  };

  const switchKind = (kind: 'local' | 'remote') => {
    if (isReadOnly) return;
    if (kind === 'local') {
      updateTransport(lastStdio.current ?? { type: 'stdio', command: '', args: [] });
      return;
    }
    updateTransport(lastRemote.current ?? { type: 'http', url: '' });
  };

  const changeRemoteTransport = (type: RemoteTransportType) => {
    if (isReadOnly || draft.transport.type === 'stdio') return;
    updateTransport(type === 'sse'
      ? { type: 'sse', url: draft.transport.url }
      : { type: 'http', url: draft.transport.url });
  };

  const handleUrlChange = (url: string) => {
    if (isReadOnly || draft.transport.type === 'stdio') return;
    setDraft(value => value.transport.type === 'stdio' ? value : { ...value, transport: { ...value.transport, url } });
  };

  const handleDetectedUrl = (url: string) => {
    if (isReadOnly) return;
    lastRemote.current = { type: 'http', url };
    updateTransport({ type: 'http', url });
  };

  const handleCreate = async () => {
    if (createdRef.current) return;
    const parsed = MCPServerConfigSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await useMcpConfigStore.getState().createMcp(parsed.data, directory);
      if (!mounted.current) return;
      if (result.result) {
        createdRef.current = true;
        persistedServerId.current = parsed.data.serverId;
        baseline.current = JSON.stringify(parsed.data);
        setCreated(true);
        void useMcpStore.getState().refresh({ directory, silent: true });
      }
      if (!result.ok) setError(problemMessage(result.error, t('settings.mcp.page.toast.saveFailed')));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const handleCancel = () => {
    useMcpConfigStore.getState().setMcpDraft(null);
    useMcpConfigStore.getState().setSelectedMcp(null);
  };

  const handleDelete = async () => {
    if (!createdRef.current) {
      handleCancel();
      return;
    }
    setDeleting(true);
    try {
      const result = await useMcpConfigStore.getState().deleteMcp(initial.serverId, directory);
      if (result.result) {
        setDeleteOpen(false);
        handleCancel();
        void useMcpStore.getState().refresh({ directory, silent: true });
      }
      if (!result.ok) setError(result.error);
    } finally {
      if (mounted.current) setDeleting(false);
    }
  };

  const handleConnectionAction = async () => {
    setBusy(true);
    setError(null);
    try {
      const nextEnabled = connected ? false : true;
      const result = await useMcpConfigStore.getState().updateMcp(initial.serverId, { enabled: nextEnabled }, directory);
      if (result.result) {
        if (JSON.stringify(draft) === baseline.current) baseline.current = JSON.stringify({ ...draft, enabled: nextEnabled });
        setDraft(value => ({ ...value, enabled: nextEnabled }));
        await useMcpStore.getState().refresh({ directory, silent: true });
      }
      if (!result.ok) throw new Error(problemMessage(result.error, t('settings.mcp.page.toast.saveFailed')));
      if (nextEnabled) await useMcpStore.getState().reconnect(initial.serverId, directory);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const handleTestConnection = async () => {
    setProbe(null);
    await run(async () => {
      const saved = await save();
      if (!saved.ok) throw new Error(saved.reason);
      const result = await useMcpStore.getState().testConnection(initial.serverId, directory);
      if (!mounted.current) return;
      setProbe(result.status === 'connected'
        ? t('settings.mcp.page.toast.connectionTestSucceeded')
        : result.error.detail || t('settings.mcp.page.toast.connectionTestFailed'));
    });
  };

  const saveCredentials = async () => {
    if (!createdRef.current) {
      setError(t('settings.mcp.page.toast.createServerBeforeLiveActions'));
      return;
    }
    const rows = credentialRows.filter((row) => row.key.trim() !== '' && row.value !== '');
    if (rows.length === 0 && !bearerDraft) return;
    setSavingCredentials(true);
    setError(null);
    const capturedDraft = draft;
    const runtimeKey = getRuntimeKey();
    const assertRuntime = () => {
      if (getRuntimeKey() !== runtimeKey) throw new Error('Runtime changed.');
    };
    try {
      assertRuntime();
      const saved = await save();
      assertRuntime();
      if (!saved.ok) throw new Error(saved.reason);
      assertRuntime();
      const workspace = await canonicalClient.resolveWorkspace(resolveMcpDirectory(directory));
      assertRuntime();
      let configuration = useMcpConfigStore.getState().configurationsByDirectory[directoryKey];
      if (!configuration) throw new Error(t('settings.mcp.page.toast.createServerBeforeLiveActions'));
      let persistedRevision = configuration.persistedRevision;
      const refs = new Map<string, string>(Object.entries(draft.transport.type === 'stdio'
        ? draft.transport.envCredentialRefs ?? {}
        : draft.transport.headerCredentialRefs ?? {}));
      for (const row of rows) {
        const key = draft.transport.type === 'stdio' ? normalizeEnvKey(row.key) : row.key;
        if (!key) continue;
        assertRuntime();
        const credential = await canonicalClient.writeWorkspaceMcpCredential(workspace.workspaceId, persistedServerId.current, { persistedRevision, value: row.value });
        assertRuntime();
        persistedRevision = credential.persistedRevision;
        refs.set(key, credential.credentialRef);
      }
      let bearerReference: string | undefined;
      if (bearerDraft) {
        assertRuntime();
        const credential = await canonicalClient.writeWorkspaceMcpCredential(workspace.workspaceId, persistedServerId.current, { persistedRevision, value: bearerDraft });
        assertRuntime();
        persistedRevision = credential.persistedRevision;
        bearerReference = credential.credentialRef;
      }
      // A credential write may advance the persisted revision; read it before CAS.
      if (configuration.persistedRevision !== persistedRevision) {
        assertRuntime();
        await useMcpConfigStore.getState().loadMcpConfigs({ directory, force: true });
        assertRuntime();
        configuration = useMcpConfigStore.getState().configurationsByDirectory[directoryKey];
        if (!configuration) throw new Error(t('settings.mcp.page.toast.createServerBeforeLiveActions'));
      }
      const nextRefs = Object.fromEntries(refs);
      let transport: MCPServerConfig['transport'];
      if (draft.transport.type === 'stdio') {
        transport = { ...draft.transport, envCredentialRefs: nextRefs };
      } else if (bearerReference) {
        transport = { ...draft.transport, credentialRef: bearerReference, headerCredentialRefs: nextRefs };
      } else {
        transport = { ...draft.transport, headerCredentialRefs: nextRefs };
      }
      assertRuntime();
      const updated = await useMcpConfigStore.getState().updateMcp(persistedServerId.current, { transport }, directory);
      assertRuntime();
      if (!updated.result) {
        throw new Error(!updated.ok ? problemMessage(updated.error, t('settings.mcp.page.toast.saveFailed')) : t('settings.mcp.page.toast.saveFailed'));
      }
      if (!mounted.current) return;
      assertRuntime();
      setDraft(value => {
        if (value.transport.type !== transport.type) return value;
        let next = value;
        if (value.transport.type === 'stdio') {
          next = { ...value, transport: { ...value.transport, envCredentialRefs: nextRefs } };
        } else if (bearerReference) {
          next = { ...value, transport: { ...value.transport, credentialRef: bearerReference, headerCredentialRefs: nextRefs } };
        } else {
          next = { ...value, transport: { ...value.transport, headerCredentialRefs: nextRefs } };
        }
        if (JSON.stringify(value) === JSON.stringify(capturedDraft)) baseline.current = JSON.stringify(next);
        return next;
      });
      setCredentialRows([]);
      setBearerDraft('');
      if (!updated.ok) setError(updated.error);
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (mounted.current) setSavingCredentials(false);
    }
  };

  const removeCredentialReference = (key: string) => {
    if (draft.transport.type === 'stdio') {
      const envCredentialRefs = { ...draft.transport.envCredentialRefs };
      delete envCredentialRefs[key];
      updateTransport({ ...draft.transport, envCredentialRefs });
      return;
    }
    const headerCredentialRefs = { ...draft.transport.headerCredentialRefs };
    delete headerCredentialRefs[key];
    updateTransport({ ...draft.transport, headerCredentialRefs });
  };

  const removeBearerReference = () => {
    if (draft.transport.type === 'stdio') return;
    const next = { ...draft.transport };
    delete next.credentialRef;
    updateTransport(next);
  };

  const handleImport = () => {
    try {
      const imported = parseImportedMcpSnippet(snippet);
      setDraft({ ...imported.server, serverId: initial.serverId, scope: draft.scope ?? initial.scope ?? 'project' });
      setCredentialRows(imported.credentials);
      setBearerDraft('');
      setImportOpen(false);
      setSnippet('');
      setImportError(null);
      toast.success(t('settings.mcp.page.toast.configImported'));
      if (imported.droppedFields.length) toast.info(t('settings.mcp.page.import.dropped', { fields: imported.droppedFields.join(', ') }));
      if (imported.credentials.length) toast.info(t('settings.mcp.page.import.credentials'));
    } catch (failure) {
      setImportError(failure instanceof McpImportError
        ? t(`settings.mcp.page.import.${failure.code}`, { key: failure.key ?? '' })
        : t('settings.mcp.page.import.invalid'));
    }
  };

  const handlePasteImportClipboard = async () => {
    try {
      const text = await readClipboardText();
      setSnippet(text);
      setImportError(null);
    } catch (error) {
      setImportError(problemMessage(error, t('settings.mcp.page.toast.clipboardReadFailed')));
    }
  };

  const status: McpRuntimeStatus = created ? getMcpServerStatus(statusEntry) : 'unapplied';
  const connected = created && isMcpServerConnected(statusEntry);
  const connectionKind: 'local' | 'remote' = draft.transport.type === 'stdio' ? 'local' : 'remote';
  const connectionTabs = React.useMemo<SortableTabsStripItem[]>(() => [
    { id: 'local', label: t('settings.mcp.page.connection.kindCommand'), icon: <Icon name="terminal" className="size-3.5" /> },
    { id: 'remote', label: t('settings.mcp.page.connection.kindLink'), icon: <Icon name="global" className="size-3.5" /> },
  ], [t]);
  const credentials = draft.transport.type === 'stdio'
    ? draft.transport.envCredentialRefs ?? {}
    : draft.transport.headerCredentialRefs ?? {};
  const transportLabel = draft.transport.type === 'stdio'
    ? t('settings.mcp.page.transport.local')
    : draft.transport.type === 'sse'
      ? t('settings.mcp.page.transport.remote')
      : REMOTE_TRANSPORT_LABELS.http;
  const probeFailure = statusEntry?.probe?.status === 'failed' ? statusEntry.probe.error.detail : undefined;
  const statusMessage = statusDescription(status, probeFailure, t);
  const statusPill = statusPillProps(status, draft.enabled, t);
  const failedWorkers = applyResult ? applyResult.workers.filter((worker) => worker.outcome === 'failed') : [];
  const applyStatusLabel = applyResult
    ? applyResult.status === 'applied'
      ? t('settings.plugins.apply.applied')
      : applyResult.status === 'partial'
        ? t('settings.plugins.apply.partial', { failedCount: failedWorkers.length })
        : applyResult.status === 'failed'
          ? t('settings.plugins.apply.failed')
          : t('settings.plugins.apply.noActiveWorkers')
    : null;

  return (
    <>
      <SettingsPageLayout
        title={isNew ? t('settings.mcp.page.header.newServer') : draft.label || initial.serverId}
        titleLeading={(
          <SettingsBackButton
            label={t('settings.mcp.page.back')}
            onClick={() => { useMcpConfigStore.getState().setMcpDraft(null); useMcpConfigStore.getState().setSelectedMcp(null); }}
          />
        )}
        titleAccessory={created ? <SettingsCardPill tone={statusPill.tone}>{statusPill.label}</SettingsCardPill> : undefined}
        description={isNew ? t('settings.mcp.page.header.configureNewServer') : t('settings.mcp.page.header.transport', { type: transportLabel })}
        headerEnd={!isNew && initial.managed !== false ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={connected ? 'outline' : 'default'}
              size="xs"

              onClick={() => void handleConnectionAction()}
              disabled={busy}
            >
              {busy ? t('settings.mcp.page.actions.working') : connected ? t('settings.mcp.page.actions.disconnect') : t('settings.mcp.page.actions.connect')}
            </Button>
            {connected ? (
              <Button variant="ghost" size="xs" className=" gap-1 text-muted-foreground" onClick={() => void handleTestConnection()} disabled={busy || !draft.enabled}>
                {busy ? t('settings.mcp.page.actions.testing') : t('settings.mcp.page.actions.test')}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className={cn(SETTINGS_ICON_BUTTON_CLASS, 'hover:text-[var(--status-error)]')}
              onClick={() => setDeleteOpen(true)}
              disabled={busy}
              aria-label={t('settings.common.actions.delete')}
              title={t('settings.common.actions.delete')}
            >
              <Icon name="delete-bin" className="size-4" />
            </Button>
          </div>
        ) : undefined}
        onBlurCapture={autosave.onBlurCapture}
      >
        {(error || storeError || statusError) ? (
          <p role="alert" className="mb-4 typography-meta text-[var(--status-error)]">{error || storeError || statusError}</p>
        ) : null}

        {created && applyResult ? (
          <SettingsSection divider={false}>
            <div role="status" className="space-y-1">
              <p className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.mcp.page.status.runtimeStatus')}</p>
              <p className={SETTINGS_HELPER_CLASS}>{applyStatusLabel}</p>
              {failedWorkers.map((worker) => (
                <p key={worker.worker.rootSessionId} className="typography-micro text-[var(--status-error)]">
                  {worker.error.detail}
                </p>
              ))}
              {applyResult.status === 'partial' || applyResult.status === 'failed' ? (
                <Button
                  variant="outline"
                  size="xs"
                  disabled={busy}
                  onClick={() => void run(async () => {
                    const result = await useMcpConfigStore.getState().apply(directory);
                    if (!result.ok) throw new Error(result.error);
                  })}
                >
                  {t('settings.mcp.sidebar.actions.refreshStatusTitle')}
                </Button>
              ) : null}
            </div>
          </SettingsSection>
        ) : null}

        {created && (status === 'unavailable' || status === 'ready') ? (
          <SettingsSection divider={false}>
            <div className={cn(
              'rounded-lg border p-3',
              status === 'unavailable'
                ? 'border-[var(--status-error)]/30 bg-[var(--status-error)]/5'
                : 'border-[var(--status-success)]/30 bg-[var(--status-success)]/5',
            )}>
              <div className="space-y-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.mcp.page.status.runtimeStatus')}</span>
                    <SettingsCardPill tone={statusPill.tone}>{statusPill.label}</SettingsCardPill>
                  </div>
                  <p className="typography-meta text-muted-foreground">{statusMessage}</p>
                </div>
                {status === 'unavailable' ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="xs" onClick={() => void handleTestConnection()} disabled={busy || !draft.enabled}>
                      {busy ? t('settings.mcp.page.actions.testing') : t('settings.mcp.page.actions.testConnection')}
                    </Button>
                  </div>
                ) : null}
                {probe ? <p role="status" className="typography-meta text-muted-foreground">{probe}</p> : null}
              </div>
            </div>
          </SettingsSection>
        ) : null}
        {isReadOnly ? (
          <div className="mb-4 rounded-md border border-border/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {t('settings.mcp.page.unmanagedNotice')}
          </div>
        ) : null}
        <SettingsSection
          title={t('settings.mcp.page.server.title')}
          settingsItem="mcp.server"
          titleAccessory={isNew ? (
            <Button
              variant="ghost"
              size="xs"
              className="gap-1.5 text-muted-foreground"
              onClick={() => { setImportOpen(true); setImportError(null); }}
              type="button"
              title={t('settings.mcp.page.server.importJsonTitle')}
            >
              <Icon name="file-code" className="size-3.5" />
              {t('settings.mcp.page.server.importJson')}
            </Button>
          ) : null}
        >
          <SettingsFieldRow
            settingsItem="mcp.name"
            label={t('settings.mcp.page.server.name')}
            controlClassName="flex-wrap @xl:flex-1"
          >
            {isNew ? (
              <>
                <span className="-mr-1 typography-ui-label text-muted-foreground">@</span>
                <Input
                  value={draft.serverId}
                  onChange={(event) => {
                    const serverId = mcpServerIdFrom(event.target.value);
                    setDraft(value => ({ ...value, serverId, label: value.label === value.serverId ? serverId : value.label }));
                  }}
                  placeholder={t('settings.mcp.page.server.namePlaceholder')}
                  className={cn(SETTINGS_WIDTH_SHORT_TEXT_CLASS, 'shrink font-mono')}
                  autoFocus
                />
              </>
            ) : (
              <>
                <Input
                  value={draft.label}
                  onChange={(event) => { if (!isReadOnly) setDraft(value => ({ ...value, label: event.target.value })); }}
                  disabled={busy || isReadOnly}
                  readOnly={isReadOnly}
                  placeholder={t('settings.mcp.page.server.namePlaceholder')}
                  className={SETTINGS_WIDTH_SHORT_TEXT_CLASS}
                  aria-label={t('settings.mcp.page.server.name')}
                />
                <code className="typography-micro text-muted-foreground">{draft.serverId}</code>
              </>
            )}
          </SettingsFieldRow>
          <SettingsFieldRow
            label={t('settings.mcp.page.fields.scope')}
            controlClassName="flex-wrap @xl:flex-1"
          >
            <Select
              value={draft.scope ?? 'project'}
              onValueChange={(val) => {
                if (!isReadOnly) {
                  setDraft((value) => ({ ...value, scope: val as 'project' | 'user' }));
                  requestSave();
                }
              }}
              disabled={busy || isReadOnly}
            >
              <SelectTrigger className={SETTINGS_WIDTH_SELECT_CLASS}>
                <SelectValue>
                  {draft.scope === 'user'
                    ? t('settings.mcp.grid.scope.user')
                    : t('settings.mcp.grid.scope.project')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">{t('settings.mcp.grid.scope.project')}</SelectItem>
                <SelectItem value="user">{t('settings.mcp.grid.scope.user')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingsFieldRow>

          <SettingsCheckboxRow
            checked={draft.enabled}
            onChange={(enabled) => { if (!isReadOnly) { setDraft(value => ({ ...value, enabled })); requestSave(); } }}
            label={t('settings.mcp.page.server.enable')}
            ariaLabel={t('settings.mcp.page.server.enableAria')}
            disabled={busy || isReadOnly}
          />
        </SettingsSection>

        <SettingsSection
          title={t('settings.mcp.page.connection.title')}
          description={t('settings.mcp.page.connection.description')}
          settingsItem="mcp.command"
        >
          <SortableTabsStrip
            items={connectionTabs}
            activeId={connectionKind}
            onSelect={(id) => { if (!isReadOnly) switchKind(id === 'remote' ? 'remote' : 'local'); }}
            layoutMode="fit"
            variant="active-pill"
            activePillLowercase={false}
            className={cn('h-10', isReadOnly && 'pointer-events-none opacity-60')}
          />

          {draft.transport.type === 'stdio' ? (
            <CommandTextarea
              value={draft.transport.command ? [draft.transport.command, ...draft.transport.args] : draft.transport.args}
              disabled={isReadOnly}
              readOnly={isReadOnly}
              onChange={(commandLine) => {
                if (isReadOnly) return;
                const [command = '', ...args] = commandLine;
                lastStdio.current = { type: 'stdio', command, args };
                setDraft(value => value.transport.type === 'stdio' ? { ...value, transport: { ...value.transport, command, args } } : value);
              }}
              preview={(count) => t('settings.mcp.page.connection.previewArgs', { count })}
              onDetectUrl={handleDetectedUrl}
            />
          ) : (
            <>
              <Input
                value={draft.transport.url}
                onChange={(event) => handleUrlChange(event.target.value)}
                disabled={busy || isReadOnly}
                readOnly={isReadOnly}
                placeholder={t('settings.mcp.page.connection.serverUrlPlaceholder')}
                className="font-mono typography-meta"
                aria-label={t('settings.mcp.page.connection.serverUrl')}
              />
              <SettingsFieldRow label={t('settings.mcp.page.server.transportMode')}>
                <Select<RemoteTransportType>
                  value={draft.transport.type}
                  disabled={busy || isReadOnly}
                  onValueChange={(type) => {
                    if (isReadOnly) return;
                    const currentTransport = draft.transport;
                    if (currentTransport.type === 'stdio') return;
                    lastRemote.current = type === 'sse'
                      ? { type: 'sse', url: currentTransport.url }
                      : { type: 'http', url: currentTransport.url };
                    changeRemoteTransport(type);
                  }}
                >
                  <SelectTrigger className={SETTINGS_WIDTH_SELECT_CLASS} disabled={busy || isReadOnly}>
                    <SelectValue>{draft.transport.type === 'sse' ? REMOTE_TRANSPORT_LABELS.sse : REMOTE_TRANSPORT_LABELS.http}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="http">{REMOTE_TRANSPORT_LABELS.http}</SelectItem>
                    <SelectItem value="sse">{REMOTE_TRANSPORT_LABELS.sse}</SelectItem>
                  </SelectContent>
                </Select>
              </SettingsFieldRow>
            </>
          )}

          <p className="typography-micro text-muted-foreground">
            {connectionKind === 'local'
              ? t('settings.mcp.page.connection.hintCommand')
              : t('settings.mcp.page.connection.hintLink')}
          </p>
        </SettingsSection>

        {initial.managed === false ? null : (
          <SettingsSection
            title={draft.transport.type === 'stdio' ? t('settings.mcp.page.env.title') : t('settings.mcp.page.advanced.requestHeaders')}
            description={draft.transport.type === 'stdio' ? t('settings.mcp.page.env.description') : undefined}
            settingsItem={draft.transport.type === 'stdio' ? 'mcp.environment' : 'mcp.headers'}
            titleAccessory={Object.keys(credentials).length > 0 ? (
              <span className="typography-micro font-normal text-muted-foreground">({Object.keys(credentials).length})</span>
            ) : null}
          >
            <CredentialEditor
              kind={draft.transport.type === 'stdio' ? 'environment' : 'headers'}
              references={credentials}
              bearerReference={draft.transport.type === 'stdio' ? undefined : draft.transport.credentialRef}
              rows={credentialRows}
              bearerDraft={draft.transport.type === 'stdio' ? '' : bearerDraft}
              onRowsChange={setCredentialRows}
              onBearerDraftChange={setBearerDraft}
              onRemoveReference={removeCredentialReference}
              onRemoveBearer={removeBearerReference}
              onSave={() => void saveCredentials()}
              saving={savingCredentials}
              disabled={!created || savingCredentials}
            />
          </SettingsSection>
        )}

        {created && draft.transport.type !== 'stdio' ? (
          <SettingsSection title={t('settings.mcp.page.advanced.oauth')}>
            <McpOAuthSignIn
              serverId={initial.serverId}
              directory={directory}
              onConnected={() => useMcpStore.getState().reconnect(initial.serverId, directory)}
            />
          </SettingsSection>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pb-8">
          {!created ? (
            <>
              <Button onClick={() => void handleCreate()} disabled={busy} size="xs">
                {busy ? t('settings.common.actions.saving') : t('settings.common.actions.create')}
              </Button>
              <Button variant="ghost" onClick={handleCancel} disabled={busy} size="xs">
                {t('settings.common.actions.cancel')}
              </Button>
            </>
          ) : null}
          {isNew || initial.managed === false ? null : (
            <Button variant="ghost" size="xs" className=" text-[var(--status-error)] hover:text-[var(--status-error)]" onClick={() => setDeleteOpen(true)} disabled={busy}>
              <Icon name="delete-bin" className="size-3.5" />
              {t('settings.common.actions.delete')}
            </Button>
          )}
        </div>
      </SettingsPageLayout>

      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) {
            setSnippet('');
            setImportError(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('settings.mcp.page.importDialog.title')}</DialogTitle>
            <DialogDescription>{t('settings.mcp.page.importDialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={snippet}
              onChange={(event) => { setSnippet(event.target.value); setImportError(null); }}
              rows={8}
              className="font-mono typography-meta"
              spellCheck={false}
              data-bwignore="true"
              data-1p-ignore="true"
            />
            {importError ? <p className="typography-micro text-[var(--status-error)]">{importError}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="xs" className=" gap-1" onClick={() => void handlePasteImportClipboard()} type="button">
                <Icon name="clipboard" className="size-3.5" />
                {t('settings.mcp.page.importDialog.pasteFromClipboard')}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} className="text-foreground">
              {t('settings.common.actions.cancel')}
            </Button>
            <Button onClick={handleImport} disabled={!snippet.trim()} size="sm">
              {t('settings.common.actions.import')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!open && !deleting) setDeleteOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('settings.mcp.page.deleteDialog.title', { name: draft.label })}</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              {t('settings.common.actions.cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? t('settings.mcp.page.actions.deleting') : t('settings.common.actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export const McpPage: React.FC = () => {
  const directory = useSettingsDirectory();
  const selected = useMcpConfigStore(state => state.selectedMcpName);
  const draft = useMcpConfigStore(state => state.mcpDraft);
  const stored = useMcpConfigStore(state => selected ? state.getMcpByName(selected, directory) : undefined);
  const runtimeKey = React.useSyncExternalStore(subscribeRuntimeEndpointChanged, getRuntimeKey, getRuntimeKey);
  if (!selected || (!stored && !draft)) return <McpGrid />;
  const initial = stored ?? draft;
  return initial ? <McpEditor key={`${runtimeKey}:${directory}:${selected}`} initial={initial} directory={directory} isNew={!stored} /> : <McpGrid />;
};
