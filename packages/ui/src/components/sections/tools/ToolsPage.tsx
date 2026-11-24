import React from 'react';
import { formatModelRef, parseModelSelector } from '@openchamber/agent-contract';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/components/ui';
import { useUIStore } from '@/stores/useUIStore';
import { updateDesktopSettings } from '@/lib/persistence';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useSettingsImageModels } from '@/hooks/useSettingsModels';
import { useGuestsStore } from '@/lib/guests/store';
import { loadGuestCatalog } from '@/lib/guests/load-catalog';
import { BUILTIN_BROWSER_PROVIDER, browserProviderGuests } from '@/lib/guests/browser-providers';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import {
  SettingsCheckboxRow,
  SettingsFieldRow,
  SettingsSection,
  SETTINGS_SPACE_ROW_CLASS,
  SETTINGS_WIDTH_SELECT_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOmpPageSettings } from '@/components/sections/shared/useOmpPageSettings';
import { OmpRowControl } from '@/components/sections/shared/OmpRowControl';
import { modelRoleChange, parseRolesRecord, roleSelector } from '@/components/sections/shared/modelRoleSelectors';
import { ImageModelSelector } from '@/components/sections/model-roles/ImageModelSelector';
import { isElectronShell } from '@/lib/desktop';

export const ToolsPage: React.FC = () => {
  const { t } = useI18n();
  const directory = useSettingsDirectory();
  const imageModels = useSettingsImageModels(directory);
  const guests = useGuestsStore((state) => state.guests);

  // Host tools state
  const agentControlToolEnabled = useUIStore((state) => state.agentControlToolEnabled);
  const setAgentControlToolEnabled = useUIStore((state) => state.setAgentControlToolEnabled);
  const agentWebToolEnabled = useUIStore((state) => state.agentWebToolEnabled);
  const setAgentWebToolEnabled = useUIStore((state) => state.setAgentWebToolEnabled);
  const browserProvider = useUIStore((state) => state.browserProvider);
  const setBrowserProvider = useUIStore((state) => state.setBrowserProvider);
  const agentBrowserSharesLogins = useUIStore((state) => state.agentBrowserSharesLogins);
  const setAgentBrowserSharesLogins = useUIStore((state) => state.setAgentBrowserSharesLogins);
  const agentTerminalToolEnabled = useUIStore((state) => state.agentTerminalToolEnabled);
  const setAgentTerminalToolEnabled = useUIStore((state) => state.setAgentTerminalToolEnabled);
  const agentKnowledgeToolEnabled = useUIStore((state) => state.agentKnowledgeToolEnabled);
  const setAgentKnowledgeToolEnabled = useUIStore((state) => state.setAgentKnowledgeToolEnabled);
  const agentNotifyToolEnabled = useUIStore((state) => state.agentNotifyToolEnabled);
  const setAgentNotifyToolEnabled = useUIStore((state) => state.setAgentNotifyToolEnabled);
  const agentRenderToolEnabled = useUIStore((state) => state.agentRenderToolEnabled);
  const setAgentRenderToolEnabled = useUIStore((state) => state.setAgentRenderToolEnabled);
  const agentWorkflowAvailable = useUIStore((state) => state.agentWorkflowFeatureAvailable);
  const agentWorkflowToolEnabled = useUIStore((state) => state.agentWorkflowToolEnabled);
  const setAgentWorkflowToolEnabled = useUIStore((state) => state.setAgentWorkflowToolEnabled);

  // OMP tools state
  const { state: ompState, form: ompForm, updateSetting: updateOmpSetting, updateSettings, getSectionSettings, loading: ompLoading, saving: ompSaving } = useOmpPageSettings('tools');

  React.useEffect(() => {
    void loadGuestCatalog();
  }, []);

  const providerGuests = React.useMemo(() => browserProviderGuests(guests), [guests]);
  const providerValue = providerGuests.some((guest) => guest.id === browserProvider)
    ? browserProvider
    : BUILTIN_BROWSER_PROVIDER;

  const handleControlToolChange = React.useCallback((checked: boolean) => {
    setAgentControlToolEnabled(checked);
    void updateDesktopSettings({ agentControlToolEnabled: checked });
  }, [setAgentControlToolEnabled]);

  const handleWebToolChange = React.useCallback((checked: boolean) => {
    setAgentWebToolEnabled(checked);
    void updateDesktopSettings({ agentWebToolEnabled: checked });
  }, [setAgentWebToolEnabled]);

  const handleBrowserProviderChange = React.useCallback((val: string) => {
    setBrowserProvider(val);
    void updateDesktopSettings({ browserProvider: val });
  }, [setBrowserProvider]);

  const handleKnowledgeToolChange = React.useCallback((checked: boolean) => {
    setAgentKnowledgeToolEnabled(checked);
    void updateDesktopSettings({ agentKnowledgeToolEnabled: checked });
  }, [setAgentKnowledgeToolEnabled]);

  const handleNotifyToolChange = React.useCallback((checked: boolean) => {
    setAgentNotifyToolEnabled(checked);
    void updateDesktopSettings({ agentNotifyToolEnabled: checked });
  }, [setAgentNotifyToolEnabled]);

  const handleRenderToolChange = React.useCallback((checked: boolean) => {
    setAgentRenderToolEnabled(checked);
    void updateDesktopSettings({ agentRenderToolEnabled: checked });
  }, [setAgentRenderToolEnabled]);

  const handleWorkflowToolChange = React.useCallback((checked: boolean) => {
    setAgentWorkflowToolEnabled(checked);
    void updateDesktopSettings({ agentWorkflowToolEnabled: checked });
  }, [setAgentWorkflowToolEnabled]);

  // Model roles for image tool
  const modelRolesValue = ompState?.settings.find((setting) => setting.id === 'modelRoles')?.value ?? ompForm.modelRoles;
  const imageRole = roleSelector(parseRolesRecord(modelRolesValue).image);
  const parsedImage = React.useMemo(() => parseModelSelector(imageRole), [imageRole]);

  const setRole = React.useCallback(async (role: string, selector: string) => {
    const saved = await updateSettings((state) => [modelRoleChange(state, role, selector)]);
    if (!saved) toast.error(t('settings.omp.modelRoles.saveFailed'));
  }, [t, updateSettings]);


  const availableSettings = getSectionSettings('available');
  const availableById = React.useMemo(() => {
    const map = new Map<string, (typeof availableSettings)[number]>();
    for (const s of availableSettings) map.set(s.id, s);
    return map;
  }, [availableSettings]);

  const browserOptions = getSectionSettings('browser');
  const todoOptions = getSectionSettings('todo');
  const grepOptions = getSectionSettings('grep');
  const computerOptions = getSectionSettings('computer');
  const githubOptions = getSectionSettings('github');

  return (
    <SettingsPageLayout
      title={t('settings.page.tools.title')}
      description={t('settings.page.tools.description')}
      showSaveStatus
    >
      {/* OpenChamber Host Tools */}
      <SettingsSection
        title={t('settings.tools.section.host.title')}
        description={t('settings.tools.section.host.description')}
        divider={false}
        settingsItem="tools.section.host"
      >
        <div className={SETTINGS_SPACE_ROW_CLASS}>
          <SettingsCheckboxRow
            settingsItem="sessions.agent-terminal-tool"
            checked={agentTerminalToolEnabled}
            onChange={(enabled) => {
              setAgentTerminalToolEnabled(enabled);
              void updateDesktopSettings({ agentTerminalToolEnabled: enabled });
            }}
            label={t('settings.openchamber.tools.field.agentTerminalTool')}
            info={t('settings.openchamber.tools.field.agentTerminalToolSummary')}
          />
          {isElectronShell() ? (
            <SettingsCheckboxRow
              settingsItem="sessions.agent-browser-logins"
              checked={agentBrowserSharesLogins}
              onChange={(enabled) => {
                setAgentBrowserSharesLogins(enabled);
                void updateDesktopSettings({ agentBrowserSharesLogins: enabled });
              }}
              label={t('settings.openchamber.tools.agentBrowserLogins.label')}
              info={t('settings.openchamber.tools.agentBrowserLogins.info')}
            />
          ) : null}
          <SettingsCheckboxRow
            settingsItem="sessions.agent-control-tool"
            checked={agentControlToolEnabled}
            onChange={handleControlToolChange}
            label={t('settings.openchamber.tools.field.agentControlTool')}
            info={t('settings.openchamber.tools.field.agentControlToolInfo')}
            ariaLabel={t('settings.openchamber.tools.field.agentControlToolAria')}
          />

          <SettingsCheckboxRow
            settingsItem="sessions.agent-web-tool"
            checked={agentWebToolEnabled}
            onChange={handleWebToolChange}
            label={t('settings.openchamber.tools.field.agentWebTool')}
            info={t('settings.openchamber.tools.field.agentWebToolInfo')}
            ariaLabel={t('settings.openchamber.tools.field.agentWebToolAria')}
          />
          {agentWebToolEnabled ? (
            <div className="ps-6">
              <SettingsFieldRow
                settingsItem="sessions.browser-provider"
                label={t('settings.openchamber.tools.browserProvider.label')}
                info={t('settings.openchamber.tools.browserProvider.info')}
              >
                <Select value={providerValue} onValueChange={handleBrowserProviderChange}>
                  <SelectTrigger className={SETTINGS_WIDTH_SELECT_CLASS} aria-label={t('settings.openchamber.tools.browserProvider.aria')}>
                    <SelectValue>
                      {(val) =>
                        val === BUILTIN_BROWSER_PROVIDER
                          ? t('settings.openchamber.tools.browserProvider.option.builtin')
                          : providerGuests.find((g) => g.id === val)?.name ?? null
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={BUILTIN_BROWSER_PROVIDER}>
                      {t('settings.openchamber.tools.browserProvider.option.builtin')}
                    </SelectItem>
                    {providerGuests.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingsFieldRow>
            </div>
          ) : null}

          <SettingsCheckboxRow
            settingsItem="sessions.agent-knowledge-tool"
            checked={agentKnowledgeToolEnabled}
            onChange={handleKnowledgeToolChange}
            label={t('settings.openchamber.tools.field.agentKnowledgeTool')}
            info={t('settings.openchamber.tools.field.agentKnowledgeToolInfo')}
            ariaLabel={t('settings.openchamber.tools.field.agentKnowledgeToolAria')}
          />

          <SettingsCheckboxRow
            settingsItem="sessions.agent-notify-tool"
            checked={agentNotifyToolEnabled}
            onChange={handleNotifyToolChange}
            label={t('settings.openchamber.tools.field.agentNotifyTool')}
            info={t('settings.openchamber.tools.field.agentNotifyToolInfo')}
            ariaLabel={t('settings.openchamber.tools.field.agentNotifyToolAria')}
          />

          <SettingsCheckboxRow
            settingsItem="sessions.agent-render-tool"
            checked={agentRenderToolEnabled}
            onChange={handleRenderToolChange}
            label={t('settings.openchamber.tools.field.agentRenderTool')}
            info={t('settings.openchamber.tools.field.agentRenderToolInfo')}
            ariaLabel={t('settings.openchamber.tools.field.agentRenderToolAria')}
          />

          {agentWorkflowAvailable ? (
            <SettingsCheckboxRow
              settingsItem="sessions.agent-workflow-tool"
              checked={agentWorkflowToolEnabled}
              onChange={handleWorkflowToolChange}
              label={t('settings.openchamber.tools.field.agentWorkflowTool')}
              info={t('settings.openchamber.tools.field.agentWorkflowToolInfo')}
              ariaLabel={t('settings.openchamber.tools.field.agentWorkflowToolAria')}
            />
          ) : null}
        </div>
      </SettingsSection>

      {/* Web & Image Capabilities (OMP Headless Browser & Image Generation) */}
      <SettingsSection
        title={t('settings.tools.section.media.title')}
        description={t('settings.tools.section.media.description')}
        settingsItem="tools.section.media"
      >
        <div className={SETTINGS_SPACE_ROW_CLASS}>
          {availableById.has('browser.enabled') ? (
            <>
              <OmpRowControl
                setting={availableById.get('browser.enabled')!}
                value={ompForm['browser.enabled'] !== undefined ? ompForm['browser.enabled'] : availableById.get('browser.enabled')!.value}
                disabled={ompLoading}
                onChange={(val) => void updateOmpSetting('browser.enabled', val)}
              />
              {ompForm['browser.enabled'] !== false && browserOptions.length > 0 ? (
                <div className={`ps-6 ${SETTINGS_SPACE_ROW_CLASS}`}>
                  {browserOptions.map((opt) => (
                    <OmpRowControl
                      key={opt.id}
                      setting={opt}
                      value={ompForm[opt.id] !== undefined ? ompForm[opt.id] : opt.value}
                      disabled={ompLoading}
                      onChange={(val) => void updateOmpSetting(opt.id, val)}
                    />
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          {availableById.has('generate_image.enabled') ? (
            <>
              <OmpRowControl
                setting={availableById.get('generate_image.enabled')!}
                value={ompForm['generate_image.enabled'] !== undefined ? ompForm['generate_image.enabled'] : availableById.get('generate_image.enabled')!.value}
                disabled={ompLoading}
                onChange={(val) => void updateOmpSetting('generate_image.enabled', val)}
              />
              {ompForm['generate_image.enabled'] !== false ? (
                <div className="ps-6">
                  <SettingsFieldRow
                    label={t('settings.omp.modelRoles.role.image.label')}
                    info={t('settings.omp.modelRoles.role.image.desc')}
                  >
                    <ImageModelSelector
                      providerId={parsedImage?.providerId ?? ''}
                      modelId={parsedImage?.modelId ?? ''}
                      imageModels={imageModels}
                      directory={directory ?? undefined}
                      disabled={ompLoading || ompSaving || !ompState}
                      loading={ompLoading && !ompState}
                      placeholder={t('settings.omp.modelRoles.inheritFallback')}
                      ariaLabel={t('settings.omp.modelRoles.role.image.label')}
                      className={SETTINGS_WIDTH_SELECT_CLASS}
                      onChange={(providerId, modelId) => {
                        const selector = providerId && modelId ? formatModelRef({ provider: providerId, modelId }) : '';
                        void setRole('image', selector);
                      }}
                    />
                  </SettingsFieldRow>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </SettingsSection>

      {/* Code & Inspection Tools */}
      <SettingsSection
        title={t('settings.tools.section.code.title')}
        description={t('settings.tools.section.code.description')}
        settingsItem="tools.section.code"
      >
        <div className={SETTINGS_SPACE_ROW_CLASS}>
          {['todo.enabled', 'find.enabled', 'glob.enabled', 'grep.enabled', 'astGrep.enabled', 'astEdit.enabled', 'debug.enabled', 'launch.enabled'].map((id) => {
            const s = availableById.get(id);
            if (!s) return null;
            return (
              <React.Fragment key={id}>
                <OmpRowControl
                  setting={s}
                  value={ompForm[id] !== undefined ? ompForm[id] : s.value}
                  disabled={ompLoading}
                  onChange={(val) => void updateOmpSetting(id, val)}
                />
                {id === 'todo.enabled' && ompForm['todo.enabled'] !== false && todoOptions.length > 0 ? (
                  <div className={`ps-6 ${SETTINGS_SPACE_ROW_CLASS}`}>
                    {todoOptions.map((opt) => (
                      <OmpRowControl
                        key={opt.id}
                        setting={opt}
                        value={ompForm[opt.id] !== undefined ? ompForm[opt.id] : opt.value}
                        disabled={ompLoading}
                        onChange={(val) => void updateOmpSetting(opt.id, val)}
                      />
                    ))}
                  </div>
                ) : null}
                {id === 'grep.enabled' && ompForm['grep.enabled'] !== false && grepOptions.length > 0 ? (
                  <div className={`ps-6 ${SETTINGS_SPACE_ROW_CLASS}`}>
                    {grepOptions.map((opt) => (
                      <OmpRowControl
                        key={opt.id}
                        setting={opt}
                        value={ompForm[opt.id] !== undefined ? ompForm[opt.id] : opt.value}
                        disabled={ompLoading}
                        onChange={(val) => void updateOmpSetting(opt.id, val)}
                      />
                    ))}
                  </div>
                ) : null}
              </React.Fragment>
            );
          })}
        </div>
      </SettingsSection>

      {/* Specialized & External Capabilities */}
      <SettingsSection
        title={t('settings.tools.section.specialized.title')}
        description={t('settings.tools.section.specialized.description')}
        settingsItem="tools.section.specialized"
      >
        <div className={SETTINGS_SPACE_ROW_CLASS}>
          {['web_search.enabled', 'fetch.enabled', 'github.enabled', 'computer.enabled', 'ratchet.enabled', 'archive.enabled', 'checkpoint.enabled', 'vault.enabled', 'security.enabled', 'ask.enabled', 'out.enabled', 'speechgen.enabled'].map((id) => {
            const s = availableById.get(id);
            if (!s) return null;
            return (
              <React.Fragment key={id}>
                <OmpRowControl
                  setting={s}
                  value={ompForm[id] !== undefined ? ompForm[id] : s.value}
                  disabled={ompLoading}
                  onChange={(val) => void updateOmpSetting(id, val)}
                />
                {id === 'computer.enabled' && ompForm['computer.enabled'] !== false && computerOptions.length > 0 ? (
                  <div className={`ps-6 ${SETTINGS_SPACE_ROW_CLASS}`}>
                    {computerOptions.map((opt) => (
                      <OmpRowControl
                        key={opt.id}
                        setting={opt}
                        value={ompForm[opt.id] !== undefined ? ompForm[opt.id] : opt.value}
                        disabled={ompLoading}
                        onChange={(val) => void updateOmpSetting(opt.id, val)}
                      />
                    ))}
                  </div>
                ) : null}
                {id === 'github.enabled' && ompForm['github.enabled'] !== false && githubOptions.length > 0 ? (
                  <div className={`ps-6 ${SETTINGS_SPACE_ROW_CLASS}`}>
                    {githubOptions.map((opt) => (
                      <OmpRowControl
                        key={opt.id}
                        setting={opt}
                        value={ompForm[opt.id] !== undefined ? ompForm[opt.id] : opt.value}
                        disabled={ompLoading}
                        onChange={(val) => void updateOmpSetting(opt.id, val)}
                      />
                    ))}
                  </div>
                ) : null}
              </React.Fragment>
            );
          })}
        </div>
      </SettingsSection>
    </SettingsPageLayout>
  );
};
