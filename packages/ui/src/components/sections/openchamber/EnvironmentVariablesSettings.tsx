import React from 'react';
import { toast } from '@/components/ui';
import { SettingsSection, SETTINGS_HELPER_CLASS } from '@/components/sections/shared/SettingsSection';
import { EnvironmentVariablesEditor } from '@/components/sections/shared/EnvironmentVariablesEditor';
import { SavedSecretsList } from '@/components/sections/shared/SavedSecretsList';
import { fetchUserEnvironment, updateUserEnvironment, type EnvironmentUpdate } from '@/lib/environmentApi';
import { reportSettingsSaveState } from '@/lib/persistence';
import { useEnterpriseMode } from '@/stores/useEnterprisePolicyStore';
import { useI18n } from '@/lib/i18n';
import { problemMessage } from '@/lib/problemMessage';

type LoadState =
  | { state: 'loading' }
  | { state: 'ready'; names: string[]; secrets: string[] }
  | { state: 'failed' };

export const EnvironmentVariablesSettings: React.FC = () => {
  const { t } = useI18n();
  const enterpriseMode = useEnterpriseMode();
  const [load, setLoad] = React.useState<LoadState>({ state: 'loading' });

  React.useEffect(() => {
    let cancelled = false;
    fetchUserEnvironment()
      .then((environment) => {
        if (!cancelled) setLoad({ state: 'ready', names: environment.names, secrets: environment.secrets });
      })
      .catch(() => {
        if (!cancelled) setLoad({ state: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = React.useCallback(async (update: Pick<EnvironmentUpdate, 'variables' | 'secrets'>): Promise<boolean> => {
    reportSettingsSaveState('saving');
    try {
      const environment = await updateUserEnvironment(update);
      setLoad({ state: 'ready', names: environment.names, secrets: environment.secrets });
      reportSettingsSaveState('saved');
      return true;
    } catch (error) {
      reportSettingsSaveState('error');
      toast.error(problemMessage(error, t('settings.environment.editor.saveFailed')));
      return false;
    }
  }, [t]);


  return (
    <SettingsSection
      title={t('settings.environment.user.title')}
      info={t('settings.environment.user.info')}
      settingsItem="general.environment-variables"
    >
      <div className="space-y-3">
        {enterpriseMode ? (
          <p className={SETTINGS_HELPER_CLASS}>{t('settings.environment.user.enterpriseNote')}</p>
        ) : null}
        {load.state === 'failed' ? (
          <p className="typography-meta text-[var(--status-error)]">{t('settings.environment.editor.loadFailed')}</p>
        ) : (
          <>
            <EnvironmentVariablesEditor
              names={load.state === 'ready' ? load.names : []}
              disabled={load.state !== 'ready'}
              onSet={(name, value) => save({ variables: { [name]: value } })}
              onRemove={(name) => save({ variables: { [name]: null } })}
            />
            <SavedSecretsList
              names={load.state === 'ready' ? load.secrets : []}
              disabled={load.state !== 'ready'}
              onRemove={(name) => void save({ secrets: { [name]: null } })}
            />
          </>
        )}
      </div>
    </SettingsSection>
  );
};
