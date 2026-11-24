import React from 'react';
import type { OmpSetting, OmpSettingValue } from '@openchamber/agent-contract';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { OmpRowControl } from '@/components/sections/shared/OmpRowControl';
import { SETTINGS_SPACE_ROW_CLASS } from '@/components/sections/shared/SettingsSection';

interface DiscoverySourcesDialogProps {
  settings: readonly OmpSetting[];
  saving?: boolean;
  onSettingChange: (setting: OmpSetting, value: OmpSettingValue) => Promise<void> | void;
}

export const DiscoverySourcesDialog: React.FC<DiscoverySourcesDialogProps> = ({
  settings,
  saving = false,
  onSettingChange,
}) => {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);

  if (settings.length === 0) return null;

  const title = t('settings.omp.discovery.title');

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Icon name="folder-open" className="size-3.5" />
        {title}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className={SETTINGS_SPACE_ROW_CLASS}>
            {settings.map((setting) => {
              const overridden = setting.conditionActive === false;
              return (
                <OmpRowControl
                  key={setting.id}
                  setting={setting}
                  value={setting.value}
                  disabled={saving || overridden}
                  description={overridden ? t('settings.omp.sharedConfig.overridden') : undefined}
                  onChange={(value) => void onSettingChange(setting, value)}
                />
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              {t('settings.common.actions.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
