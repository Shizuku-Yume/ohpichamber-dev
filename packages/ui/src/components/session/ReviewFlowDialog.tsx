import React from 'react';

import { DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ModelSelector } from '@/components/sections/agents/ModelSelector';
import { ThinkingPill } from '@/components/session/ThinkingPill';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n';
import { useConfigStore } from '@/stores/useConfigStore';
<<<<<<< HEAD
=======
import { useAgentsStore } from '@/stores/useAgentsStore';
import { isAutoReviewAvailable } from '@/stores/useAutoReviewStore';
import { listModelVariantIds, type ModelVariantSource } from '@/lib/modelVariants';
>>>>>>> bc50ba56a

export type ReviewFlowExecution = {
  providerId: string;
  modelId: string;
  variant: string;
  generateHandoff: boolean;
  autoReview: boolean;
};

const getInitialExecution = (params: { providerId: string; modelId: string; variant: string }): ReviewFlowExecution => ({
  providerId: params.providerId,
  modelId: params.modelId,
  variant: params.variant,
  generateHandoff: true,
  autoReview: false,
});
type ReviewFlowDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectDirectory: string | null;
  submitting?: boolean;
  onConfirm: (execution: ReviewFlowExecution) => Promise<void> | void;
};


function ReviewFlowDialogView({
  open,
  onOpenChange,
  projectDirectory,
  submitting = false,
  onConfirm,
}: ReviewFlowDialogProps) {
  const { t } = useI18n();
  const loadProviders = useConfigStore((state) => state.loadProviders);
  const providers = useConfigStore((state) => state.providers);
  const currentProviderID = useConfigStore((state) => state.currentProviderId);
  const currentModelID = useConfigStore((state) => state.currentModelId);
  const currentVariant = useConfigStore((state) => state.currentVariant || '');

  const [execution, setExecution] = React.useState<ReviewFlowExecution>(() => getInitialExecution({
    providerId: currentProviderID,
    modelId: currentModelID,
    variant: currentVariant,
  }));

  React.useEffect(() => {
    if (!open) return;
    void loadProviders({ directory: projectDirectory, source: 'reviewFlowDialog' });
  }, [open, loadProviders, projectDirectory]);

  React.useEffect(() => {
    if (!open) return;
    setExecution(getInitialExecution({ providerId: currentProviderID, modelId: currentModelID, variant: currentVariant }));
  }, [open, currentProviderID, currentModelID, currentVariant]);

  React.useEffect(() => {
    if (!open || providers.length === 0) return;

    const provider = providers.find((item) => item.providerId === execution.providerId) ?? providers[0];
    const models = Array.isArray(provider?.models) ? provider.models : [];
    const hasModel = models.some((item) => item.modelId === execution.modelId);
    const fallbackModelId = models[0]?.modelId ?? '';
    if (provider?.providerId === execution.providerId && hasModel) return;
    setExecution((prev) => ({ ...prev, providerId: provider?.providerId ?? '', modelId: hasModel ? prev.modelId : fallbackModelId, variant: '' }));
  }, [open, providers, execution.providerId, execution.modelId]);


  const variantOptions = React.useMemo(() => {
    const provider = providers.find((item) => item.providerId === execution.providerId);
    const model = provider?.models?.find((item) => item.modelId === execution.modelId);
    return model?.variants.map((entry) => entry.variant) ?? [];
  }, [providers, execution.providerId, execution.modelId]);

  const hasVariantOptions = variantOptions.length > 0;

  React.useEffect(() => {
    if (hasVariantOptions || !execution.variant) return;
    setExecution((prev) => ({ ...prev, variant: '' }));
  }, [hasVariantOptions, execution.variant]);

  const canConfirm = execution.providerId.trim().length > 0 && execution.modelId.trim().length > 0;

  const handleSubmit = React.useCallback(() => {
    if (!canConfirm || submitting) return;
    void onConfirm(execution);
  }, [canConfirm, submitting, onConfirm, execution]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, handleSubmit]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!submitting) onOpenChange(nextOpen); }}>
      <DialogContent className="max-w-md overflow-visible">
        <DialogHeader>
          <DialogTitle>{t('diffView.reviewDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('diffView.reviewDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-[color:color-mix(in_srgb,var(--status-info)_35%,var(--interactive-border))] bg-[color:color-mix(in_srgb,var(--status-info)_10%,var(--surface-background))] px-3 py-2 typography-meta text-foreground">
            {t('diffView.reviewDialog.info')}
          </div>

          <label className="flex items-center gap-2 typography-ui-label text-foreground">
            <Checkbox
              checked={execution.generateHandoff}
              onChange={(generateHandoff) => setExecution((prev) => ({ ...prev, generateHandoff }))}
              disabled={submitting}
              ariaLabel={t('diffView.reviewDialog.generateHandoff')}
            />
            <span>{t('diffView.reviewDialog.generateHandoff')}</span>
          </label>

          {/* The loop runs on the OpenChamber server, which VS Code does not have. */}
          {isAutoReviewAvailable() ? (
            <label className="flex items-center gap-2 typography-ui-label text-foreground">
              <Checkbox
                checked={execution.autoReview}
                onChange={(autoReview) => setExecution((prev) => ({ ...prev, autoReview }))}
                disabled={submitting}
                ariaLabel={t('diffView.reviewDialog.autoReview')}
              />
              <span>{t('diffView.reviewDialog.autoReview')}</span>
            </label>
          ) : null}

          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="typography-meta font-medium text-muted-foreground">{t('chat.modelControls.model')}</span>
            <ModelSelector
              providerId={execution.providerId}
              modelId={execution.modelId}
              className="max-w-[320px] justify-between"
              dropdownPortalToBody
              onChange={(providerId, modelId) => {
                setExecution((prev) => ({ ...prev, providerId, modelId, variant: '' }));
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="typography-meta font-medium text-muted-foreground">{t('sessions.scheduledTasks.editor.thinkingLevel.label')}</span>
            <ThinkingPill
              value={execution.variant}
              options={variantOptions}
              disabled={!hasVariantOptions || submitting}
              onChange={(variant) => setExecution((prev) => ({ ...prev, variant }))}
            />
          </div>

        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('diffView.reviewDialog.actions.cancel')}
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!canConfirm || submitting}>
            {submitting ? t('diffView.reviewDialog.actions.starting') : t('diffView.reviewDialog.actions.start')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Memoized: the composer re-renders on every keystroke, and nothing here depends on the draft text. */
export const ReviewFlowDialog = React.memo(ReviewFlowDialogView);
