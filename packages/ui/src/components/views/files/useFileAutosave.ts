import * as React from 'react';

const DELAY_MS = 1500;

export function useFileAutosave({
  eligible, scope, draft, baseline, canvasDirty, isPaused, isPauseRequested, save,
}: {
  eligible: boolean;
  scope: string;
  draft: string;
  baseline: string;
  canvasDirty: boolean;
  isPaused: boolean;
  isPauseRequested: () => boolean;
  save: () => void;
}) {
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasEdit = React.useRef({ at: 0, version: 0 });
  const attempted = React.useRef<{
    scope: string;
    draft: string | null;
    baseline: string | null;
    canvasVersion: number | null;
  } | null>(null);
  const [canvasWake, wakeCanvas] = React.useReducer((n: number) => n + 1, 0);

  const cancel = React.useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const noteCanvasEdit = React.useCallback(() => {
    const version = canvasEdit.current.version;
    canvasEdit.current = { at: Date.now(), version: version + 1 };
    // Keep drawing off the render path except for the first edit after an attempt.
    if (attempted.current?.canvasVersion === version) wakeCanvas();
  }, []);

  React.useEffect(() => {
    const previousAttempt = attempted.current;
    if (previousAttempt && (previousAttempt.scope !== scope || (canvasDirty
      ? previousAttempt.canvasVersion === null
      : previousAttempt.draft !== draft || previousAttempt.baseline !== baseline))) {
      attempted.current = null;
    }
    if (!eligible || isPaused) return;
    const schedule = (delay: number) => {
      timer.current = setTimeout(() => {
        timer.current = null;
        if (isPauseRequested()) return;
        const quietFor = Date.now() - canvasEdit.current.at;
        if (canvasDirty && quietFor < DELAY_MS) {
          schedule(DELAY_MS - quietFor);
          return;
        }
        const next = {
          scope, draft: canvasDirty ? null : draft, baseline: canvasDirty ? null : baseline,
          canvasVersion: canvasDirty ? canvasEdit.current.version : null,
        };
        const previous = attempted.current;
        if (previous?.scope === next.scope && previous.draft === next.draft
          && previous.baseline === next.baseline && previous.canvasVersion === next.canvasVersion) return;
        attempted.current = next;
        save();
      }, delay);
    };
    schedule(DELAY_MS);
    return cancel;
  }, [baseline, cancel, canvasDirty, canvasWake, draft, eligible, isPauseRequested, isPaused, save, scope]);

  return { cancel, noteCanvasEdit };
}
