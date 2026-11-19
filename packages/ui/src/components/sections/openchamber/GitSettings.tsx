import React from 'react';
import type { OmpSettingsState } from '@openchamber/agent-contract';
import { CanonicalApiError, canonicalClient } from '@/api/canonicalClient';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { loadDesktopSettings, reportSettingsSaveState, updateDesktopSettings } from '@/lib/persistence';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSettingsModels } from '@/hooks/useSettingsModels';
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
/** Only string roles survive; a malformed record must not erase the others. */
const readRoleRecord = (value: unknown): Record<string, string> => {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
 return Object.fromEntries(
  Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
 );
};

export const GitSettings: React.FC = () => {
 const { t } = useI18n();
 const settingsDirectory = useSettingsDirectory();
 const settingsGitmojiEnabled = useConfigStore((state) => state.settingsGitmojiEnabled);
 const setSettingsGitmojiEnabled = useConfigStore((state) => state.setSettingsGitmojiEnabled);
 const showGitignored = useFilesViewShowGitignored();
 const { settings: commitSettings, setSetting: setCommitSetting } = useCommitSettings();
 const gitChangesViewMode = useUIStore((state) => state.gitChangesViewMode);
 const setGitChangesViewMode = useUIStore((state) => state.setGitChangesViewMode);

 const [isLoading, setIsLoading] = React.useState(true);
 const [ompState, setOmpState] = React.useState<OmpSettingsState | null>(null);
 // The catalog loader already read this directory's models; a second fetch
 // here duplicated the slowest request the page made.
 const models = useSettingsModels(settingsDirectory);
 const [isSavingCommitModel, setIsSavingCommitModel] = React.useState(false);
 const [commitModelError, setCommitModelError] = React.useState<string | null>(null);
 const ompStateRef = React.useRef<OmpSettingsState | null>(null);
 ompStateRef.current = ompState;

<<<<<<< HEAD
 const viewOptions = React.useMemo(
  () => [
   { id: 'flat' as const, label: t('settings.openchamber.git.option.flatList') },
   { id: 'tree' as const, label: t('settings.openchamber.git.option.treeView') },
  ],
  [t]
 );
||||||| bc50ba56aa
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
=======
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
>>>>>>> upstream/main

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
   } finally {
    setIsLoading(false);
   }
  };
  loadSettings();
 }, [setGitChangesViewMode, setSettingsGitmojiEnabled]);

 // The commit role lives in OMP's `modelRoles`, so it is read for the
 // directory Settings describes — not whichever chat happens to be open.
 React.useEffect(() => {
  if (!settingsDirectory) {
   setOmpState(null);
   return;
  }
  const abort = new AbortController();
  let active = true;
  void (async () => {
   try {
    const workspace = await canonicalClient.resolveWorkspace(settingsDirectory, { signal: abort.signal });
    const snapshot = await canonicalClient.getOmpSettings(workspace.workspaceId, abort.signal);
    if (!active || abort.signal.aborted) return;
    setOmpState(snapshot);
    setCommitModelError(null);
   } catch (error) {
    if (!active || abort.signal.aborted) return;
    console.warn('Failed to load the commit message model:', error);
    setOmpState(null);
   }
  })();
  return () => {
   active = false;
   abort.abort();
  };
 }, [settingsDirectory]);

 const roleRecord = React.useMemo(
  () => readRoleRecord(ompState?.settings.find((setting) => setting.id === 'modelRoles')?.value),
  [ompState],
 );
 // The role record keeps its string selectors, so the shared editor can read
 // one role out of the same shape Defaults and the OMP page use.
 const roleSelectors = React.useMemo(
  () => Object.fromEntries(Object.entries(roleRecord).filter(([, selector]) => selector.length > 0)),
  [roleRecord],
 );
 /** What the commit role runs at when its selector names no level of its own. */
 const globalThinkingLevel = React.useMemo(() => {
  const value = ompState?.settings.find((setting) => setting.id === 'defaultThinkingLevel')?.value;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
 }, [ompState]);

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

 // Saving one role writes the whole record, so every other role is carried
 // over untouched. A concurrent config write is re-read and merged rather
 // than overwritten, and the outcome reports through the shared save
 // indicator so a refused write is never silent.
 const writeCommitRole = React.useCallback(async (selector: string) => {
  const current = ompStateRef.current;
  if (!current) return;
  setIsSavingCommitModel(true);
  setCommitModelError(null);
  reportSettingsSaveState('saving');
  const currentRoles = readRoleRecord(current.settings.find((setting) => setting.id === 'modelRoles')?.value);
  const nextRoles = { ...currentRoles };
  if (selector) nextRoles[COMMIT_ROLE] = selector;
  else delete nextRoles[COMMIT_ROLE];
  try {
   let next: OmpSettingsState;
   try {
    next = await canonicalClient.updateOmpSettings(current.workspaceId, {
     expectedRevision: current.revision,
     changes: [{ id: 'modelRoles', value: nextRoles }],
    });
   } catch (error) {
    if (!(error instanceof CanonicalApiError) || error.problem.status !== 409) throw error;
    const latest = await canonicalClient.getOmpSettings(current.workspaceId);
    const merged = readRoleRecord(latest.settings.find((setting) => setting.id === 'modelRoles')?.value);
    if (selector) merged[COMMIT_ROLE] = selector;
    else delete merged[COMMIT_ROLE];
    next = await canonicalClient.updateOmpSettings(latest.workspaceId, {
     expectedRevision: latest.revision,
     changes: [{ id: 'modelRoles', value: merged }],
    });
   }
   setOmpState(next);
   reportSettingsSaveState('saved');
  } catch (error) {
   console.warn('Failed to save the commit message model:', error);
   reportSettingsSaveState('error');
   setCommitModelError(t('settings.common.status.saveFailedReason', {
    reason: error instanceof Error ? error.message : t('settings.common.status.saveFailed'),
   }));
  } finally {
   setIsSavingCommitModel(false);
  }
 }, [t]);

 const handleCommitRoleChange = React.useCallback((selector: string) => {
  void writeCommitRole(selector);
 }, [writeCommitRole]);

 if (isLoading) {
  return null;
 }

 return (
  <SettingsSection title={t('settings.openchamber.git.title')}>
   <div className={SETTINGS_SPACE_ROW_CLASS}>
    <ModelRoleEditor
     role={COMMIT_ROLE}
     roles={roleSelectors}
     models={models}
     directory={settingsDirectory ?? undefined}
     globalLevel={globalThinkingLevel}
     settingsItem="git.commit-model"
     disabled={isSavingCommitModel || !ompState}
     loading={!ompState}
     label={t('settings.omp.modelRoles.role.commit.label')}
     info={t('settings.omp.modelRoles.role.commit.desc')}
     onChange={handleCommitRoleChange}
    />
    {commitModelError ? (
     <p role="alert" className="typography-meta text-[var(--status-error)]">{commitModelError}</p>
    ) : null}

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
