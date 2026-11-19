import * as React from 'react';

export function useFileDraftConfirmation({
  scope,
  path,
  isDirty,
  isSaving,
  saveDraft,
  discardDraft,
}: {
  scope: string;
  path: string | null;
  isDirty: boolean;
  isSaving: boolean;
  saveDraft: () => Promise<boolean>;
  discardDraft: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const pending = React.useRef<(() => void) | null>(null);

  const clear = React.useCallback(() => {
    pending.current = null;
    setOpen(false);
  }, []);

  React.useLayoutEffect(() => {
    if (pending.current) clear();
  }, [clear, path, scope]);

  const confirm = React.useCallback((action: () => void) => {
    if (pending.current) return;
    pending.current = action;
    setOpen(true);
  }, []);

  const isPending = React.useCallback(() => pending.current !== null, []);

  const cancel = React.useCallback(() => {
    if (isSaving) return false;
    clear();
    return true;
  }, [clear, isSaving]);

  const discard = React.useCallback(() => {
    const action = pending.current;
    if (!action || isSaving) return;
    clear();
    discardDraft();
    action();
  }, [clear, discardDraft, isSaving]);

  const save = React.useCallback(async () => {
    if (pending.current && !isSaving) await saveDraft();
  }, [isSaving, saveDraft]);

  // A write already in flight when the prompt opened can also resolve it.
  // If more edits arrive during either write, the remaining draft stays open.
  React.useEffect(() => {
    const action = pending.current;
    if (!open || !action || isSaving || isDirty) return;
    clear();
    action();
  }, [clear, isDirty, isSaving, open]);

  return { open, confirm, isPending, cancel, discard, save };
}
