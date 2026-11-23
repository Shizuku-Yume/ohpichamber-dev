import React from 'react';
import {
  BehaviorFileFieldsSchema, BehaviorRuleFieldsSchema,
  type BehaviorFileCatalog, type BehaviorFileEntry, type BehaviorFileFields, type FileResourceScope,
} from '@openchamber/agent-contract';
import { canonicalClient, CanonicalApiError } from '@/api/canonicalClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  SettingsChipGroup, SettingsFieldRow, SettingsSection, SettingsStackedField,
  SETTINGS_SPACE_ROW_CLASS, SETTINGS_WIDTH_SELECT_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { useI18n } from '@/lib/i18n';

type Field = keyof BehaviorFileFields;
const listFields = new Set<Field>(['globs', 'condition', 'astCondition', 'scope', 'agents']);
const enumFields: Partial<Record<Field, readonly string[]>> = {
  enabled: ['true', 'false'],
  alwaysApply: ['true', 'false'],
  interruptMode: ['never', 'prose-only', 'tool-only', 'always'],
  repeatMode: ['once', 'after-gap', 'always'],
};
const fixedFiles = [{ kind: 'sticky-rules', name: 'RULES.md' }, { kind: 'system', name: 'SYSTEM.md' }] as const;
type Draft = Pick<BehaviorFileEntry, 'kind' | 'name' | 'content'> & { original?: BehaviorFileEntry; fields: Partial<Record<Field, string>> };

function fieldValue(field: Field, value: BehaviorFileFields[Field]): string {
  return value == null ? '' : listFields.has(field) ? JSON.stringify(value) : String(value);
}

function draftFor(reference: Pick<Draft, 'kind' | 'name'>, original?: BehaviorFileEntry): Draft {
  return { kind: reference.kind, name: reference.name, original, content: original?.content ?? '', fields: {} };
}
const resourceKey = (file: Pick<Draft, 'kind' | 'name'>) => `${file.kind}:${file.name}`;

export function NativeBehaviorFiles({ directory }: { directory: string }) {
  const { t } = useI18n();
  const [catalog, setCatalog] = React.useState<BehaviorFileCatalog>();
  const [scope, setScope] = React.useState<FileResourceScope>('agent');
  const [selection, setSelection] = React.useState('');
  const [draft, setDraft] = React.useState<Draft>();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [unavailable, setUnavailable] = React.useState(false);

  const reload = React.useCallback(async () => {
    const workspace = await canonicalClient.resolveWorkspace(directory);
    return canonicalClient.fileResources.getBehaviorFiles(workspace.workspaceId);
  }, [directory]);

  React.useEffect(() => {
    let active = true;
    reload().then(result => { if (active) setCatalog(result); }, (failure: unknown) => {
      if (!active) return;
      if (failure instanceof CanonicalApiError && failure.problem.status === 404) setUnavailable(true);
      else setError('load');
    });
    return () => { active = false; };
  }, [reload]);

  if (unavailable || (!catalog && !error)) return null;
  const markdownFiles = catalog?.files.filter(file => file.scope === scope && (file.kind === 'rule' || file.kind === 'instruction')) ?? [];
  const choose = (key: string) => {
    setSelection(key);
    setError('');
    setConfirmDelete(false);
    const file = fixedFiles.find(entry => entry.name === key);
    if (file) setDraft(draftFor(file, catalog?.files.find(entry => entry.scope === scope && entry.kind === file.kind)));
    else {
      const existing = markdownFiles.find(entry => resourceKey(entry) === key);
      setDraft(draftFor(existing ?? { kind: key === 'new-instruction' ? 'instruction' : 'rule', name: '' }, existing));
    }
  };

  const commit = async (remove: boolean) => {
    if (!catalog || !draft || busy) return;
    let fields: BehaviorFileFields | undefined;
    if (!remove && Object.keys(draft.fields).length) {
      try {
        const changes: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(draft.fields) as [Field, string][]) {
          if (value === fieldValue(key, draft.original?.fields[key])) continue;
          changes[key] = value === '' ? null : listFields.has(key) || key === 'enabled' || key === 'alwaysApply' ? JSON.parse(value) as unknown : value;
        }
        if (Object.keys(changes).length) fields = BehaviorFileFieldsSchema.parse(changes);
      } catch { setError('fields'); return; }
    }
    const mutate = (expectedRevision: string) => {
      const target = { kind: draft.kind, name: draft.name, scope, expectedRevision };
      return remove && draft.original
        ? canonicalClient.fileResources.deleteBehaviorFile(catalog.workspaceId, { ...target, expectedVersion: draft.original.version })
        : canonicalClient.fileResources.writeBehaviorFile(catalog.workspaceId, {
          ...target, expectedVersion: draft.original?.version ?? null, content: draft.content, fields,
        });
    };
    setBusy(true);
    setError('');
    try {
      let result: BehaviorFileCatalog;
      try {
        result = await mutate(catalog.revision);
      } catch (failure) {
        if (!(failure instanceof CanonicalApiError) || failure.problem.code !== 'CATALOG_CONFLICT') throw failure;
        const latest = await canonicalClient.fileResources.getBehaviorFiles(catalog.workspaceId);
        if (latest.revision === catalog.revision) throw failure;
        setCatalog(latest);
        result = await mutate(latest.revision);
      }
      setCatalog(result);
      if (remove) {
        setSelection('');
        setDraft(undefined);
      } else {
        setSelection(draft.kind === 'rule' || draft.kind === 'instruction' ? resourceKey(draft) : draft.name);
        setDraft(draftFor(draft, result.files.find(entry => entry.scope === scope && entry.name === draft.name && entry.kind === draft.kind)));
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'save');
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const chooseLabel = t('settings.behavior.files.choose');
  const contentLabel = t('settings.snippets.page.field.content');
  const nameLabel = t('settings.plugins.page.field.fileName');
  return (
    <SettingsSection title={t('settings.behavior.files.title')} contentClassName={SETTINGS_SPACE_ROW_CLASS}>
      {catalog && <>
        <SettingsChipGroup
          value={scope}
          onChange={(next: FileResourceScope) => { setScope(next); setSelection(''); setDraft(undefined); setError(''); setConfirmDelete(false); }}
          options={catalog.scopes.map(value => ({ value, label: t(value === 'agent' ? 'settings.common.scope.global' : 'settings.common.scope.project'), disabled: busy }))}
        />
        <SettingsFieldRow label={chooseLabel}>
          <Select value={selection} onValueChange={choose} disabled={busy}>
            <SelectTrigger aria-label={chooseLabel} className={SETTINGS_WIDTH_SELECT_CLASS}><SelectValue placeholder={chooseLabel} /></SelectTrigger>
            <SelectContent>
              {fixedFiles.map(file => <SelectItem key={file.name} value={file.name}>{file.name}</SelectItem>)}
              <SelectItem value="new-rule">{t('settings.behavior.files.rules')} · {t('settings.common.actions.create')}</SelectItem>
              <SelectItem value="new-instruction">{t('settings.behavior.files.instructions')} · {t('settings.common.actions.create')}</SelectItem>
              {markdownFiles.map(file => <SelectItem key={resourceKey(file)} value={resourceKey(file)}>
                {t(file.kind === 'rule' ? 'settings.behavior.files.rules' : 'settings.behavior.files.instructions')} · {file.name}
              </SelectItem>)}
            </SelectContent>
          </Select>
        </SettingsFieldRow>
      </>}
      {draft && <>
        {(draft.kind === 'rule' || draft.kind === 'instruction') && !draft.original && <SettingsFieldRow label={nameLabel}>
          <Input aria-label={nameLabel} placeholder={draft.kind === 'rule' ? 'example.mdc' : 'example.md'} value={draft.name} disabled={busy} onChange={event => setDraft({ ...draft, name: event.target.value })} />
        </SettingsFieldRow>}
        {(draft.kind === 'rule' ? Object.keys(BehaviorRuleFieldsSchema.shape) as Field[] : draft.kind === 'instruction' ? ['applyTo'] as const : []).map(field => {
          const value = draft.fields[field] ?? fieldValue(field, draft.original?.fields[field]);
          const change = (next: string) => setDraft({ ...draft, fields: { ...draft.fields, [field]: next } });
          const options = enumFields[field];
          return <SettingsFieldRow key={field} label={field} info={listFields.has(field) ? t('settings.behavior.files.listHint') : undefined}>
            {options ? <Select value={value || 'default'} onValueChange={next => change(next === 'default' ? '' : next)} disabled={busy}>
              <SelectTrigger aria-label={field} className={SETTINGS_WIDTH_SELECT_CLASS}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">{t('settings.openchamber.defaults.option.default')}</SelectItem>
                {options.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}
              </SelectContent>
            </Select> : <Input aria-label={field} value={value} disabled={busy} onChange={event => change(event.target.value)} />}
          </SettingsFieldRow>;
        })}
        <SettingsStackedField label={contentLabel}>
          <Textarea aria-label={contentLabel} rows={8} value={draft.content} disabled={busy} onChange={event => setDraft({ ...draft, content: event.target.value })} />
        </SettingsStackedField>
        <div className="flex flex-wrap items-center gap-2">
          {confirmDelete ? <>
            <span>{t('settings.behavior.files.delete')}</span>
            <Button variant="destructive" size="sm" disabled={busy} onClick={() => void commit(true)}>{t('settings.common.actions.delete')}</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmDelete(false)}>{t('settings.common.actions.cancel')}</Button>
          </> : <>
            <Button size="sm" disabled={busy || !draft.name} onClick={() => void commit(false)}>{t('settings.common.actions.saveChanges')}</Button>
            {draft.original && <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmDelete(true)}>{t('settings.common.actions.delete')}</Button>}
          </>}
        </div>
      </>}
      {error && <p role="alert">{error === 'load' ? t('settings.behavior.files.loadFailed') : error === 'fields' ? t('settings.behavior.files.listHint') : error === 'save' ? t('settings.common.status.saveFailed') : t('settings.common.status.saveFailedReason', { reason: error })}</p>}
    </SettingsSection>
  );
}
