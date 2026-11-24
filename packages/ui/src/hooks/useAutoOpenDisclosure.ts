import { useState } from 'react';

export function useAutoOpenDisclosure(autoOpen: boolean, signal: number): [boolean, () => void] {
  const [open, setOpen] = useState(autoOpen);
  const [synced, setSynced] = useState({ autoOpen, signal });
  if (synced.autoOpen !== autoOpen || synced.signal !== signal) {
    setSynced({ autoOpen, signal });
    if (autoOpen) setOpen(true);
  }
  return [open, () => setOpen((current) => !current)];
}
