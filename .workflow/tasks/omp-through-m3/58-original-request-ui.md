# 58: Restore original interactive form, approval, and question UI

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** e848504602333955b1d134bba3345d8bbc2ed065

**Delivers:** Restores the original themed approval and question card UI (`FormCard`, `FormDock`, `PermissionDock`, `PermissionCard`) from pre-M1 baseline (`bfa8edacb9b0096aabf40b12886794ce62df8ddb`) on top of canonical interactive request contracts (`e848504602333955b1d134bba3345d8bbc2ed065`). Renders native `omp.ask` questions with typed choices and text inputs, supports native permission CAS revisions, preserves keyboard IME/navigation and accessibility, and avoids OpenCode FormField shims or raw JSON fallback textareas.

**Blocked by:** None
**Files:** `packages/ui/src/components/chat/FormCard.tsx`, `packages/ui/src/components/chat/FormDock.tsx`, `packages/ui/src/components/chat/PermissionDock.tsx`, `packages/ui/src/components/chat/PermissionCard.tsx`, `packages/ui/src/components/chat/FormFieldControl.tsx`, related interaction hooks and tests
**Read first:** Visual reference at `bfa8edacb9b0096aabf40b12886794ce62df8ddb` (`packages/ui/src/components/chat/FormCard.tsx`, `FormDock.tsx`, `PermissionDock.tsx`); native interaction contracts in `packages/agent-contract/src/requests.ts` and `packages/agent-service/src/interaction/manager.ts`; `.workflow/specs/omp-through-m3.md` W4, W7, W10
**Covers:** W4, W7, W10

**Check:** Focused behavioral tests in `packages/ui`, strict UI type-check (`bun run --cwd packages/ui type-check`), single parent UI build (`bun run --cwd packages/ui build`), and actual Web and Electron interactive verification of permission approvals, question choice selection, text input submit, CAS rejection recovery, keyboard navigation, and IME composition; no source/copy/wiring tests.

 - [ ] Restore original themed approval cards (`PermissionDock`, `PermissionCard`) with tool call summary, justification, parameter preview, and allow/deny/session-allow actions.
 - [ ] Restore question interaction UI (`FormDock`, `FormCard`) with native typed inputs for single/multi-choice selections and freeform text answers.
 - [ ] Bind choices and custom input to the actual native `omp.ask` schema and answer shape validated by `InteractionManager.validateAnswer`, without a raw JSON textarea or legacy form adapter.
 - [ ] Preserve request `version`, `epoch` and `workerGeneration` CAS, pending-state recovery and failure visibility; do not hide a failed submission.
 - [ ] Preserve keyboard shortcuts, tab focus management, accessibility attributes, and full CJK IME composition handling on question input controls.

## Background & UI Restoration Scope

The current user explicitly prioritizes restoring the original OpenChamber UI appearance and interaction behavior, with no redesign. Investigation identified commit `bfa8edacb9b0096aabf40b12886794ce62df8ddb` as the assembled pre-M1 baseline visually inherited upstream. The current integration worktree (`e848504602333955b1d134bba3345d8bbc2ed065`) retains the authoritative native Canonical contracts.

This task restores interactive question and permission approval surfaces:
- **Native Question Presentation (`omp.ask`):** Uses the exact native schema (`type: 'omp.ask'`) with structured question items containing options and multi-select flags. Renders interactive choice chips/buttons and text inputs rather than generic JSON schemas or plain textareas. Answers are formatted and validated against `validateAnswer` in the native interaction manager.
- **Permission Cards & Docks:** Restores the styled floating dock (`PermissionDock`) and embedded cards (`PermissionCard`) presenting the tool name, target paths/commands, justification reasons, and decisive action triggers (Allow Once, Always Allow in Session, Deny).
- **CAS and stale protection:** Submit the exact request `version`, `epoch` and `workerGeneration`; concurrent resolution or restart must not execute an obsolete response.
- **Keyboard & IME Ergonomics:** Ensures Enter submits valid single-line inputs without breaking multi-line textareas, prevents accidental submission during active IME composition, and maintains focus flow.
