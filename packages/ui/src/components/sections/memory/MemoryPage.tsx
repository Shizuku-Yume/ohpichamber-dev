import React from 'react';
import { formatModelRef, parseModelSelector } from '@openchamber/agent-contract';
import { useI18n } from '@/lib/i18n';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useSettingsModels } from '@/hooks/useSettingsModels';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import {
  SettingsFieldRow,
  SettingsSection,
  SETTINGS_SPACE_ROW_CLASS,
  SETTINGS_WIDTH_SELECT_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { ModelSelector } from '@/components/sections/agents/ModelSelector';
import { ModelRoleEditor } from '@/components/sections/shared/ModelRoleEditor';
import { useOmpPageSettings } from '@/components/sections/shared/useOmpPageSettings';
import { OmpRowControl } from '@/components/sections/shared/OmpRowControl';
import { defaultThinkingLevelFromState, modelRoleChange, parseRolesRecord, replaceFirstSelector, roleSelector, splitRoleSelector } from '@/components/sections/shared/modelRoleSelectors';
import { toast } from '@/components/ui';

export const MemoryPage: React.FC = () => {
  const { t } = useI18n();
  const directory = useSettingsDirectory();
  const models = useSettingsModels(directory);

  const { state: ompState, form: ompForm, updateSetting: updateOmpSetting, updateSettings, getSectionSettings, loading: ompLoading, saving } = useOmpPageSettings('memory');

  const modelRolesSetting = ompState?.settings.find((s) => s.id === 'modelRoles');
  const rolesMap = React.useMemo(() => parseRolesRecord(modelRolesSetting?.value), [modelRolesSetting?.value]);
  const roleSelectors = React.useMemo(
    () => Object.fromEntries(Object.entries(rolesMap).map(([role, value]) => [role, roleSelector(value)])),
    [rolesMap],
  );

  const globalLevel = React.useMemo(() => defaultThinkingLevelFromState(ompState), [ompState]);

  const setRole = React.useCallback(async (role: string, selector: string) => {
    const saved = await updateSettings((state) => [modelRoleChange(state, role, selector)]);
    if (!saved) toast.error(t('settings.omp.modelRoles.saveFailed'));
  }, [t, updateSettings]);

  const backendSettings = getSectionSettings('backend');
  const backendById = React.useMemo(() => {
    const map = new Map<string, (typeof backendSettings)[number]>();
    for (const s of backendSettings) map.set(s.id, s);
    return map;
  }, [backendSettings]);

  const currentBackend = ompForm['memory.backend'] ?? backendById.get('memory.backend')?.value ?? 'off';
  const isEnabled = currentBackend !== 'off';
  const sharpshooterSetting = backendById.get('sharpshooter.model');
  const sharpshooterValue = ompForm['sharpshooter.model'] === undefined
    ? sharpshooterSetting?.value
    : ompForm['sharpshooter.model'];
  const sharpshooterSelector = typeof sharpshooterValue === 'string' ? sharpshooterValue : '';
  const sharpshooterModel = parseModelSelector(splitRoleSelector(roleSelector(sharpshooterSelector), models).model);

  const mnemopiKeys = [
    'mnemopi.bank',
    'mnemopi.scoping',
    'mnemopi.embeddingVariant',
    'mnemopi.autoRecall',
    'mnemopi.autoRetain',
    'mnemopi.polyphonicRecall',
    'mnemopi.enhancedRecall',
    'mnemopi.proactiveLinking',
    'mnemopi.noEmbeddings',
    'mnemopi.embeddingModel',
    'mnemopi.llmMode',
    'mnemopi.llmModel',
  ];

  const hindsightKeys = [
    'hindsight.bankId',
    'hindsight.scoping',
    'hindsight.globalScope',
    'hindsight.autoRecall',
    'hindsight.autoRetain',
    'hindsight.retainMode',
    'hindsight.mentalModelsEnabled',
    'hindsight.mentalModelAutoSeed',
  ];

  return (
    <SettingsPageLayout
      title={t('settings.page.memory.title')}
      description={t('settings.page.memory.description')}
      showSaveStatus
    >
      {/* Backend selection */}
      <SettingsSection
        title={t('settings.memory.section.backend.title')}
        description={t('settings.memory.section.backend.description')}
        divider={false}
        settingsItem="memory.section.backend"
      >
        <div className={SETTINGS_SPACE_ROW_CLASS}>
          {backendById.has('memory.backend') ? (
            <OmpRowControl
              setting={backendById.get('memory.backend')!}
              value={currentBackend}
              disabled={ompLoading}
              onChange={(val) => void updateOmpSetting('memory.backend', val)}
            />
          ) : null}

          {isEnabled ? (
            <div className="pt-2">
              <ModelRoleEditor
                role="memory"
                roles={roleSelectors}
                models={models}
                directory={directory ?? undefined}
                globalLevel={globalLevel}
                disabled={ompLoading || saving || !ompState}
                loading={ompLoading && !ompState}
                label={t('settings.omp.modelRoles.role.memory.label')}
                info={t('settings.omp.modelRoles.role.memory.desc')}
                onChange={(selector) => void setRole('memory', selector)}
              />
            </div>
          ) : null}

          {currentBackend === 'sharpshooter' && sharpshooterSetting ? (
            <SettingsFieldRow
              settingsItem="omp.sharpshooter.model"
              label={t('settings.omp.items.sharpshooter.model.label')}
              info={t('settings.omp.items.sharpshooter.model.description')}
            >
              <ModelSelector
                providerId={sharpshooterModel?.providerId ?? ''}
                modelId={sharpshooterModel?.modelId ?? ''}
                placeholder={sharpshooterSelector || t('settings.omp.sharpshooter.useSmallModel')}
                noneLabel={t('settings.omp.sharpshooter.useSmallModel')}
                directory={directory ?? undefined}
                disabled={ompLoading || saving}
                className={SETTINGS_WIDTH_SELECT_CLASS}
                onChange={(providerId, modelId) => {
                  if (providerId === sharpshooterModel?.providerId && modelId === sharpshooterModel.modelId) return;
                  const selector = formatModelRef({ providerId, modelId });
                  void updateSettings((state) => {
                    const current = state.settings.find((setting) => setting.id === 'sharpshooter.model')?.value;
                    return [{ id: 'sharpshooter.model', value: selector ? replaceFirstSelector(current, selector) : null }];
                  });
                }}
              />
            </SettingsFieldRow>
          ) : null}
        </div>
      </SettingsSection>

      {/* Autolearn */}
      <SettingsSection
        title={t('settings.memory.section.autolearn.title')}
        description={t('settings.memory.section.autolearn.description')}
        settingsItem="memory.section.autolearn"
      >
        <div className={SETTINGS_SPACE_ROW_CLASS}>
          {['autolearn.enabled', 'autolearn.autoContinue'].map((id) => {
            const s = backendById.get(id);
            if (!s) return null;
            return (
              <OmpRowControl
                key={id}
                setting={s}
                value={ompForm[id] !== undefined ? ompForm[id] : s.value}
                disabled={ompLoading}
                onChange={(val) => void updateOmpSetting(id, val)}
              />
            );
          })}
        </div>
      </SettingsSection>

      {/* MnemoPi Options */}
      {(currentBackend === 'mnemopi' || currentBackend === 'off') ? (
        <SettingsSection
          title={t('settings.memory.section.mnemopi.title')}
          description={t('settings.memory.section.mnemopi.description')}
          settingsItem="memory.section.mnemopi"
        >
          <div className={SETTINGS_SPACE_ROW_CLASS}>
            {mnemopiKeys.map((id) => {
              const s = backendById.get(id);
              if (!s) return null;
              return (
                <OmpRowControl
                  key={id}
                  setting={s}
                  value={ompForm[id] !== undefined ? ompForm[id] : s.value}
                  disabled={ompLoading}
                  onChange={(val) => void updateOmpSetting(id, val)}
                />
              );
            })}
          </div>
        </SettingsSection>
      ) : null}

      {/* Hindsight Options */}
      {(currentBackend === 'hindsight' || currentBackend === 'off') ? (
        <SettingsSection
          title={t('settings.memory.section.hindsight.title')}
          description={t('settings.memory.section.hindsight.description')}
          settingsItem="memory.section.hindsight"
        >
          <div className={SETTINGS_SPACE_ROW_CLASS}>
            {hindsightKeys.map((id) => {
              const s = backendById.get(id);
              if (!s) return null;
              return (
                <OmpRowControl
                  key={id}
                  setting={s}
                  value={ompForm[id] !== undefined ? ompForm[id] : s.value}
                  disabled={ompLoading}
                  onChange={(val) => void updateOmpSetting(id, val)}
                />
              );
            })}
          </div>
        </SettingsSection>
      ) : null}
    </SettingsPageLayout>
  );
};
