import React from 'react';
import type { ModelSelection } from '@openchamber/agent-contract';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { invalidateCommandsLoadCache, selectCommandsForDirectory, useCommandsStore, type CommandConfig, type CommandScope } from '@/stores/useCommandsStore';
import { ModelSelector } from '../agents/ModelSelector';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { OmpRowControl } from '@/components/sections/shared/OmpRowControl';
import { useOmpPageSettings } from '@/components/sections/shared/useOmpPageSettings';
import { useAutosave, AUTOSAVE_SAVED, AUTOSAVE_UNCHANGED, autosaveFailed, type AutosaveResult } from '@/components/sections/shared/SettingsAutosave';
import {
  SettingsSection,
  SettingsFieldRow,
  SettingsStackedField,
  SETTINGS_CUSTOM_TRIGGER_CLASS,
  SETTINGS_WIDTH_SELECT_CLASS,
  SETTINGS_WIDTH_SHORT_TEXT_CLASS,
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
  const { getSectionSettings, updateSettings, saving } = useOmpPageSettings('commands');
  const discoverySettings = getSectionSettings('catalog');
  const discoverySection = discoverySettings.length > 0 ? (
    <SettingsSection title={t('settings.omp.discovery.title')}>
      {discoverySettings.map(setting => (
        <OmpRowControl key={setting.id} setting={setting} value={setting.value} disabled={saving}
          onChange={async value => {
            if (!await updateSettings(() => [{ id: setting.id, value }])) {
              toast.error(t('settings.common.status.saveFailed'));
              return;
            }
            invalidateCommandsLoadCache(directory);
            await useCommandsStore.getState().loadCommands(directory);
          }} />
      ))}
    </SettingsSection>
  ) : null;
  const selectedId = useCommandsStore(state => state.selectedCommandId);
  const selectedName = useCommandsStore(state => state.selectedCommandName);
  const commands = useCommandsStore(state => selectCommandsForDirectory(state, directory));
  const draft = useCommandsStore(state => state.commandDraft);
  // The page owns prompt-template files only; built-in OMP commands live in
  // chat autocomplete and are not editable here.
  const templates = React.useMemo(() => commands.filter(command => command.editable), [commands]);
  const entity = (selectedId ? templates.find(command => command.commandId === selectedId) : null)
    ?? templates.find(command => command.name === selectedName);
  const isNew = Boolean(draft && draft.name === selectedName && !entity);
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
    const next: CommandForm = {
      name: source.name, scope: source.scope === 'workspace' ? 'workspace' : 'agent',
      description: source.description ?? '', content: source.content ?? '', argumentHint: source.argumentHint ?? '',
      modelSelection: source.modelSelection ?? null,
    };
    const sameIdentity = loadedIdentity.current === identity;
    loadedIdentity.current = identity;
    if (sameIdentity && [saved.current, echo.current?.identity === identity ? echo.current.form : null]
      .some(value => value && JSON.stringify(value) === JSON.stringify(next))) return;
    setForm(next);
    saved.current = next;
  }, [draft, entity, identity, isNew]);
  const config: CommandConfig = {
    name: form.name, scope: form.scope, description: form.description, content: form.content,
    argumentHint: form.argumentHint || undefined, modelSelection: form.modelSelection ?? undefined,
    group: isNew ? draft?.group : entity?.group,
  };
  const save = React.useCallback(async (): Promise<AutosaveResult> => {
    if (isNew || !entity || !saved.current || JSON.stringify(saved.current) === JSON.stringify(form)) return AUTOSAVE_UNCHANGED;
    if (!form.content.trim()) return autosaveFailed(t('settings.commands.page.toast.templateRequired'));
    const pending = { identity, form };
    echo.current = pending;
    try {
      const success = await useCommandsStore.getState().updateCommand(entity.name, {
        name: form.name, description: form.description, content: form.content, argumentHint: form.argumentHint,
        agentId: null, modelSelection: form.modelSelection ?? undefined,
      }, directory, entity.commandId);
      if (!success) return autosaveFailed(t('settings.commands.page.toast.updateFailed'));
      if (identityRef.current === identity) saved.current = form;
      return AUTOSAVE_SAVED;
    } finally { if (echo.current === pending) echo.current = null; }
  }, [directory, entity, form, identity, isNew, t]);
  const autosave = useAutosave(save);
  const { requestSave } = autosave;
  const create = async () => {
    const commandName = form.name.trim().replace(/\s+/g, '-');
    if (!commandName) { toast.error(t('settings.commands.sidebar.toast.commandNameRequired')); return; }
    if (!form.content.trim()) { toast.error(t('settings.commands.page.toast.templateRequired')); return; }
    if (templates.some(command => command.name === commandName)) {
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
  // A selection with no template file behind it (a built-in, or a row from a
  // catalog this directory no longer has) has nothing to edit.
  if (!selectedName || (!isNew && !entity)) {
    // Without a selection there is nothing to save, but the page still needs its
    // heading: SettingsView focuses `[data-settings-page-heading]` on navigation,
    // and a bare centred div left the pane with no title at all.
    return (
      <SettingsPageLayout title={t('settings.page.commands.title')} showSaveStatus={false}>
        {discoverySection}
        <div className="flex items-center justify-center py-16">
          <div className="max-w-sm text-center text-muted-foreground">
            <Icon name="terminal-box" className="mx-auto mb-3 size-12 opacity-50" />
            <p>{t('settings.commands.page.empty.title')}</p>
            <p className="typography-meta mt-1 opacity-75">{t('settings.commands.page.empty.description')}</p>
          </div>
        </div>
      </SettingsPageLayout>
    );
  }
  return <SettingsPageLayout title={isNew ? t('settings.commands.page.title.new') : `/${selectedName}`}
    description={isNew ? t('settings.commands.page.subtitle.new') : t('settings.commands.page.subtitle.edit')}
    onBlurCapture={autosave.onBlurCapture}>
    {discoverySection}
    <fieldset className="min-w-0">
      <SettingsSection title={t('settings.commands.page.section.identity')} divider={false}>
        {isNew && <SettingsFieldRow settingsItem="commands.name" label={t('settings.commands.page.field.commandName')}>
          <div className="flex items-center">
            <span className="typography-ui-label text-muted-foreground mr-1">/</span>
            <Input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}
              placeholder={t('settings.commands.page.field.commandNamePlaceholder')} inputSize="compact"
              className={SETTINGS_WIDTH_SHORT_TEXT_CLASS} />
          </div>
          <Select value={form.scope} onValueChange={scope => {
            if (scope === 'agent' || scope === 'workspace') setForm({ ...form, scope });
          }}>
            <SelectTrigger className={SETTINGS_WIDTH_SELECT_CLASS}>
              <SelectValue placeholder={t('settings.agents.page.field.scopePlaceholder')}>
                {form.scope === 'workspace' ? t('settings.common.scope.project') : t('settings.common.scope.global')}
              </SelectValue>
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
            className={SETTINGS_WIDTH_SHORT_TEXT_CLASS}
          />
        </SettingsFieldRow>
      </SettingsSection>
      <SettingsSection title={t('settings.commands.page.section.executionContext')}>
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
    </fieldset>
  </SettingsPageLayout>;
};
