import React from 'react';
import { LocalExtensionIdSchema } from '@openchamber/agent-contract';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/i18n';
import { CanonicalApiError } from '@/api/canonicalClient';
import { usePluginsStore } from '@/stores/usePluginsStore';

export const AddPluginDialog: React.FC<{ open: boolean; onOpenChange: (open: boolean) => void }> = ({ open, onOpenChange }) => {
  const { t } = useI18n();
  const [mode, setMode] = React.useState<'package' | 'local'>('package');
  const [spec, setSpec] = React.useState('');
  const [fileName, setFileName] = React.useState('');
  const [content, setContent] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!open) return;
    setMode('package'); setSpec(''); setFileName(''); setContent(''); setError(null);
  }, [open]);
  const validFileName = LocalExtensionIdSchema.safeParse(fileName).success;
  const submit = async () => {
    setSubmitting(true); setError(null);
    try {
      const store = usePluginsStore.getState();
      if (mode === 'package') await store.installPlugin({ kind: 'package', spec: spec.trim() });
      else await store.writeLocalExtension(fileName, content);
      onOpenChange(false);
    } catch (failure) {
      setError(failure instanceof CanonicalApiError ? failure.message : t('settings.plugins.error.operation'));
    } finally { setSubmitting(false); }
  };
  return (
    <Dialog open={open} onOpenChange={next => { if (!submitting) onOpenChange(next); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('settings.plugins.dialog.add.title')}</DialogTitle>
          <DialogDescription>{t('settings.plugins.grid.description')}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Button variant={mode === 'package' ? 'secondary' : 'ghost'} disabled={submitting} onClick={() => setMode('package')}>
            {t('settings.plugins.sidebar.kind.package')}
          </Button>
          <Button variant={mode === 'local' ? 'secondary' : 'ghost'} disabled={submitting} onClick={() => setMode('local')}>
            {t('settings.plugins.local.title')}
          </Button>
        </div>
        {mode === 'package' ? (
          <div className="space-y-2">
            <label htmlFor="native-plugin-spec">{t('settings.plugins.page.field.spec')}</label>
            <Input id="native-plugin-spec" value={spec} onChange={event => setSpec(event.target.value)} disabled={submitting} />
            <p className="typography-meta text-muted-foreground">{t('settings.plugins.scope.global')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <label htmlFor="native-extension-filename">{t('settings.plugins.page.field.fileName')}</label>
            <Input id="native-extension-filename" value={fileName} onChange={event => setFileName(event.target.value)} disabled={submitting} aria-invalid={fileName !== '' && !validFileName} />
            {fileName !== '' && !validFileName ? <p role="alert" className="typography-meta text-[var(--status-error)]">{t('settings.plugins.validation.fileNameNative')}</p> : null}
            <p className="font-mono typography-meta text-muted-foreground">.omp/extensions/{fileName}</p>
            <label htmlFor="native-extension-content">{t('settings.plugins.page.field.content')}</label>
            <Textarea id="native-extension-content" value={content} onChange={event => setContent(event.target.value)} rows={14} className="font-mono" disabled={submitting} />
          </div>
        )}
        {error ? <p role="alert" className="text-[var(--status-error)]">{error}</p> : null}
        <DialogFooter>
          <Button variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>{t('settings.common.actions.cancel')}</Button>
          <Button disabled={submitting || (mode === 'package' ? !spec.trim() : !validFileName)} onClick={() => void submit()}>
            {mode === 'package' ? t('settings.plugins.action.install') : t('settings.plugins.dialog.add.action.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
