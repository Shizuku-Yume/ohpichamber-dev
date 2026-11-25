import React from 'react';
import { useI18n } from '@/lib/i18n';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import {
  SettingsSection,
  SETTINGS_SPACE_ROW_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { useOmpPageSettings } from '@/components/sections/shared/useOmpPageSettings';
import { OmpRowControl } from '@/components/sections/shared/OmpRowControl';

// OMP's own tools: the headless browser, code and inspection tools, and the
// specialized/external capabilities. The OpenChamber host tools (sessions,
// schedules, the browser panel, terminal, render, image, secret, notify,
// memory, knowledge, usage) live in Settings → General → OhPiChamber Tools.
export const ToolsPage: React.FC = () => {
  const { t } = useI18n();
  const { form: ompForm, updateSetting: updateOmpSetting, getSectionSettings, loading: ompLoading } = useOmpPageSettings('tools');

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

  const hasBrowser = availableById.has('browser.enabled');

  return (
    <SettingsPageLayout
      title={t('settings.page.tools.title')}
      description={t('settings.page.tools.description')}
      showSaveStatus
    >
      {/* OMP Headless Browser */}
      {hasBrowser ? (
        <SettingsSection
          title={t('settings.tools.section.media.title')}
          description={t('settings.tools.section.media.description')}
          divider={false}
          settingsItem="tools.section.media"
        >
          <div className={SETTINGS_SPACE_ROW_CLASS}>
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
          </div>
        </SettingsSection>
      ) : null}

      {/* Code & Inspection Tools */}
      <SettingsSection
        title={t('settings.tools.section.code.title')}
        description={t('settings.tools.section.code.description')}
        divider={false}
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
