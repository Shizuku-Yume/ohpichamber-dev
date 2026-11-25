import * as React from 'react';

import { formatModelRef, parseModelSelector, type ProblemDetails } from '@openchamber/agent-contract';
import { Icon } from '@/components/icon/Icon';
import type { IconName } from '@/components/icon/icons';
import { SETTINGS_SPACE_ROW_CLASS, SettingsCheckboxRow, SettingsControlGroup, SettingsNewBadge, SettingsSection } from '@/components/sections/shared/SettingsSection';
import { SettingsInfoHint } from '@/components/sections/shared/SettingsInfoHint';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { BUILTIN_BROWSER_PROVIDER, browserProviderGuests } from '@/lib/guests/browser-providers';
import { loadGuestCatalog } from '@/lib/guests/load-catalog';
import { useGuestsStore } from '@/lib/guests/store';
import { updateDesktopSettings } from '@/lib/persistence';
import { useOmpPageSettings, type UseOmpPageSettingsResult } from '@/components/sections/shared/useOmpPageSettings';
import { useUIStore } from '@/stores/useUIStore';
import { useI18n } from '@/lib/i18n';
import { isElectronShell } from '@/lib/desktop';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useSettingsImageModels } from '@/hooks/useSettingsModels';
import { modelRoleChange, parseRolesRecord, reportModelRoleSaveProblem, roleSelector } from '@/components/sections/shared/modelRoleSelectors';
import { ImageModelSelector } from '@/components/sections/model-roles/ImageModelSelector';
import { SETTINGS_WIDTH_SELECT_CLASS } from '@/components/sections/shared/SettingsSection';

interface ToolRowProps {
  icon: IconName;
  title: string;
  summary: string;
  ariaLabel: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  settingsItem: string;
  children?: React.ReactNode;
  reveals?: readonly string[];
  disabled?: boolean;
}

const TOOL_LIST_CLASS = 'max-w-[44rem] space-y-1';
const TOOL_OPTION_TRIGGER_CLASS = 'ms-auto w-auto min-w-0 max-w-[16rem]';

const ToolRow: React.FC<ToolRowProps> = ({ icon, title, summary, ariaLabel, checked, onChange, settingsItem, children, reveals = [], disabled = false }) => (
  <div className="py-2">
    <div data-settings-item={settingsItem} className="flex items-start gap-3">
      <Icon name={icon} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="min-w-0 truncate typography-ui-label text-foreground">{title}</div>
          <SettingsNewBadge items={checked ? [settingsItem] : [settingsItem, ...reveals]} />
        </div>
        <p className="typography-meta text-muted-foreground">{summary}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={ariaLabel} className="mt-0.5" disabled={disabled} />
    </div>
    {children}
  </div>
);

const ToolOption: React.FC<{ settingsItem?: string; label: string; info?: string; children: React.ReactNode }> = ({ settingsItem, label, info, children }) => (
  <div {...(settingsItem ? { 'data-settings-item': settingsItem } : {})} className="mt-2 flex min-w-0 items-center gap-2 ps-7">
    <span className="truncate typography-meta text-muted-foreground">{label}</span>
    {settingsItem ? <SettingsNewBadge items={[settingsItem]} /> : null}
    {info ? <SettingsInfoHint>{info}</SettingsInfoHint> : null}
    {children}
  </div>
);

type OmpToolsContextValue = Pick<UseOmpPageSettingsResult, 'state' | 'form' | 'loading' | 'saving' | 'updateSetting' | 'updateSettings' | 'getSectionSettings'>;

/** The image generation OMP toggle and the role it draws with, owned here on General. */
const ImageToolControl: React.FC<{ omp: OmpToolsContextValue }> = ({ omp }) => {
  const { t } = useI18n();
  const directory = useSettingsDirectory();
  const imageModels = useSettingsImageModels(directory);
  const { state: ompState, form: ompForm, loading: ompLoading, saving: ompSaving } = omp;

  // The row is the `general:tools` section placement: the image switch is the
  // one setting the section holds, read through the section rather than a bare
  // form key so the placement and the drawn row cannot drift apart.
  const imageSetting = omp.getSectionSettings('tools').find((setting) => setting.id === 'generate_image.enabled');
  const enabled = (ompForm['generate_image.enabled'] ?? imageSetting?.value) !== false;
  const modelRolesValue = ompState?.settings.find((setting) => setting.id === 'modelRoles')?.value ?? ompForm.modelRoles;
  const imageRole = roleSelector(parseRolesRecord(modelRolesValue).image);
  const parsedImage = React.useMemo(() => parseModelSelector(imageRole), [imageRole]);

  const setRole = React.useCallback(async (role: string, selector: string) => {
    let observedProblem: ProblemDetails | null = null;
    const saved = await omp.updateSettings((state) => [modelRoleChange(state, role, selector)], {
      onProblem: (problem) => { observedProblem = problem; },
    });
    if (!saved) reportModelRoleSaveProblem(observedProblem, t);
  }, [t, omp]);

  return (
    <ToolRow
      icon="image"
      settingsItem="sessions.agent-image-tool"
      checked={enabled}
      onChange={(checked) => void omp.updateSetting('generate_image.enabled', checked)}
      disabled={ompLoading || !ompState}
      title={t('settings.openchamber.tools.name.image')}
      summary={t('settings.openchamber.tools.field.agentImageToolSummary')}
      ariaLabel={t('settings.openchamber.tools.field.agentImageToolAria')}
    >
      {enabled ? (
        <ToolOption
          label={t('settings.openchamber.tools.imageModel.label')}
          info={t('settings.openchamber.tools.imageModel.info')}
        >
          <div className="ms-auto min-w-0">
            <ImageModelSelector
              providerId={parsedImage?.providerId ?? ''}
              modelId={parsedImage?.modelId ?? ''}
              imageModels={imageModels}
              directory={directory ?? undefined}
              disabled={ompLoading || ompSaving || !ompState}
              loading={ompLoading && !ompState}
              placeholder={t('settings.omp.modelRoles.inheritFallback')}
              ariaLabel={t('settings.openchamber.tools.imageModel.aria')}
              className={SETTINGS_WIDTH_SELECT_CLASS}
              onChange={(providerId, modelId) => {
                const selector = providerId && modelId ? formatModelRef({ provider: providerId, modelId }) : '';
                void setRole('image', selector);
              }}
            />
          </div>
        </ToolOption>
      ) : null}
    </ToolRow>
  );
};

const MEMORY_BACKEND_LABELS: Readonly<Record<string, string>> = {
  local: 'Local',
  mnemopi: 'Mnemopi',
  hindsight: 'Hindsight',
  sharpshooter: 'Sharpshooter',
};

/**
 * The OMP memory backend as one switch. Off writes `off`; on writes the backend
 * OMP's own descriptor declares — its default when that is a real backend, else
 * the first non-`off` enum option — never a client-side guess at which engine
 * the user wanted. The Memory page remains the owner of the backend choice.
 */
const MemoryToolControl: React.FC<{ omp: OmpToolsContextValue }> = ({ omp }) => {
  const { t } = useI18n();
  const { state: ompState, form: ompForm, loading: ompLoading } = omp;

  const descriptor = ompState?.settings.find((setting) => setting.id === 'memory.backend');
  const currentBackend = typeof ompForm['memory.backend'] === 'string' ? ompForm['memory.backend'] : 'off';
  const enabled = currentBackend !== 'off';
  const enableBackend = React.useMemo(() => {
    if (typeof descriptor?.default === 'string' && descriptor.default !== 'off') return descriptor.default;
    const choices = descriptor?.enumValues ?? descriptor?.options?.map((option) => option.value) ?? [];
    return choices.find((value) => value !== 'off') ?? 'local';
  }, [descriptor]);

  const backendLabel = MEMORY_BACKEND_LABELS[currentBackend] ?? currentBackend;

  return (
    <ToolRow
      icon="brain"
      settingsItem="sessions.agent-memory-tool"
      checked={enabled}
      onChange={(checked) => void omp.updateSetting('memory.backend', checked ? enableBackend : 'off')}
      disabled={ompLoading || !ompState}
      title={t('settings.openchamber.tools.name.memory')}
      summary={t('settings.openchamber.tools.field.agentMemoryToolSummary')}
      ariaLabel={t('settings.openchamber.tools.field.agentMemoryToolAria')}
    >
      {enabled ? (
        <ToolOption label={`${t('settings.openchamber.tools.memoryBackend.label')}: ${backendLabel}`}>
          <Button
            variant="link"
            size="sm"
            className="ms-auto h-auto px-0 typography-meta text-muted-foreground"
            onClick={() => useUIStore.getState().requestSettingsJump('memory')}
          >
            {t('settings.openchamber.tools.memorySettings.link')}
          </Button>
        </ToolOption>
      ) : null}
    </ToolRow>
  );
};

export const OpenChamberToolsSettings: React.FC = () => {
  const { t } = useI18n();
  const omp = useOmpPageSettings('general');
  const agentControlToolEnabled = useUIStore((state) => state.agentControlToolEnabled);
  const setAgentControlToolEnabled = useUIStore((state) => state.setAgentControlToolEnabled);
  const agentScheduleToolEnabled = useUIStore((state) => state.agentScheduleToolEnabled);
  const setAgentScheduleToolEnabled = useUIStore((state) => state.setAgentScheduleToolEnabled);
  const agentWebToolEnabled = useUIStore((state) => state.agentWebToolEnabled);
  const setAgentWebToolEnabled = useUIStore((state) => state.setAgentWebToolEnabled);
  const browserProvider = useUIStore((state) => state.browserProvider);
  const setBrowserProvider = useUIStore((state) => state.setBrowserProvider);
  const agentBrowserSharesLogins = useUIStore((state) => state.agentBrowserSharesLogins);
  const setAgentBrowserSharesLogins = useUIStore((state) => state.setAgentBrowserSharesLogins);
  const guests = useGuestsStore((state) => state.guests);
  const agentKnowledgeToolEnabled = useUIStore((state) => state.agentKnowledgeToolEnabled);
  const setAgentKnowledgeToolEnabled = useUIStore((state) => state.setAgentKnowledgeToolEnabled);
  const agentNotifyToolEnabled = useUIStore((state) => state.agentNotifyToolEnabled);
  const setAgentNotifyToolEnabled = useUIStore((state) => state.setAgentNotifyToolEnabled);
  const agentUsageToolEnabled = useUIStore((state) => state.agentUsageToolEnabled);
  const setAgentUsageToolEnabled = useUIStore((state) => state.setAgentUsageToolEnabled);
  const agentTerminalToolEnabled = useUIStore((state) => state.agentTerminalToolEnabled);
  const setAgentTerminalToolEnabled = useUIStore((state) => state.setAgentTerminalToolEnabled);
  const agentRenderToolEnabled = useUIStore((state) => state.agentRenderToolEnabled);
  const setAgentRenderToolEnabled = useUIStore((state) => state.setAgentRenderToolEnabled);
  const agentSecretToolEnabled = useUIStore((state) => state.agentSecretToolEnabled);
  const setAgentSecretToolEnabled = useUIStore((state) => state.setAgentSecretToolEnabled);
  const agentWorkflowAvailable = useUIStore((state) => state.agentWorkflowFeatureAvailable);
  const agentWorkflowToolEnabled = useUIStore((state) => state.agentWorkflowToolEnabled);
  const setAgentWorkflowToolEnabled = useUIStore((state) => state.setAgentWorkflowToolEnabled);

  const handleAgentControlToolChange = React.useCallback((enabled: boolean) => {
    setAgentControlToolEnabled(enabled);
    void updateDesktopSettings({ agentControlToolEnabled: enabled });
  }, [setAgentControlToolEnabled]);

  const handleAgentScheduleToolChange = React.useCallback((enabled: boolean) => {
    setAgentScheduleToolEnabled(enabled);
    void updateDesktopSettings({ agentScheduleToolEnabled: enabled });
  }, [setAgentScheduleToolEnabled]);

  const handleAgentWebToolChange = React.useCallback((enabled: boolean) => {
    setAgentWebToolEnabled(enabled);
    void updateDesktopSettings({ agentWebToolEnabled: enabled });
  }, [setAgentWebToolEnabled]);

  const handleAgentNotifyToolChange = React.useCallback((enabled: boolean) => {
    setAgentNotifyToolEnabled(enabled);
    void updateDesktopSettings({ agentNotifyToolEnabled: enabled });
  }, [setAgentNotifyToolEnabled]);

  const handleAgentUsageToolChange = React.useCallback((enabled: boolean) => {
    setAgentUsageToolEnabled(enabled);
    void updateDesktopSettings({ agentUsageToolEnabled: enabled });
  }, [setAgentUsageToolEnabled]);

  const handleAgentTerminalToolChange = React.useCallback((enabled: boolean) => {
    setAgentTerminalToolEnabled(enabled);
    void updateDesktopSettings({ agentTerminalToolEnabled: enabled });
  }, [setAgentTerminalToolEnabled]);

  const handleAgentRenderToolChange = React.useCallback((enabled: boolean) => {
    setAgentRenderToolEnabled(enabled);
    void updateDesktopSettings({ agentRenderToolEnabled: enabled });
  }, [setAgentRenderToolEnabled]);

  const handleAgentSecretToolChange = React.useCallback((enabled: boolean) => {
    setAgentSecretToolEnabled(enabled);
    void updateDesktopSettings({ agentSecretToolEnabled: enabled });
  }, [setAgentSecretToolEnabled]);

  const handleAgentKnowledgeToolChange = React.useCallback((enabled: boolean) => {
    setAgentKnowledgeToolEnabled(enabled);
    void updateDesktopSettings({ agentKnowledgeToolEnabled: enabled });
  }, [setAgentKnowledgeToolEnabled]);

  const handleAgentWorkflowToolChange = React.useCallback((enabled: boolean) => {
    setAgentWorkflowToolEnabled(enabled);
    void updateDesktopSettings({ agentWorkflowToolEnabled: enabled });
  }, [setAgentWorkflowToolEnabled]);

  React.useEffect(() => {
    void loadGuestCatalog();
  }, []);
  const providerGuests = React.useMemo(() => browserProviderGuests(guests), [guests]);
  const providerValue = providerGuests.some((guest) => guest.id === browserProvider)
    ? browserProvider
    : BUILTIN_BROWSER_PROVIDER;

  const handleBrowserProviderChange = React.useCallback((value: string) => {
    setBrowserProvider(value);
    void updateDesktopSettings({ browserProvider: value });
  }, [setBrowserProvider]);

  const handleAgentBrowserSharesLoginsChange = React.useCallback((enabled: boolean) => {
    setAgentBrowserSharesLogins(enabled);
    void updateDesktopSettings({ agentBrowserSharesLogins: enabled });
  }, [setAgentBrowserSharesLogins]);

  return (
    <SettingsSection title={t('settings.openchamber.tools.title')} contentClassName={SETTINGS_SPACE_ROW_CLASS}>
      <SettingsControlGroup title={t('settings.openchamber.tools.group.work')} contentClassName={TOOL_LIST_CLASS}>
        <ToolRow
          icon="node-tree"
          settingsItem="sessions.agent-control-tool"
          checked={agentControlToolEnabled}
          onChange={handleAgentControlToolChange}
          title={t('settings.openchamber.tools.name.control')}
          summary={t('settings.openchamber.tools.field.agentControlToolSummary')}
          ariaLabel={t('settings.openchamber.tools.field.agentControlToolAria')}
        />
        {agentWorkflowAvailable ? (
          <ToolRow
            icon="flow-chart"
            settingsItem="sessions.agent-workflow-tool"
            checked={agentWorkflowToolEnabled}
            onChange={handleAgentWorkflowToolChange}
            title={t('settings.openchamber.tools.name.workflow')}
            summary={t('settings.openchamber.tools.field.agentWorkflowToolSummary')}
            ariaLabel={t('settings.openchamber.tools.field.agentWorkflowToolAria')}
          />
        ) : null}
        <ToolRow
          icon="calendar-schedule"
          settingsItem="sessions.agent-schedule-tool"
          checked={agentScheduleToolEnabled}
          onChange={handleAgentScheduleToolChange}
          title={t('settings.openchamber.tools.name.schedule')}
          summary={t('settings.openchamber.tools.field.agentScheduleToolSummary')}
          ariaLabel={t('settings.openchamber.tools.field.agentScheduleToolAria')}
        />
        <ToolRow
          icon="global"
          settingsItem="sessions.agent-web-tool"
          reveals={['sessions.browser-provider', 'sessions.agent-browser-logins']}
          checked={agentWebToolEnabled}
          onChange={handleAgentWebToolChange}
          title={t('settings.openchamber.tools.name.web')}
          summary={t('settings.openchamber.tools.field.agentWebToolSummary')}
          ariaLabel={t('settings.openchamber.tools.field.agentWebToolAria')}
        >
          {agentWebToolEnabled ? (
            <ToolOption
              settingsItem="sessions.browser-provider"
              label={t('settings.openchamber.tools.browserProvider.label')}
              info={t('settings.openchamber.tools.browserProvider.info')}
            >
              <Select<string>
                value={providerValue}
                onValueChange={handleBrowserProviderChange}
                disabled={providerGuests.length === 0}
              >
                <SelectTrigger
                  className={TOOL_OPTION_TRIGGER_CLASS}
                  aria-label={t('settings.openchamber.tools.browserProvider.aria')}
                >
                  <SelectValue>
                    {(value) => (
                      value === BUILTIN_BROWSER_PROVIDER
                        ? t('settings.openchamber.tools.browserProvider.option.builtin')
                        : providerGuests.find((guest) => guest.id === value)?.name ?? null
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BUILTIN_BROWSER_PROVIDER}>
                    {t('settings.openchamber.tools.browserProvider.option.builtin')}
                  </SelectItem>
                  {providerGuests.map((guest) => (
                    <SelectItem key={guest.id} value={guest.id}>{guest.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ToolOption>
          ) : null}
          {agentWebToolEnabled && isElectronShell() ? (
            <div className="ps-7">
              <SettingsCheckboxRow
                settingsItem="sessions.agent-browser-logins"
                checked={agentBrowserSharesLogins}
                onChange={handleAgentBrowserSharesLoginsChange}
                label={<span className="typography-meta text-muted-foreground">{t('settings.openchamber.tools.agentBrowserLogins.label')}</span>}
                ariaLabel={t('settings.openchamber.tools.agentBrowserLogins.label')}
                info={t('settings.openchamber.tools.agentBrowserLogins.info')}
              />
            </div>
          ) : null}
        </ToolRow>
        <ToolRow
          icon="terminal-box"
          settingsItem="sessions.agent-terminal-tool"
          checked={agentTerminalToolEnabled}
          onChange={handleAgentTerminalToolChange}
          title={t('settings.openchamber.tools.field.agentTerminalTool')}
          summary={t('settings.openchamber.tools.field.agentTerminalToolSummary')}
          ariaLabel={t('settings.openchamber.tools.field.agentTerminalTool')}
        />
      </SettingsControlGroup>

      <SettingsControlGroup title={t('settings.openchamber.tools.group.chat')} contentClassName={TOOL_LIST_CLASS}>
        <ToolRow
          icon="bar-chart-box"
          settingsItem="sessions.agent-render-tool"
          checked={agentRenderToolEnabled}
          onChange={handleAgentRenderToolChange}
          title={t('settings.openchamber.tools.name.render')}
          summary={t('settings.openchamber.tools.field.agentRenderToolSummary')}
          ariaLabel={t('settings.openchamber.tools.field.agentRenderToolAria')}
        />
        <ImageToolControl omp={omp} />
        <ToolRow
          icon="shield-keyhole"
          settingsItem="sessions.agent-secret-tool"
          checked={agentSecretToolEnabled}
          onChange={handleAgentSecretToolChange}
          title={t('settings.openchamber.tools.name.secret')}
          summary={t('settings.openchamber.tools.field.agentSecretToolSummary')}
          ariaLabel={t('settings.openchamber.tools.field.agentSecretToolAria')}
        />
        <ToolRow
          icon="notification-3"
          settingsItem="sessions.agent-notify-tool"
          checked={agentNotifyToolEnabled}
          onChange={handleAgentNotifyToolChange}
          title={t('settings.openchamber.tools.name.notify')}
          summary={t('settings.openchamber.tools.field.agentNotifyToolSummary')}
          ariaLabel={t('settings.openchamber.tools.field.agentNotifyToolAria')}
        />
      </SettingsControlGroup>

      <SettingsControlGroup title={t('settings.openchamber.tools.group.knowledge')} contentClassName={TOOL_LIST_CLASS}>
        <MemoryToolControl omp={omp} />
        <ToolRow
          icon="sticky-note"
          settingsItem="sessions.agent-knowledge-tool"
          checked={agentKnowledgeToolEnabled}
          onChange={handleAgentKnowledgeToolChange}
          title={t('settings.openchamber.tools.name.knowledge')}
          summary={t('settings.openchamber.tools.field.agentKnowledgeToolSummary')}
          ariaLabel={t('settings.openchamber.tools.field.agentKnowledgeToolAria')}
        />
        <ToolRow
          icon="bar-chart-2"
          settingsItem="sessions.agent-usage-tool"
          checked={agentUsageToolEnabled}
          onChange={handleAgentUsageToolChange}
          title={t('settings.openchamber.tools.name.usage')}
          summary={t('settings.openchamber.tools.field.agentUsageToolSummary')}
          ariaLabel={t('settings.openchamber.tools.field.agentUsageToolAria')}
        />
      </SettingsControlGroup>
    </SettingsSection>
  );
};

