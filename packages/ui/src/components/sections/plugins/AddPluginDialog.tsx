import React from 'react';
import { LocalExtensionIdSchema } from '@openchamber/agent-contract';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui';
import { Icon } from '@/components/icon/Icon';
import { SortableTabsStrip, type SortableTabsStripItem } from '@/components/ui/sortable-tabs-strip';
import { SettingsStackedField } from '@/components/sections/shared/SettingsSection';
import { useI18n } from '@/lib/i18n';
import { CanonicalApiError } from '@/api/canonicalClient';
import { usePluginsStore } from '@/stores/usePluginsStore';

type TabKey = 'package' | 'local';

interface AddPluginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AddPluginDialog: React.FC<AddPluginDialogProps> = ({ open, onOpenChange }) => {
  const { t } = useI18n();
  const [tab, setTab] = React.useState<TabKey>('package');
  const [spec, setSpec] = React.useState('');
  const [fileName, setFileName] = React.useState('');
  const [content, setContent] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const resetForm = React.useCallback(() => {
    setSpec('');
    setFileName('');
    setContent('');
    setError(null);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setTab('package');
    resetForm();
  }, [open, resetForm]);

  const handleTabChange = (next: TabKey) => {
    if (next === tab) return;
    setTab(next);
    resetForm();
  };

  const trimmedFileName = fileName.trim();
  const fileNameInvalid = tab === 'local' && trimmedFileName !== '' && !LocalExtensionIdSchema.safeParse(trimmedFileName).success;
  const specEmpty = tab === 'package' && spec.trim() === '';
  const contentEmpty = tab === 'local' && content.trim() === '';

  const submitDisabled =
    submitting
    || (tab === 'package' && specEmpty)
    || (tab === 'local' && (trimmedFileName === '' || fileNameInvalid || contentEmpty));

  const handleSubmit = async () => {
    if (submitDisabled) return;
    setSubmitting(true);
    setError(null);
    try {
      const store = usePluginsStore.getState();
      if (tab === 'package') await store.installPlugin({ kind: 'package', spec: spec.trim() });
      else await store.writeLocalExtension(trimmedFileName, content);
      toast.success(t('settings.plugins.toast.created'));
      onOpenChange(false);
    } catch (failure) {
      const message = failure instanceof CanonicalApiError ? failure.message : t('settings.plugins.error.operation');
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const tabs = React.useMemo<SortableTabsStripItem[]>(() => [
    { id: 'package', label: t('settings.plugins.sidebar.kind.package') },
    { id: 'local', label: t('settings.plugins.local.title') },
  ], [t]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && submitting) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('settings.plugins.dialog.add.title')}</DialogTitle>
          <DialogDescription>{t('settings.plugins.grid.description')}</DialogDescription>
        </DialogHeader>

        <SortableTabsStrip
          items={tabs}
          activeId={tab}
          onSelect={(id) => {
            if (id === 'package' || id === 'local') handleTabChange(id);
          }}
          layoutMode="fit"
          variant="active-pill"
          activePillLowercase={false}
          className="h-10"
        />

        <div className="flex flex-col gap-4">
          {tab === 'package' ? (
            <SettingsStackedField
              settingsItem="plugins.spec"
              label={t('settings.plugins.page.field.spec')}
              controlClassName="w-full max-w-none"
              description={specEmpty ? t('settings.plugins.validation.specRequired') : t('settings.plugins.scope.global')}
              descriptionPlacement="after"
            >
              <Input
                id="plugin-spec"
                value={spec}
                onChange={(event) => setSpec(event.target.value)}
                placeholder={t('settings.plugins.page.field.spec.placeholder')}
                aria-label={t('settings.plugins.page.field.spec')}
                disabled={submitting}
              />
            </SettingsStackedField>
          ) : (
            <>
              <SettingsStackedField
                settingsItem="plugins.fileName"
                label={t('settings.plugins.page.field.fileName')}
                controlClassName="w-full max-w-none"
                description={fileNameInvalid ? (
                  t('settings.plugins.validation.fileNameNative')
                ) : (
                  <span className="font-mono">.omp/extensions/{trimmedFileName}</span>
                )}
                descriptionPlacement="after"
              >
                <Input
                  id="plugin-filename"
                  value={fileName}
                  onChange={(event) => setFileName(event.target.value)}
                  placeholder="my-extension.ts"
                  aria-label={t('settings.plugins.page.field.fileName')}
                  aria-invalid={fileNameInvalid || undefined}
                  disabled={submitting}
                />
              </SettingsStackedField>

              <SettingsStackedField
                settingsItem="plugins.content"
                label={t('settings.plugins.page.field.content')}
                controlClassName="w-full max-w-none"
              >
                <Textarea
                  id="plugin-content"
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  rows={16}
                  className="font-mono w-full"
                  aria-label={t('settings.plugins.page.field.content')}
                  disabled={submitting}
                />
              </SettingsStackedField>
            </>
          )}

          {error ? <p role="alert" className="typography-meta text-[var(--status-error)]">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('settings.plugins.dialog.add.action.cancel')}
          </Button>
          <Button size="sm" onClick={() => void handleSubmit()} disabled={submitDisabled}>
            {submitting ? <Icon name="loader-4" className="h-3.5 w-3.5 animate-spin" /> : null}
            {t('settings.plugins.dialog.add.action.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
