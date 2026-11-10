import React from 'react';
import { MCPServerConfigSchema, type MCPServerConfig } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui';
<<<<<<< HEAD
import { Icon } from '@/components/icon/Icon';
=======
import {
  selectMcpServersForDirectory,
  useMcpConfigStore,
  envRecordToArray,
  MCP_PROTOCOLS,
  MCP_CODEMODE_CHOICES,
  codemodeChoiceOf,
  type McpCodemodeChoice,
  type McpDraft,
  type McpProtocol,
  type McpScope,
} from '@/stores/useMcpConfigStore';
import { useShallow } from 'zustand/react/shallow';
import {
  parseImportedMcpSnippet,
  applyImportedMcpToDraft,
} from './mcpImport';
import { useMcpStore } from '@/stores/useMcpStore';
import { McpOAuthSignIn } from './McpOAuthSignIn';
import { getMcpOAuthMethods } from './mcpOAuthIntegration';
import { useMcpOAuthIntegration } from './useMcpOAuthIntegration';
import { MCP_DRAFT_OAUTH_UNSET, normalizeMcpServerName, readCarriedOAuth, type McpOAuthCarried } from './mcpDraft';
import { useIntegrationPolicyBlock } from '@/components/sections/shared/useIntegrationPolicyBlock';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { cn } from '@/lib/utils';
>>>>>>> bc50ba56a
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { SettingsBackButton } from '@/components/sections/shared/SettingsCards';
import {
  SettingsSection,
  SettingsFieldRow,
  SettingsCheckboxRow,
  SETTINGS_FIELD_LABEL_CLASS,
  SETTINGS_HELPER_CLASS,
  SETTINGS_ICON_BUTTON_CLASS,
  SETTINGS_SELECT_ROW_TRIGGER_CLASS,
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
<<<<<<< HEAD
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { useI18n, type I18nKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useMcpConfigStore, resolveMcpDirectory } from '@/stores/useMcpConfigStore';
import { getMcpServerStatus, isMcpServerConnected, useMcpStore } from '@/stores/useMcpStore';
import { McpGrid } from './McpGrid';
import { McpOAuthSignIn } from './McpOAuthSignIn';
import { parseImportedMcpSnippet } from './mcpImport';
=======
import { useI18n } from '@/lib/i18n';
import type { McpServerStatus } from '@/lib/opencode/model';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
>>>>>>> bc50ba56a

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

const normalizeEnvKey = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
const normalizeHeaderKey = (value: string): string => value.replace(/[^!#$%&'*+.^_`|~0-9A-Za-z-]/g, '');

// ─────────────────────────────────────────────────────────────
// CommandTextarea — one argument per line, paste-friendly
// ─────────────────────────────────────────────────────────────
interface CommandTextareaProps {
  value: string[];
  onChange: (value: string[]) => void;
  preview: (count: number) => string;
  onDetectUrl?: (url: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
}

/** Splits a simple shell-like command into argv tokens, honouring quotes. */
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
    // Only take over a paste that replaces the whole field with one command line.
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
          <summary className="typography-micro text-muted-foreground cursor-pointer select-none hover:text-foreground">
            {preview(value.length)}
          </summary>
<<<<<<< HEAD
          <div className="mt-1 overflow-x-auto rounded-md bg-[var(--surface-elevated)] px-3 py-2">
            <code className="typography-micro whitespace-pre text-foreground/80">
              {value.map((argument, index) => (
                <span key={index} className="block">
                  <span className="mr-2 select-none text-muted-foreground">[{index}]</span>
                  {argument}
=======
          <ScrollableOverlay outerClassName="overlay-scrollbar-wrapper--no-gutter mt-1 rounded-md bg-[var(--surface-elevated)]" fillContainer={false} className="px-3 py-2">
            <code className="typography-micro text-foreground/80 whitespace-pre">
              {value.map((a, i) => (
                <span key={i} className="block">
                  <span className="text-muted-foreground select-none me-2">[{i}]</span>
                  {a}
>>>>>>> bc50ba56a
                </span>
              ))}
            </code>
          </ScrollableOverlay>
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

<<<<<<< HEAD
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
=======
const normalizeEnvKey = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9_]/g, '_');

const EnvEditor: React.FC<EnvEditorProps> = ({
  value,
  onChange,
  onCommit,
  keyTransform = normalizeEnvKey,
  keyPlaceholder = 'API_KEY',
  keyInputClassName = 'font-mono typography-meta uppercase',
  pasteLabel = 'Paste .env',
  pasteTitle = 'Paste KEY=VALUE lines from clipboard',
  noPairsFoundError,
  importSuccess,
  clipboardReadFailed,
  keyLabel,
  valueLabel,
  valuePlaceholder,
  hideValueTitle,
  showValueTitle,
  addVariable,
  plainTextWarning,
  removeVariableAria,
>>>>>>> bc50ba56a
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
    } catch {
      toast.error(t('settings.mcp.page.toast.clipboardReadFailed'));
    }
  };

  const hasPending = rows.some((row) => row.key.trim() !== '' && row.value !== '') || bearerDraft !== '';

  // Keys share a prefix (PLAYWRIGHT_MCP_…), so the key column grows to the
  // longest key, in monospace `ch`, up to half the editor; a longer key
  // scrolls in its field and shows whole in the tooltip.
  const longestKey = value.reduce((max, e) => Math.max(max, e.key.length), keyPlaceholder.length);
  const keyWidth = `min(max(9rem, calc(${longestKey + 1}ch + 1.25rem)), 50cqw)`;

  return (
    <div className="space-y-2">
<<<<<<< HEAD
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="typography-micro w-32 shrink-0 text-muted-foreground">{keyLabel}</span>
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

      <div className="space-y-1.5">
        {configuredKeys.map((key) => (
          <div key={key} className="flex items-center gap-2">
            <Input
              value={key}
              readOnly
              aria-label={isEnv ? t('settings.mcp.page.env.key') : key}
              className="w-36 shrink-0 font-mono typography-meta"
            />
            <div className="relative flex flex-1 items-center">
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
          <div className="flex items-center gap-2">
            <Input value="Authorization" readOnly aria-label={t('settings.mcp.page.advanced.headers')} className="w-36 shrink-0 font-mono typography-meta" />
            <div className="relative flex flex-1 items-center">
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
          <div key={index} className="flex items-center gap-2">
            <Input
              value={row.key}
              onChange={(event) => updateRow(index, 'key', keyTransform(event.target.value))}
              placeholder={isEnv ? t('settings.mcp.page.env.keyPlaceholder') : t('settings.mcp.page.advanced.headerNamePlaceholder')}
              aria-label={t('settings.mcp.page.env.key')}
              className="w-36 shrink-0 font-mono typography-meta"
=======
      <div className="@container grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5">
        <span className="typography-micro text-muted-foreground mb-0.5">{keyLabel}</span>
        <div className="col-span-2 mb-0.5 flex min-w-0 flex-wrap items-center justify-between gap-x-2">
          <span className="typography-micro text-muted-foreground">{valueLabel}</span>
          <Button
            variant="ghost"
            size="xs"
            className="!font-normal gap-1 text-muted-foreground"
            onClick={handlePasteDotEnv}
            type="button"
            title={pasteTitle}
          >
            <Icon name="clipboard" className="h-3 w-3" />
            {pasteLabel}
          </Button>
        </div>

        {value.map((entry, idx) => (
          <React.Fragment key={idx}>
            <Input
              value={entry.key}
              onChange={(e) => updateRow(idx, 'key', keyTransform(e.target.value))}
              placeholder={keyPlaceholder}
              className={keyInputClassName}
              style={{ width: keyWidth }}
              title={entry.key || undefined}
>>>>>>> bc50ba56a
              data-bwignore="true"
              data-1p-ignore="true"
              data-lpignore="true"
              spellCheck={false}
              disabled={disabled}
            />
<<<<<<< HEAD
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
=======
            <div className="relative flex items-center">
              <Input
                type={revealedKeys.has(idx) ? 'text' : 'password'}
                value={entry.value}
                onChange={(e) => updateRow(idx, 'value', e.target.value)}
                placeholder={valuePlaceholder}
                className="font-mono typography-meta pe-8 w-full"
                autoComplete="new-password"
                data-bwignore="true"
                data-1p-ignore="true"
                data-lpignore="true"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => toggleReveal(idx)}
                className="absolute inset-e-2 text-muted-foreground hover:text-foreground"
                title={revealedKeys.has(idx) ? hideValueTitle : showValueTitle}
              >
                {revealedKeys.has(idx)
                  ? <Icon name="eye-off" className="h-3.5 w-3.5" />
                  : <Icon name="eye" className="h-3.5 w-3.5" />}
              </button>
            </div>
            <Button size="sm"
              variant="ghost"
              className="h-7 w-7 px-0 text-muted-foreground hover:text-[var(--status-error)]"
              onClick={() => removeRow(idx)}
              aria-label={removeVariableAria}
>>>>>>> bc50ba56a
            >
              <Icon name="delete-bin" className="size-3.5" />
            </Button>
          </React.Fragment>
        ))}

        {!isEnv ? (
          <div className="flex items-center gap-2">
            <span className="w-36 shrink-0 typography-meta text-muted-foreground">Authorization: Bearer</span>
            <Input
              type="password"
              value={bearerDraft}
              onChange={(event) => onBearerDraftChange(event.target.value)}
              placeholder={t('settings.mcp.page.env.valuePlaceholder')}
              aria-label={t('settings.mcp.page.advanced.headers')}
              className="w-full flex-1 font-mono typography-meta"
              autoComplete="new-password"
              data-bwignore="true"
              data-1p-ignore="true"
              data-lpignore="true"
              spellCheck={false}
              disabled={disabled}
            />
            <span className="h-7 w-7 shrink-0" />
          </div>
        ) : null}
      </div>

<<<<<<< HEAD
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
=======
      <Button
        variant="outline"
        size="xs"
        className="!font-normal gap-1.5"
        onClick={addRow}
        type="button"
      >
        <Icon name="add" className="h-3.5 w-3.5" />
        {addVariable}
      </Button>

      {hasSensitiveValues && (
        <p className="typography-micro text-muted-foreground">
          {plainTextWarning}
        </p>
      )}
>>>>>>> bc50ba56a
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Status badge
// ─────────────────────────────────────────────────────────────
const StatusBadge: React.FC<{ status: McpRuntimeStatus; enabled: boolean }> = ({ status, enabled }) => {
  const { t } = useI18n();
  if (!enabled) return <span className="typography-micro rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-muted-foreground">{t('settings.mcp.grid.status.disabled')}</span>;
  if (status === 'ready') return <span className="typography-micro rounded-full bg-[var(--status-success)]/15 px-2 py-0.5 text-[var(--status-success)]">{t('settings.mcp.page.status.label.connected')}</span>;
  if (status === 'unavailable') return <span className="typography-micro rounded-full bg-[var(--status-error)]/15 px-2 py-0.5 text-[var(--status-error)]">{t('settings.mcp.page.status.label.failed')}</span>;
  return <span className="typography-micro rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-muted-foreground">{t('settings.mcp.grid.status.pending')}</span>;
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
      const result = await useMcpConfigStore.getState().updateMcp(initial.serverId, parsed.data, directory);
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
        baseline.current = JSON.stringify(parsed.data);
        setCreated(true);
        void useMcpStore.getState().refresh({ directory, silent: true });
      }
      if (!result.ok) setError(result.error || t('settings.mcp.page.toast.saveFailed'));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const handleCancel = () => {
    useMcpConfigStore.getState().setMcpDraft(null);
    useMcpConfigStore.getState().setSelectedMcp(null);
  };

  const handleDelete = async () => {
<<<<<<< HEAD
    if (!createdRef.current) {
      handleCancel();
=======
    if (!selectedMcpName) return;
    setIsDeleting(true);
    const result = await deleteMcp(selectedMcpName, currentDirectory);
    if (result.ok) {
      if (result.reloadFailed) {
        toast.warning(result.message || t('settings.mcp.page.toast.serverDeletedReloadFailed', { name: selectedMcpName }), {
          description: result.warning || t('settings.mcp.page.toast.refreshListIfStale'),
        });
      } else {
        toast.success(result.message || t('settings.mcp.page.toast.serverDeleted', { name: selectedMcpName }));
      }
      setShowDeleteConfirm(false);
    } else toast.error(t('settings.mcp.page.toast.deleteFailed'));
    setIsDeleting(false);
  };

  /**
   * A `failed` server with an OAuth sign-in is often one whose stored token
   * the service rejected; Connect would only send it again. Its header button
   * becomes "Sign in again", and each press mounts a fresh sign-in that
   * starts on its own and shows only its progress in the status card.
   */
  const runtimeFailed = selectedMcpName ? readMcpStatusName(mcpStatus[selectedMcpName]) === 'failed' : false;
  // The integration decides whether a sign-in exists, not the runtime status:
  // a connected transport can still serve tools that wait on the user's
  // authorization, so a configured remote OAuth server loads its integration
  // whatever status reports (#5934).
  const oauthConfigured = selectedServer?.type === 'remote' && selectedServer.oauth !== false;
  const oauthIntegration = useMcpOAuthIntegration(
    selectedMcpName ?? '',
    currentDirectory,
    runtimeFailed || oauthConfigured,
  );
  const [signInAgain, setSignInAgain] = React.useState<{ server: string; run: number } | null>(null);
  React.useEffect(() => {
    setSignInAgain(null);
  }, [selectedMcpName]);
  /** A sign-in in progress keeps the status card while the server reconnects. */
  const [oauthSignInActive, setOAuthSignInActive] = React.useState(false);

  /**
   * OpenCode has stored the OAuth credential; the server itself is still in
   * `needs_auth` or `failed` until it is connected again with that credential.
   */
  const handleOAuthConnected = async () => {
    if (!selectedMcpName) return;
    setSignInAgain(null);
    try {
      await connectMcp(selectedMcpName, currentDirectory);
      toast.success(t('settings.mcp.page.toast.connected'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.mcp.page.toast.connectionTestFailed'));
    }
  };

  const handleToggleConnect = async () => {
    if (!selectedMcpName) return;
    setIsConnecting(true);
    try {
      const isConnected = readMcpStatusName(mcpStatus[selectedMcpName]) === 'connected';
      if (isConnected) {
        await disconnectMcp(selectedMcpName, currentDirectory);
        toast.success(t('settings.mcp.page.toast.disconnected'));
      } else {
        await connectMcp(selectedMcpName, currentDirectory);
        await refreshStatus({ directory: currentDirectory, silent: true });
        const nextStatus = useMcpStore.getState().getStatusForDirectory(currentDirectory)[selectedMcpName];
        const nextStatusName = readMcpStatusName(nextStatus);
        if (nextStatusName === 'connected') {
          toast.success(t('settings.mcp.page.toast.connected'));
        } else if (nextStatusName === 'needs_auth') {
          toast.message(t('settings.mcp.page.toast.connectionNeedsAuthorization'));
        } else if (nextStatusName === 'failed') {
          toast.error(readMcpStatusError(nextStatus) || t('settings.mcp.page.toast.connectionFailed'));
        } else {
          toast.message(t('settings.mcp.page.toast.connectionAttemptFinished'));
        }
        return;
      }
      await refreshStatus({ directory: currentDirectory, silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.mcp.page.toast.connectionFailed'));
    } finally {
      setIsConnecting(false);
    }
  };

  const requireSavedConfig = React.useCallback((): boolean => {
    if (isNewServer) {
      toast.error(t('settings.mcp.page.toast.createServerBeforeLiveActions'));
      return false;
    }
    return true;
  }, [isNewServer, t]);

  const handleRefreshRuntimeStatus = React.useCallback(async (silent = false) => {
    try {
      await refreshStatus({ directory: currentDirectory, silent });
    } catch (err) {
      if (!silent) {
        toast.error(err instanceof Error ? err.message : t('settings.mcp.page.toast.refreshStatusFailed'));
      }
    }
  }, [currentDirectory, refreshStatus, t]);

  React.useEffect(() => {
    void handleRefreshRuntimeStatus(true);
  }, [handleRefreshRuntimeStatus]);

  React.useEffect(() => {
    runtimeActionKeyRef.current = runtimeActionKey;
    setIsConnecting(false);
    setIsTestingConnection(false);
  }, [runtimeActionKey]);

  const handleTestConnection = React.useCallback(async () => {
    if (!selectedMcpName || !requireSavedConfig()) return;
    if (!enabled) {
      toast.error(t('settings.mcp.page.toast.enableServerBeforeTest'));
>>>>>>> bc50ba56a
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
<<<<<<< HEAD
      if (mounted.current) setDeleting(false);
=======
      setIsTestingConnection(false);
    }
  }, [currentDirectory, enabled, requireSavedConfig, selectedMcpName, t, testConnectionMcp]);

  // ── Browse ──
  if (!selectedMcpName) {
    return <McpGrid />;
  }

  const runtimeStatus = mcpStatus[selectedMcpName];
  const runtimeDiagnostic = selectedMcpName ? mcpDiagnostics[selectedMcpName] : undefined;
  // The runtime's own report wins; the store's diagnostic is the fallback for a
  // server OpenCode never reported on.
  // A server a policy blocks never reaches OpenCode's list, so any status it
  // had is stale; `blocked` is this page's own state for it.
  const blocked = selectedMcpName ? isBlocked(`mcp:${selectedMcpName}`) : false;
  const effectiveStatusName = blocked
    ? 'blocked'
    : runtimeStatus ? readMcpStatusName(runtimeStatus) : runtimeDiagnostic?.status;
  const effectiveStatusError = runtimeStatus ? readMcpStatusError(runtimeStatus) : runtimeDiagnostic?.error;
  const isConnected = readMcpStatusName(runtimeStatus) === 'connected';
  const offersSignInAgain = effectiveStatusName === 'failed' && oauthIntegration !== null;
  // An OAuth entry on a connected server still needs user authorization:
  // authorize it here instead of only on needs_auth or failed (#5934).
  const offersAuthorize = Boolean(oauthIntegration)
    && !offersSignInAgain
    && effectiveStatusName !== 'needs_auth'
    && effectiveStatusName !== 'blocked';
  const signInAgainRun = signInAgain?.server === selectedMcpName ? signInAgain.run : 0;

  const runtimeDescription = getStatusDescription(effectiveStatusName, tUnsafe, effectiveStatusError);
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'connected':
        return t('settings.mcp.page.status.label.connected');
      case 'failed':
        return t('settings.mcp.page.status.label.failed');
      case 'needs_auth':
        return t('settings.mcp.page.status.label.needsAuth');
      case 'blocked':
        return t('settings.mcp.grid.status.blockedByPolicy');
      default:
        return status;
>>>>>>> bc50ba56a
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
      if (!result.ok) throw new Error(result.error || t('settings.mcp.page.toast.saveFailed'));
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
        const credential = await canonicalClient.writeWorkspaceMcpCredential(workspace.workspaceId, draft.serverId, { persistedRevision, value: row.value });
        assertRuntime();
        persistedRevision = credential.persistedRevision;
        refs.set(key, credential.credentialRef);
      }
      let bearerReference: string | undefined;
      if (bearerDraft) {
        assertRuntime();
        const credential = await canonicalClient.writeWorkspaceMcpCredential(workspace.workspaceId, draft.serverId, { persistedRevision, value: bearerDraft });
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
      const updated = await useMcpConfigStore.getState().updateMcp(initial.serverId, { transport }, directory);
      assertRuntime();
      if (!updated.result) {
        throw new Error(!updated.ok ? updated.error : t('settings.mcp.page.toast.saveFailed'));
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
      setDraft({ ...imported, serverId: initial.serverId });
      setImportOpen(false);
      setSnippet('');
      setImportError(null);
      toast.success(t('settings.mcp.page.toast.configImported'));
    } catch (failure) {
      setImportError(failure instanceof Error ? failure.message : t('settings.mcp.page.toast.unexpectedError'));
    }
  };

  const handlePasteImportClipboard = async () => {
    try {
      const text = await readClipboardText();
      setSnippet(text);
      setImportError(null);
    } catch {
      setImportError(t('settings.mcp.page.toast.clipboardReadFailed'));
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
        titleAccessory={created ? <StatusBadge status={status} enabled={draft.enabled} /> : undefined}
        description={isNew ? t('settings.mcp.page.header.configureNewServer') : t('settings.mcp.page.header.transport', { type: transportLabel })}
        headerEnd={!isNew && initial.managed !== false ? (
          <div className="flex flex-wrap items-center gap-2">
<<<<<<< HEAD
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
=======
          {offersSignInAgain ? (
            <Button
              size="xs"
              className="!font-normal"
              onClick={() => setSignInAgain({ server: selectedMcpName, run: signInAgainRun + 1 })}
              disabled={!enabled}
            >
              {t('settings.mcp.page.actions.signInAgain')}
            </Button>
          ) : (
            <Button
              variant={isConnected ? 'outline' : 'default'}
              size="xs"
              className="!font-normal"
              onClick={handleToggleConnect}
              disabled={isConnecting || !enabled || blocked}
            >
              {isConnecting ? t('settings.mcp.page.actions.working') : isConnected ? t('settings.mcp.page.actions.disconnect') : t('settings.mcp.page.actions.connect')}
            </Button>
          )}
          {offersAuthorize && (
            <Button
              variant="outline"
              size="xs"
              className="!font-normal"
              onClick={() => setSignInAgain({ server: selectedMcpName, run: signInAgainRun + 1 })}
              disabled={!enabled}
            >
              {t('settings.mcp.page.actions.authorize')}
            </Button>
          )}
          {isConnected && (
>>>>>>> bc50ba56a
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

<<<<<<< HEAD
        {created && applyResult ? (
=======


        {!isNewServer && selectedServer && (
          <SettingsLegacyFormatNote legacy={selectedServer.legacy === true} path={selectedServer.path} />
        )}

        {/* Runtime Status - Simplified for connected, expanded for errors; a started authorize flow needs the card too */}
        {!isNewServer && (shouldShowFullStatusCard(effectiveStatusName) || signInAgainRun > 0 || oauthSignInActive) && (
>>>>>>> bc50ba56a
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
<<<<<<< HEAD
                    <StatusBadge status={status} enabled={draft.enabled} />
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
=======
                    <StatusBadge status={effectiveStatusName} enabled={enabled} getStatusLabel={getStatusLabel} />
                    {!isConnected && (
                      <Button
                        variant="outline"
                        size="xs"
                        className="!font-normal ms-auto"
                        onClick={() => void handleTestConnection()}
                        disabled={isTestingConnection || !enabled || blocked}
                      >
                        {isTestingConnection ? t('settings.mcp.page.actions.testing') : t('settings.mcp.page.actions.testConnection')}
                      </Button>
                    )}
                  </div>
                  <p className="typography-meta text-muted-foreground">{runtimeDescription}</p>
                  <p className="typography-micro text-muted-foreground">
                    {draftScope === 'project'
                      ? t('settings.mcp.page.status.projectScopedTo', { directory: currentDirectory ?? t('settings.mcp.page.status.activeProject') })
                      : t('settings.mcp.page.status.userScoped')}
                  </p>
                </div>

                {selectedMcpName && (effectiveStatusName === 'needs_auth' || signInAgainRun > 0 || oauthSignInActive) && (
                  <McpOAuthSignIn
                    key={signInAgainRun}
                    serverName={selectedMcpName}
                    directory={currentDirectory}
                    onConnected={handleOAuthConnected}
                    onActiveChange={setOAuthSignInActive}
                    autoStart={signInAgainRun > 0}
                    showStartButton={signInAgainRun === 0 || getMcpOAuthMethods(oauthIntegration ?? undefined).length > 1}
                  />
                )}

>>>>>>> bc50ba56a
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
          divider={false}
          settingsItem="mcp.server"
          contentClassName="space-y-0"
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
            controlClassName="flex-wrap @xl:w-auto @xl:flex-1"
          >
            {isNew ? (
              <>
                <span className="-mr-1 typography-ui-label text-muted-foreground">@</span>
                <Input
                  value={draft.serverId}
                  onChange={(event) => {
                    const serverId = event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
                    setDraft(value => ({ ...value, serverId, label: value.label === value.serverId ? serverId : value.label }));
                  }}
                  placeholder={t('settings.mcp.page.server.namePlaceholder')}
                  className="h-7 w-48 min-w-0 max-w-full shrink px-2 font-mono"
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
                  className="h-7 w-48 px-2"
                  aria-label={t('settings.mcp.page.server.name')}
                />
                <code className="typography-micro text-muted-foreground">{draft.serverId}</code>
              </>
            )}
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
          contentClassName="space-y-2"
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
                  <SelectTrigger className={SETTINGS_SELECT_ROW_TRIGGER_CLASS} disabled={busy || isReadOnly}>
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

<<<<<<< HEAD
        <div className="flex flex-wrap items-center gap-2 pb-8">
          {!created ? (
=======
                      <div className="flex flex-col gap-2 @xl:flex-row @xl:items-center @xl:gap-8">
                        <div className="flex min-w-0 flex-row items-center gap-1 @xl:w-56 shrink-0">
                          <span className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.mcp.page.advanced.timeoutCatalogMs')}</span>
                          <SettingsInfoHint>{t('settings.mcp.page.advanced.timeoutCatalogHint')}</SettingsInfoHint>
                        </div>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={timeoutCatalog}
                          onChange={(e) => setTimeoutCatalog(e.target.value)}
                          placeholder="30000"
                          className="h-7 w-32 font-mono px-2"
                          data-bwignore="true"
                          data-1p-ignore="true"
                        />
                      </div>

                      <div className="flex flex-col gap-2 @xl:flex-row @xl:items-center @xl:gap-8">
                        <div className="flex min-w-0 flex-row items-center gap-1 @xl:w-56 shrink-0">
                          <span className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.mcp.page.advanced.timeoutExecutionMs')}</span>
                          <SettingsInfoHint>{t('settings.mcp.page.advanced.timeoutExecutionHint')}</SettingsInfoHint>
                        </div>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={timeoutExecution}
                          onChange={(e) => setTimeoutExecution(e.target.value)}
                          placeholder="30000"
                          className="h-7 w-32 font-mono px-2"
                          data-bwignore="true"
                          data-1p-ignore="true"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 @xl:flex-row @xl:items-center @xl:gap-8">
                      <div className="flex min-w-0 flex-row items-center gap-1 @xl:w-56 shrink-0">
                        <span className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.mcp.page.advanced.codemode')}</span>
                        <SettingsInfoHint>
                          {t('settings.mcp.page.advanced.codemodeHint')}
                          {' '}
                          {t('settings.mcp.page.advanced.codemodeDefaultHint')}
                        </SettingsInfoHint>
                      </div>
                      <Select
                        value={codemode}
                        onValueChange={(value) => {
                          const next = MCP_CODEMODE_CHOICES.find((option) => option === value);
                          if (!next) return;
                          setCodemode(next);
                          requestSave();
                        }}
                      >
                        <SelectTrigger
                          className="!h-7 w-fit max-w-[16rem] px-2"
                          aria-label={t('settings.mcp.page.advanced.codemode')}
                        >
                          <span className="truncate">{t(MCP_CODEMODE_LABEL_KEYS[codemode])}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {MCP_CODEMODE_CHOICES.map((option) => (
                            <SelectItem key={option} value={option}>
                              {t(MCP_CODEMODE_LABEL_KEYS[option])}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {mcpType === 'remote' && (
                    <div>
                      <SettingsGroupTitle as="div" className="mb-2">
                        {t('settings.mcp.page.advanced.requestHeaders')}
                        {headerEntries.length > 0 && (
                          <span className="ms-1.5 typography-micro text-muted-foreground font-normal">({headerEntries.length})</span>
                        )}
                      </SettingsGroupTitle>
                      <EnvEditor
                        value={headerEntries}
                        onChange={setHeaderEntries}
                        onCommit={requestSave}
                        keyTransform={(value) => value.trimStart()}
                        keyPlaceholder={t('settings.mcp.page.advanced.headerNamePlaceholder')}
                        keyInputClassName="font-mono typography-meta"
                        pasteLabel={t('settings.mcp.page.advanced.pasteHeaders')}
                        pasteTitle={t('settings.mcp.page.advanced.pasteHeadersTitle')}
                        noPairsFoundError={t('settings.mcp.page.toast.noKeyValuePairsFound')}
                        importSuccess={(count) => t('settings.mcp.page.toast.importedVariablesCount', { count })}
                        clipboardReadFailed={t('settings.mcp.page.toast.clipboardReadFailed')}
                        keyLabel={t('settings.mcp.page.env.key')}
                        valueLabel={t('settings.mcp.page.env.value')}
                        valuePlaceholder={t('settings.mcp.page.env.valuePlaceholder')}
                        hideValueTitle={t('settings.mcp.page.env.hide')}
                        showValueTitle={t('settings.mcp.page.env.show')}
                        addVariable={t('settings.mcp.page.env.addVariable')}
                        plainTextWarning={t('settings.mcp.page.env.plainTextWarning')}
                        removeVariableAria={t('settings.mcp.page.env.removeVariableAria')}
                      />
                    </div>
                    )}

                    {mcpType === 'remote' && (
                    <div>
                      <SettingsGroupTitle as="div" className="mb-2">
                        {t('settings.mcp.page.advanced.oauth')}
                      </SettingsGroupTitle>
                      <div className="flex flex-col gap-2 @xl:flex-row @xl:items-center @xl:gap-8">
                        <div className="flex min-w-0 flex-row items-center gap-1 @xl:w-56 shrink-0">
                          <span className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.mcp.page.advanced.oauthMetadataUrl')}</span>
                          <SettingsInfoHint>{t('settings.mcp.page.advanced.oauthMetadataUrlHint')}</SettingsInfoHint>
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <Input
                            type="url"
                            value={oauthAuthServerMetadataUrl}
                            onChange={(e) => setOauthAuthServerMetadataUrl(e.target.value)}
                            placeholder={t('settings.mcp.page.advanced.oauthMetadataUrlPlaceholder')}
                            aria-label={t('settings.mcp.page.advanced.oauthMetadataUrl')}
                            aria-invalid={authServerMetadataUrlError ? true : undefined}
                            className="h-7 w-full max-w-[24rem] font-mono typography-meta px-2"
                            data-bwignore="true"
                            data-1p-ignore="true"
                          />
                          {/* A validation error has to stay readable while the
                              field is being corrected, so it is not behind the hint. */}
                          {authServerMetadataUrlError && (
                            <p className="typography-micro text-[var(--status-error)]">{authServerMetadataUrlError}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    )}

                  </div>
                </CollapsibleContent>
              </Collapsible>
        </SettingsSection>

        <SettingsSection
          title={t('settings.mcp.page.env.title')}
          description={t('settings.mcp.page.env.description')}
          titleAccessory={
            envEntries.length > 0 ? (
              <span className="typography-micro text-muted-foreground font-normal">
                ({envEntries.length})
              </span>
            ) : null
          }
          settingsItem="mcp.environment"
        >
            {envEntries.length === 0 ? (
              <Button
                variant="outline"
                size="xs"
                className="!font-normal gap-1.5"
                onClick={() => setEnvEntries([{ key: '', value: '' }])}
              >
                <Icon name="add" className="h-3.5 w-3.5" />
                {t('settings.mcp.page.env.addEnvironmentVariable')}
              </Button>
            ) : (
              <EnvEditor
                value={envEntries}
                onChange={setEnvEntries}
                onCommit={requestSave}
                keyPlaceholder={t('settings.mcp.page.env.keyPlaceholder')}
                pasteLabel={t('settings.mcp.page.env.pasteEnv')}
                pasteTitle={t('settings.mcp.page.env.pasteEnvTitle')}
                noPairsFoundError={t('settings.mcp.page.toast.noKeyValuePairsFound')}
                importSuccess={(count) => t('settings.mcp.page.toast.importedVariablesCount', { count })}
                clipboardReadFailed={t('settings.mcp.page.toast.clipboardReadFailed')}
                keyLabel={t('settings.mcp.page.env.key')}
                valueLabel={t('settings.mcp.page.env.value')}
                valuePlaceholder={t('settings.mcp.page.env.valuePlaceholder')}
                hideValueTitle={t('settings.mcp.page.env.hide')}
                showValueTitle={t('settings.mcp.page.env.show')}
                addVariable={t('settings.mcp.page.env.addVariable')}
                plainTextWarning={t('settings.mcp.page.env.plainTextWarning')}
                removeVariableAria={t('settings.mcp.page.env.removeVariableAria')}
              />
            )}
        </SettingsSection>

        <div className="flex items-center gap-2 pb-8">
          {isNewServer && (
>>>>>>> bc50ba56a
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
<<<<<<< HEAD
              value={snippet}
              onChange={(event) => { setSnippet(event.target.value); setImportError(null); }}
=======
              dir="ltr"
              value={importJsonText}
              onChange={(e) => {
                setImportJsonText(e.target.value);
                setImportError(null);
              }}
              placeholder={'{\n  "mcpServers": {\n    "postgres": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-postgres"]\n    }\n  }\n}'}
>>>>>>> bc50ba56a
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
