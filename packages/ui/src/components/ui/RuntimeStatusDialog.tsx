import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui';
import { useUIStore } from '@/stores/useUIStore';
import { copyTextToClipboard } from '@/lib/clipboard';
import { useI18n } from '@/lib/i18n';

export const RuntimeStatusDialog: React.FC = () => {
  const { t } = useI18n();
  const isRuntimeStatusDialogOpen = useUIStore((state) => state.isRuntimeStatusDialogOpen);
  const setRuntimeStatusDialogOpen = useUIStore((state) => state.setRuntimeStatusDialogOpen);
  const runtimeStatusText = useUIStore((state) => state.runtimeStatusText);

  const handleCopy = React.useCallback(async () => {
    if (!runtimeStatusText) {
      return;
    }

    const result = await copyTextToClipboard(runtimeStatusText);
    if (result.ok) {
      toast.success(t('runtimeStatusDialog.toast.copiedTitle'), { description: t('runtimeStatusDialog.toast.copiedDescription') });
      return;
    }
    toast.error(t('runtimeStatusDialog.toast.copyFailed'));
  }, [runtimeStatusText, t]);

  return (
    <Dialog open={isRuntimeStatusDialogOpen} onOpenChange={setRuntimeStatusDialogOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('runtimeStatusDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('runtimeStatusDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={handleCopy}
            className="app-region-no-drag inline-flex h-9 items-center justify-center rounded-md px-3 typography-ui-label font-medium text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('runtimeStatusDialog.actions.copy')}
          </button>
        </div>

        <pre className="max-h-[60vh] overflow-auto rounded-lg bg-surface-muted p-4 typography-code text-foreground whitespace-pre-wrap">
          {runtimeStatusText || t('runtimeStatusDialog.empty.noData')}
        </pre>
      </DialogContent>
    </Dialog>
  );
};
