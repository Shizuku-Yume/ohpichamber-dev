# 58: Restore original interactive form, approval, and question UI

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** e848504602333955b1d134bba3345d8bbc2ed065

**Delivers:** Restores the original themed approval and question card UI (`FormCard`, `FormDock`, `PermissionDock`, `PermissionCard`) from pre-M1 baseline (`bfa8edacb9b0096aabf40b12886794ce62df8ddb`) on top of canonical interactive request contracts (`e848504602333955b1d134bba3345d8bbc2ed065`). Renders native `omp.ask` questions with typed choices and text inputs, supports native permission CAS revisions, preserves keyboard IME/navigation and accessibility, and avoids OpenCode FormField shims or raw JSON fallback textareas.

**Blocked by:** 65, 67
**Files:** `packages/ui/src/components/chat/FormCard.tsx`, `packages/ui/src/components/chat/FormDock.tsx`, `packages/ui/src/components/chat/PermissionDock.tsx`, `packages/ui/src/components/chat/PermissionCard.tsx`, `packages/ui/src/components/chat/FormFieldControl.tsx`, related interaction hooks and tests
**Read first:** Visual reference at `bfa8edacb9b0096aabf40b12886794ce62df8ddb` (`packages/ui/src/components/chat/FormCard.tsx`, `FormDock.tsx`, `PermissionDock.tsx`); native interaction contracts in `packages/agent-contract/src/requests.ts` and `packages/agent-service/src/interaction/manager.ts`; `.workflow/specs/omp-through-m3.md` W4, W7, W10
**Covers:** W4, W7, W10

**Check:** Focused behavioral tests in `packages/ui`, strict UI type-check (`bun run --cwd packages/ui type-check`), single parent UI build (`bun run --cwd packages/ui build`), and actual Web and Electron interactive verification of permission approvals, question choice selection, text input submit, CAS rejection recovery, keyboard navigation, and IME composition; no source/copy/wiring tests.

 - [x] Restore original themed approval cards (`PermissionDock`, `PermissionCard`) with tool call summary, justification, parameter preview, and allow/deny/session-allow actions.
 - [x] Restore question interaction UI (`FormDock`, `FormCard`) with native typed inputs for single/multi-choice selections and freeform text answers.
 - [x] Bind choices and custom input to the actual native `omp.ask` schema and answer shape validated by `InteractionManager.validateAnswer`, without a raw JSON textarea or legacy form adapter.
 - [x] Preserve request `version`, `epoch` and `workerGeneration` CAS, pending-state recovery and failure visibility; do not hide a failed submission.
 - [x] Preserve keyboard shortcuts, tab focus management, accessibility attributes, and full CJK IME composition handling on question input controls.

## Background & UI Restoration Scope

The current user explicitly prioritizes restoring the original OpenChamber UI appearance and interaction behavior, with no redesign. Investigation identified commit `bfa8edacb9b0096aabf40b12886794ce62df8ddb` as the assembled pre-M1 baseline visually inherited upstream. The current integration worktree (`e848504602333955b1d134bba3345d8bbc2ed065`) retains the authoritative native Canonical contracts.

This task restores interactive question and permission approval surfaces:
- **Native Question Presentation (`omp.ask`):** Uses the exact native schema (`type: 'omp.ask'`) with structured question items containing options and multi-select flags. Renders interactive choice chips/buttons and text inputs rather than generic JSON schemas or plain textareas. Answers are formatted and validated against `validateAnswer` in the native interaction manager.
- **Permission Cards & Docks:** Restores the styled floating dock (`PermissionDock`) and embedded cards (`PermissionCard`) presenting the tool name, target paths/commands, justification reasons, and decisive action triggers (Allow Once, Always Allow in Session, Deny).
- **CAS and stale protection:** Submit the exact request `version`, `epoch` and `workerGeneration`; concurrent resolution or restart must not execute an obsolete response.
- **Keyboard & IME Ergonomics:** Ensures Enter submits valid single-line inputs without breaking multi-line textareas, prevents accidental submission during active IME composition, and maintains focus flow.

## Progress

The original question and approval presentation is integrated against native interaction records. Host authorization in `worker-operation-authorizer.js` admits exact native `omp.ask` operations after scope, containment, profile, preset, and policy checks. Earlier evidence: focused question regression 12/12, Host 18/18, Web tsc/syntax/oxlint clean, and a live Web question answered through the dock with its history tool result.

**Verification base:** `4d99b9827` (Web dist index SHA-256 `ce94191a…`). Integration advanced to `0c7efa29b` before landing; the two later commits (tool output dialog, fork approval policy) do not modify the Task58 interaction files. Receipt: `.workflow/omp-migration/m3/task58-web-electron-2026-10-21.json`; scenario JSON and screenshots: `/home/shizuku/.cache/ohpi-acceptance/evidence-task58/`.

**Checks (2026-10-21):**
- `bun test src/components/chat/questionRequest.test.ts src/components/chat/PermissionCard.test.ts src/components/chat/FormMarkdown.test.tsx src/components/chat/formTextareaSizing.test.ts` -> 20 pass, 0 fail, 44 expect() calls. Added the missing `formTextareaSizing.test.ts` covering min clamp, growth, ten-line cap, and no-op measurement.
- `bun run --cwd packages/ui type-check` -> pass. `bun run --cwd packages/ui build` -> pass.
- `bun test src/lib/i18n/messages.test.ts` -> 6 pass, 536 expect() calls. UI text/style review found no hardcoded copy; 31 literal and 9 dynamic keys resolve in English and all dictionaries.
- Security pass: no blocking findings. The UI renders sanitized `ApprovalRequest` details/option labels as text, parses `omp.ask` with zod, reads CAS identity from the authoritative pending record before reply, and leaves authorization in the Host authorizer. Nonblocking: Escape neither dismisses nor cancels (baseline parity), and Tab focus leaves the dock after the footer actions.

**Live Web (isolated HOME/data/chats, managed-chats workspace, loopback fixture model, no external providers):**
- **Allow:** dock showed role=dialog, tool `bash`, justification, summary, exact command preview and Deny/Always allow/Allow once. Clicking Allow once settled idle; `tool_result bash` was `TASK58_ALLOWED`; the marker file matched.
- **Deny:** Deny settled idle with `tool_result bash` `isError: true` "Native command approval was rejected"; the marker file stayed absent (command not executed).
- **Session allow:** Always allow executed the first `TASK58_SESSION` command; an identical second run completed with zero observed pending approvals and recreated the marker.
- **Keyboard approval:** Alt+Enter allowed a pending bash approval and created the marker.
- **Question:** the two-question dock rendered `role=radiogroup` "Panel style" with radios, recommended marker, progress, and a freeform step whose textarea auto-focused. Selecting "Original panel", Next, typing `自由入力の回答` and pressing Enter answered the request; the ask result carried `selectedOptions: ["Original panel"]` and `customInput: "自由入力の回答"` and the dock dismissed.
- **Escape/focus:** Escape left the request pending without submitting or clearing input; Tab moved through the radios, Other, Dismiss, Next, then out of the dock (no trap; baseline parity). Dialog/radiogroup/radio ARIA attributes were present.
- **IME:** CDP-simulated composition (`Input.imeSetComposition` "にほんご") produced a keydown with `isComposing: true`, `keyCode: 13`; Enter during composition left the pending count at 1 and did not submit. Committing "にほんご入力" and pressing Enter submitted it unchanged. This is a simulated composition, not a system IME.
- **CAS stale rejection:** pausing the UI reply after it read version 1, resolving a competing direct reply (200), then releasing the UI reply produced `409 QUESTION_CONFLICT` and a visible toast "Failed to send response / Try again."; recovery cleared the dock within 600 ms, a second old-version reply also returned 409, and only the accepted `Alpha` selection reached the tool result. One earlier run left the stale dock until reload; not reproduced in two reruns (recorded as a nonblocking limitation).
- **Restart expiry:** restarting the Host with a pending approval produced snapshot 0 pending; the old reply returned `410 APPROVAL_EXPIRED` and the denied command's marker stayed absent.

**Electron (dev Electron 43.7.0 at `4d99b9827`, isolated Host, current source; not packaged):** the two-question dock rendered, Original panel + "Electron freeform answer" submitted to the ask tool result, and the approval dock's Allow once executed bash with `TASK58_ALLOWED`. Packaged Electron was not rebuilt; earlier packaged screenshots are stale and are not claimed current.

**Review:** flow-verify Brief A/B were not run because no reviewer worker was running and the user directed no new review-agent waits; the owner performed the quality and security passes above. All five task rows are evidence-backed.

**Finished:** 2026-10-21T02:10:00.000Z
