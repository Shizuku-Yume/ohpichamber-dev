import React from 'react';
import { defaultThinkingLevelFromState, modelRoleChange, parseRolesRecord, roleSelector } from '@/components/sections/shared/modelRoleSelectors';
import { useOmpPageSettings } from '@/components/sections/shared/useOmpPageSettings';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useSettingsModels } from '@/hooks/useSettingsModels';
import { toast } from '@/components/ui';
import { loadDesktopSettings, updateDesktopSettings } from '@/lib/persistence';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import { setFilesViewShowGitignored, useFilesViewShowGitignored } from '@/lib/filesViewShowGitignored';
import { useCommitSettings } from '@/lib/gitCommitSettings';
import { useI18n } from '@/lib/i18n';
import {
 SettingsSection,
 SettingsControlGroup,
 SettingsRadioGroup,
 SettingsRadioOption,
 SettingsCheckboxRow,
 SETTINGS_SPACE_ROW_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { ModelRoleEditor } from '@/components/sections/shared/ModelRoleEditor';

/** The OMP model role commit messages and PR descriptions are generated with. */
const COMMIT_ROLE = 'commit';
export const GitSettings: React.FC = () => {
 const { t } = useI18n();
 const settingsGitmojiEnabled = useConfigStore((state) => state.settingsGitmojiEnabled);
 const setSettingsGitmojiEnabled = useConfigStore((state) => state.setSettingsGitmojiEnabled);
 const showGitignored = useFilesViewShowGitignored();
 const { settings: commitSettings, setSetting: setCommitSetting } = useCommitSettings();
 const gitChangesViewMode = useUIStore((state) => state.gitChangesViewMode);
 const setGitChangesViewMode = useUIStore((state) => state.setGitChangesViewMode);

 const directory = useSettingsDirectory();
 const models = useSettingsModels(directory);
 const { state: ompState, loading: ompLoading, saving: ompSaving, updateSettings } = useOmpPageSettings('git');

 const viewOptions = React.useMemo(
  () => [
   { id: 'flat' as const, label: t('settings.openchamber.git.option.flatList') },
   { id: 'tree' as const, label: t('settings.openchamber.git.option.treeView') },
  ],
  [t]
 );

 // Load current settings
 React.useEffect(() => {
  const loadSettings = async () => {
   try {
    const data = await loadDesktopSettings();
    if (data) {
     if (data.gitmojiEnabled !== undefined) {
      setSettingsGitmojiEnabled(data.gitmojiEnabled);
     }
     if (data.gitChangesViewMode !== undefined) {
      setGitChangesViewMode(data.gitChangesViewMode);
     }
    }

   } catch (error) {
    console.warn('Failed to load git settings:', error);
   }
  };
  loadSettings();
 }, [setGitChangesViewMode, setSettingsGitmojiEnabled]);

 const rolesMap = React.useMemo(
  () => parseRolesRecord(ompState?.settings.find((setting) => setting.id === 'modelRoles')?.value),
  [ompState],
 );
 const roleSelectors = React.useMemo(
  () => Object.fromEntries(Object.entries(rolesMap).map(([role, value]) => [role, roleSelector(value)])),
  [rolesMap],
 );
 const globalLevel = React.useMemo(() => defaultThinkingLevelFromState(ompState), [ompState]);
 const setRole = React.useCallback(async (role: string, selector: string) => {
  const saved = await updateSettings((state) => [modelRoleChange(state, role, selector)]);
  if (!saved) toast.error(t('settings.omp.modelRoles.saveFailed'));
 }, [t, updateSettings]);

 const handleGitmojiChange = React.useCallback(async (enabled: boolean) => {
  setSettingsGitmojiEnabled(enabled);
  try {
   await updateDesktopSettings({
    gitmojiEnabled: enabled,
   });
  } catch (error) {
   console.warn('Failed to save gitmoji setting:', error);
  }
 }, [setSettingsGitmojiEnabled]);

 const handleGitChangesViewModeChange = React.useCallback((mode: 'flat' | 'tree') => {
  if (mode === gitChangesViewMode) {
   return;
  }

  setGitChangesViewMode(mode);
  void updateDesktopSettings({ gitChangesViewMode: mode });
 }, [gitChangesViewMode, setGitChangesViewMode]);


 return (
  <SettingsSection title={t('settings.openchamber.git.title')}>
   <div className={SETTINGS_SPACE_ROW_CLASS}>
   <ModelRoleEditor
    role={COMMIT_ROLE}
    roles={roleSelectors}
    models={models}
    directory={directory ?? undefined}
    globalLevel={globalLevel}
    disabled={ompLoading || ompSaving || !ompState}
    loading={ompLoading && !ompState}
    label={t('settings.omp.modelRoles.role.commit.label')}
    info={t('settings.omp.modelRoles.role.commit.desc')}
    onChange={(selector) => void setRole(COMMIT_ROLE, selector)}
   />

    <SettingsControlGroup
     settingsItem="git.changes-view"
     title={t('settings.openchamber.git.changesViewTitle')}
    >
     <SettingsRadioGroup aria-label={t('settings.openchamber.git.changesViewAria')}>
      {viewOptions.map((option) => (
       <SettingsRadioOption
        key={option.id}
        selected={gitChangesViewMode === option.id}
        onSelect={() => {
         handleGitChangesViewModeChange(option.id);
        }}
        label={option.label}
        ariaLabel={t('settings.openchamber.git.optionAria', { option: option.label })}
       />
      ))}
     </SettingsRadioGroup>
    </SettingsControlGroup>

    <SettingsCheckboxRow
     settingsItem="git.gitmoji"
     checked={settingsGitmojiEnabled}
     onChange={(checked) => {
      void handleGitmojiChange(checked);
     }}
     label={t('settings.openchamber.git.enableGitmoji')}
     ariaLabel={t('settings.openchamber.git.enableGitmojiAria')}
    />

    <SettingsControlGroup
     settingsItem="git.commit-generation"
     title={t('settings.openchamber.git.commitGeneration.title')}
    >
     <SettingsCheckboxRow
      settingsItem="git.commit-generation.generate"
      checked={commitSettings.generateCommitMessages}
      onChange={(checked) => setCommitSetting('generateCommitMessages', checked)}
      label={t('settings.openchamber.git.commitGeneration.generateMessages.label')}
      info={t('settings.openchamber.git.commitGeneration.generateMessages.desc')}
      ariaLabel={t('settings.openchamber.git.commitGeneration.generateMessages.label')}
     />
     <SettingsCheckboxRow
      settingsItem="git.commit-generation.reasoning"
      checked={commitSettings.commitMessageReasoning}
      onChange={(checked) => setCommitSetting('commitMessageReasoning', checked)}
      label={t('settings.openchamber.git.commitGeneration.reasoning.label')}
      info={t('settings.openchamber.git.commitGeneration.reasoning.desc')}
      ariaLabel={t('settings.openchamber.git.commitGeneration.reasoning.label')}
     />
     <SettingsCheckboxRow
      settingsItem="git.commit-generation.notes"
      checked={commitSettings.commitMessageNotes}
      onChange={(checked) => setCommitSetting('commitMessageNotes', checked)}
      label={t('settings.openchamber.git.commitGeneration.notes.label')}
      info={t('settings.openchamber.git.commitGeneration.notes.desc')}
      ariaLabel={t('settings.openchamber.git.commitGeneration.notes.label')}
     />
     <SettingsCheckboxRow
      settingsItem="git.commit-generation.change-id"
      checked={commitSettings.commitMessageChangeId}
      onChange={(checked) => setCommitSetting('commitMessageChangeId', checked)}
      label={t('settings.openchamber.git.commitGeneration.changeId.label')}
      info={t('settings.openchamber.git.commitGeneration.changeId.desc')}
      ariaLabel={t('settings.openchamber.git.commitGeneration.changeId.label')}
     />
    </SettingsControlGroup>

    <SettingsCheckboxRow
     settingsItem="git.gitignored-files"
     checked={showGitignored}
     onChange={setFilesViewShowGitignored}
     label={t('settings.openchamber.git.showGitignored')}
     ariaLabel={t('settings.openchamber.git.showGitignoredAria')}
    />
   </div>
  </SettingsSection>
 );
};
