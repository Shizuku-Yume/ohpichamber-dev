export type FileTabSelectionGuard = (directoryKey: string, targetPath: string | null, select: () => void) => void;

export function guardFileTabSelection({
  sameDirectory,
  currentPath,
  targetPath,
  isDirty,
  confirm,
  select,
}: {
  sameDirectory: boolean;
  currentPath: string | null;
  targetPath: string | null;
  isDirty: boolean;
  confirm: (select: () => void) => void;
  select: () => void;
}): void {
  if (sameDirectory && isDirty && currentPath && targetPath && currentPath !== targetPath) {
    confirm(select);
  } else {
    select();
  }
}
