import React from 'react';
import type { ModelSelection } from '@openchamber/agent-contract';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { selectCommandsForDirectory, useCommandsStore, type CommandConfig, type CommandScope } from '@/stores/useCommandsStore';
import { getLocalizedCommandDescription } from './commandDescriptions';
import { ModelSelector } from '../agents/ModelSelector';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { useAutosave, AUTOSAVE_SAVED, AUTOSAVE_UNCHANGED, autosaveFailed, type AutosaveResult } from '@/components/sections/shared/SettingsAutosave';
import {
  SettingsSection,
  SettingsFieldRow,
  SettingsStackedField,
  SETTINGS_CUSTOM_TRIGGER_CLASS,
  SETTINGS_SELECT_ROW_TRIGGER_CLASS,
} from '@/components/sections/shared/SettingsSection';

interface CommandForm {
  name: string;
  scope: CommandScope;
  description: string;
  content: string;
  argumentHint: string;
  modelSelection: ModelSelection | null;
}

export const CommandsPage: React.FC = () => {
  const { t } = useI18n();
  const directory = useSettingsDirectory();
  const selectedId = useCommandsStore(state => state.selectedCommandId);
  const selectedName = useCommandsStore(state => state.selectedCommandName);
  const commands = useCommandsStore(state => selectCommandsForDirectory(state, directory));
  const draft = useCommandsStore(state => state.commandDraft);
  const entity = (selectedId ? commands.find(command => command.commandId === selectedId) : null)
    ?? commands.find(command => command.name === selectedName);
  const isNew = Boolean(draft && draft.name === selectedName && !entity);
  const readOnly = Boolean(entity && !entity.editable);
  const group = isNew ? draft?.group : entity?.group;
  const [form, setForm] = React.useState<CommandForm>({ name: '', scope: 'agent', description: '', content: '', argumentHint: '', modelSelection: null });
  const [creating, setCreating] = React.useState(false);
  const identity = JSON.stringify([directory, selectedId ?? selectedName]);
  const identityRef = React.useRef(identity);
  identityRef.current = identity;
  const saved = React.useRef<CommandForm | null>(null);
  const loadedIdentity = React.useRef<string | null>(null);
  const echo = React.useRef<{ identity: string; form: CommandForm } | null>(null);
  React.useEffect(() => {
    const source = isNew ? draft : entity;
    if (!source) return;
    const localizedDesc = entity ? getLocalizedCommandDescription(entity, t) : source.description;
    const next: CommandForm = {
      name: source.name, scope: source.scope === 'workspace' ? 'workspace' : 'agent',
      description: localizedDesc ?? '', content: source.content ?? '', argumentHint: source.argumentHint ?? '',
      modelSelection: source.modelSelection ?? null,
    };
    const sameIdentity = loadedIdentity.current === identity;
    loadedIdentity.current = identity;
    if (sameIdentity && [saved.current, echo.current?.identity === identity ? echo.current.form : null]
      .some(value => value && JSON.stringify(value) === JSON.stringify(next))) return;
    setForm(next);
    saved.current = next;
  }, [draft, entity, identity, isNew, t]);
  const config: CommandConfig = {
    name: form.name, scope: form.scope, description: form.description, content: form.content,
    argumentHint: form.argumentHint || undefined, modelSelection: form.modelSelection ?? undefined,
    group: isNew ? draft?.group : entity?.group,
  };
  const save = React.useCallback(async (): Promise<AutosaveResult> => {
    if (isNew || readOnly || !entity || !saved.current || JSON.stringify(saved.current) === JSON.stringify(form)) return AUTOSAVE_UNCHANGED;
    if (!form.content.trim()) return autosaveFailed(t('settings.commands.page.toast.templateRequired'));
    const pending = { identity, form };
    echo.current = pending;
    try {
      const success = await useCommandsStore.getState().updateCommand(entity.name, {
        name: form.name, description: form.description, content: form.content, argumentHint: form.argumentHint,
        agentId: null, modelSelection: form.modelSelection ?? undefined,
      }, directory);
      if (!success) return autosaveFailed(t('settings.commands.page.toast.updateFailed'));
      if (identityRef.current === identity) saved.current = form;
      return AUTOSAVE_SAVED;
    } finally { if (echo.current === pending) echo.current = null; }
  }, [directory, entity, form, identity, isNew, readOnly, t]);
  const autosave = useAutosave(save);
  const { requestSave } = autosave;
  const create = async () => {
    const commandName = form.name.trim().replace(/\s+/g, '-');
    if (!commandName) { toast.error(t('settings.commands.sidebar.toast.commandNameRequired')); return; }
    if (!form.content.trim()) { toast.error(t('settings.commands.page.toast.templateRequired')); return; }
    if (commands.some(command => command.name === commandName)) {
      toast.error(t('settings.commands.sidebar.toast.commandExists'));
      return;
    }
    setCreating(true);
    try {
      const success = await useCommandsStore.getState().createCommand({ ...config, name: commandName }, directory);
      if (!success) { toast.error(t('settings.commands.page.toast.createFailed')); return; }
      useCommandsStore.getState().setCommandDraft(null);
      useCommandsStore.getState().setSelectedCommand(commandName);
      toast.success(t('settings.commands.page.toast.created'));
    } finally { setCreating(false); }
  };
  const cancelCreate = () => {
    useCommandsStore.getState().setCommandDraft(null);
    useCommandsStore.getState().setSelectedCommand(null);
  };
  if (!selectedName) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Icon name="terminal-box" className="mx-auto mb-3 size-12 opacity-50" />
          <p className="typography-body">{t('settings.commands.page.empty.title')}</p>
          <p className="typography-meta mt-1 opacity-75">{t('settings.commands.page.empty.description')}</p>
        </div>
      </div>
    );
  }
  return <SettingsPageLayout title={isNew ? t('settings.commands.page.title.new') : `/${selectedName}`}
    description={isNew ? t('settings.commands.page.subtitle.new') : readOnly ? t('settings.commands.sidebar.section.builtIn') : t('settings.commands.page.subtitle.edit')}
    onBlurCapture={autosave.onBlurCapture}>
    <fieldset disabled={readOnly} className="min-w-0">
      <SettingsSection title={t('settings.commands.page.section.identity')} divider={false} contentClassName="space-y-0">
        {isNew && <SettingsFieldRow settingsItem="commands.name" label={t('settings.commands.page.field.commandName')}>
          <div className="flex items-center">
            <span className="typography-ui-label text-muted-foreground mr-1">/</span>
            <Input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}
              placeholder={t('settings.commands.page.field.commandNamePlaceholder')} className="h-7 w-40 px-2" />
          </div>
          <Select value={form.scope} onValueChange={scope => {
            if (scope === 'agent' || scope === 'workspace') setForm({ ...form, scope });
          }}>
            <SelectTrigger className={SETTINGS_SELECT_ROW_TRIGGER_CLASS}>
              <SelectValue placeholder={t('settings.agents.page.field.scopePlaceholder')} />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="agent">
                <div className="flex items-center gap-2">
                  <Icon name="user-3" className="size-3.5" />
                  <span>{t('settings.common.scope.global')}</span>
                </div>
              </SelectItem>
              <SelectItem value="workspace">
                <div className="flex items-center gap-2">
                  <Icon name="folder" className="size-3.5" />
                  <span>{t('settings.common.scope.project')}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingsFieldRow>}
        <SettingsStackedField className="py-1.5" label={t('settings.common.field.description')} controlClassName="w-full max-w-none">
          <Textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })}
            placeholder={t('settings.commands.page.field.descriptionPlaceholder')} rows={2}
            className="w-full resize-none min-h-[60px] bg-transparent" />
        </SettingsStackedField>
        <SettingsFieldRow settingsItem="commands.argument-hint" label={t('settings.commands.page.field.argumentHint')}
          info={t('settings.commands.page.templateHint.userInput')}>
          <Input value={form.argumentHint} onChange={event => setForm({ ...form, argumentHint: event.target.value })}
            aria-label="$ARGUMENTS"
            inputSize="compact"
            className="w-64 px-2"
          />
        </SettingsFieldRow>
      </SettingsSection>
      {(!readOnly || form.modelSelection || group) && (
        <SettingsSection title={t('settings.commands.page.section.executionContext')} contentClassName="space-y-0">
          <SettingsFieldRow settingsItem="commands.model" label={t('settings.agents.page.field.overrideModel')}>
            <ModelSelector providerId={form.modelSelection?.providerId ?? ''} modelId={form.modelSelection?.modelId ?? ''}
              directory={directory ?? undefined} onChange={(providerId, modelId) => {
                setForm({ ...form, modelSelection: providerId && modelId ? { providerId, modelId } : null });
                requestSave();
              }} className={SETTINGS_CUSTOM_TRIGGER_CLASS} />
          </SettingsFieldRow>
          {group ? <SettingsFieldRow settingsItem="commands.group" label={t('settings.commands.page.field.group')}>
            <span className="typography-meta text-muted-foreground truncate">{group}</span>
          </SettingsFieldRow> : null}
        </SettingsSection>
      )}
      {(!readOnly || form.content) && (
        <SettingsSection title={t('settings.commands.page.section.template')} settingsItem="commands.template">
          <Textarea value={form.content} onChange={event => setForm({ ...form, content: event.target.value })}
            placeholder={t('settings.commands.page.field.templatePlaceholder')} rows={12}
            className="w-full font-mono typography-meta min-h-[160px] max-h-[60vh] bg-transparent" />
          <p className="mt-2 typography-meta text-muted-foreground">
            <code className="text-foreground">$ARGUMENTS</code> {t('settings.commands.page.templateHint.userInput')} &middot;{' '}
            <code className="text-foreground">!`cmd`</code> {t('settings.commands.page.templateHint.shellOutput')} &middot;{' '}
            <code className="text-foreground">@file</code> {t('settings.commands.page.templateHint.fileContents')}
          </p>
          {isNew && <div className="flex items-center gap-2 pt-3">
            <Button onClick={() => void create()} disabled={creating || !form.name.trim() || !form.content.trim()}
              size="xs" >
              {creating ? t('settings.common.actions.saving') : t('settings.common.actions.create')}
            </Button>
            <Button variant="ghost" onClick={cancelCreate} disabled={creating} size="xs" >
              {t('settings.common.actions.cancel')}
            </Button>
          </div>}
        </SettingsSection>
      )}
    </fieldset>
  </SettingsPageLayout>;
};
