import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n';
import { Checkbox } from '@/components/ui/checkbox';

type ConfirmCheckbox = { label: string; defaultChecked?: boolean };
type ConfirmResponse = { confirmed: boolean; checkboxChecked: boolean };
type ConfirmRequest = {
  title: string;
  message: string;
  action: string;
  decline?: string;
  destructive?: boolean;
  checkbox?: ConfirmCheckbox;
};

export function useConfirmDialog({ layerClassName, backdropProps }: Pick<React.ComponentProps<typeof DialogContent>, 'layerClassName' | 'backdropProps'> = {}) {
  const { t } = useI18n();
  const [request, setRequest] = React.useState<ConfirmRequest | null>(null);
  const [checkboxChecked, setCheckboxChecked] = React.useState(false);
  const pending = React.useRef<((result: ConfirmResponse) => void) | null>(null);

  React.useEffect(() => () => {
    const resolve = pending.current;
    pending.current = null;
    resolve?.({ confirmed: false, checkboxChecked: false });
  }, []);

  const settle = React.useCallback((confirmed: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setRequest(null);
    resolve?.({ confirmed, checkboxChecked: confirmed && checkboxChecked });
  }, [checkboxChecked]);

  const requestConfirmation = React.useCallback((next: ConfirmRequest): Promise<ConfirmResponse> => {
    // A second question while one is open answers the first with "no" first.
    pending.current?.({ confirmed: false, checkboxChecked: false });
    setCheckboxChecked(next.checkbox?.defaultChecked ?? false);
    return new Promise<ConfirmResponse>((resolve) => {
      pending.current = resolve;
      setRequest(next);
    });
  }, []);

  const confirm = React.useCallback((next: ConfirmRequest): Promise<boolean> => (
    requestConfirmation(next).then((result) => result.confirmed)
  ), [requestConfirmation]);

  const confirmWithCheckbox = React.useCallback((next: ConfirmRequest & { checkbox: ConfirmCheckbox }): Promise<ConfirmResponse> => (
    requestConfirmation(next)
  ), [requestConfirmation]);

  const dialog = (
    <Dialog open={request !== null} onOpenChange={(open) => { if (!open) settle(false); }}>
      <DialogContent className="max-w-md" layerClassName={layerClassName} backdropProps={backdropProps}>
        <DialogHeader>
          <DialogTitle>{request?.title}</DialogTitle>
          <DialogDescription className="whitespace-pre-line">{request?.message}</DialogDescription>
        </DialogHeader>
        {request?.checkbox && (
          <div className="flex items-center gap-2">
            <Checkbox checked={checkboxChecked} onChange={setCheckboxChecked} ariaLabel={request.checkbox.label} />
            <span className="text-sm text-muted-foreground">{request.checkbox.label}</span>
          </div>
        )}
        <DialogFooter>
          <Button size="sm" variant="outline" autoFocus onClick={() => settle(false)}>{request?.decline ?? t('dialog.common.actions.cancel')}</Button>
          <Button size="sm" variant={request?.destructive ? 'destructive' : 'default'} onClick={() => settle(true)}>{request?.action}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirm, confirmWithCheckbox, dialog };
}
