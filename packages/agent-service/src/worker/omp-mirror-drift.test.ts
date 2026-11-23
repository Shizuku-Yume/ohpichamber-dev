import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { ACP_BUILTIN_SLASH_COMMANDS } from '@oh-my-pi/pi-coding-agent/slash-commands/acp-builtins';
import { BUILTIN_SLASH_COMMANDS_INTERNAL } from '@oh-my-pi/pi-coding-agent/slash-commands/builtin-registry';
import { ALLOWED_BUILTIN_COMMANDS, isReadOnlyBuiltinCommand } from './builtin-commands.ts';

interface OmpBuiltinCommandEntry {
  name: string;
  hasHandle: boolean;
}

const CommandsFixtureSchema = z.object({
  builtinCommands: z.array(
    z.object({
      name: z.string(),
      hasHandle: z.boolean(),
    }),
  ),
});

/**
 * Commands in `ALLOWED_BUILTIN_COMMANDS` implemented directly by `WorkerSession`
 * (`session.ts` `case 'command':`) rather than falling through to OMP's
 * `executeAcpBuiltinSlashCommand` headless dispatcher.
 */
const CUSTOM_HANDLED_BUILTIN_COMMANDS = [
  'loop',
  'omfg',
  'cleanse',
  'tan',
  'advisor',
  'clear',
] as const;

/**
 * Exhaustive exclusion ledger for every command shipped in OMP's
 * `BUILTIN_SLASH_COMMANDS_INTERNAL` that is NOT in `ALLOWED_BUILTIN_COMMANDS`.
 * An OMP upgrade adding or removing a command fails `omp-mirror-drift.test.ts`
 * unless the command is explicitly allowed or categorized here.
 */
const EXCLUDED_BUILTIN_COMMANDS = {
  commit: 'Selective commit eval namespace mutates Git outside the Host Git capability; not exposed through generic slash dispatch',
  security: 'OMP security scan slash workflow is not yet exposed via Canonical API',
  settings: 'TUI-only (handleTui); OpenChamber exposes Settings via dedicated Web/Desktop Settings UI',
  setup: 'TUI-only (handleTui); OpenChamber manages provider setup via dedicated Provider Settings UI',
  plan: 'TUI-only (handleTui); plan mode uses Canonical API session.mode.set and Plan UI control',
  'plan-review': 'TUI-only (handleTui); plan review/approval uses Canonical API plan approval flow',
  vibe: 'TUI-only (handleTui); vibe mode uses Canonical API session.mode.set and Vibe UI control',
  goal: 'TUI-only (handleTui); goal mode uses Canonical API session.goal.* controls',
  'guided-goal': 'TUI-only (handleTui); interactive TUI goal interview has no headless chat equivalent',
  queue: 'TUI-only (handleTui); steer and follow-up queuing use Canonical API queue operations',
  skillful: 'Session-local system-prompt skill listing toggle; OpenChamber manages skills via Catalog API',
  'extended-context': 'Excluded from generic slash dispatch; model capability settings live in Model/Role config',
  computer: 'Native computer-use eval prelude toggle is excluded from headless chat command dispatch',
  ratchet: 'Unattended LLM-flow hillclimbing eval command is excluded from standard chat dispatch',
  modelpreset: 'Preset management is replaced by OpenChamber role/model Settings UI',
  export: 'HTML session export is handled at the OpenChamber Host/UI layer rather than worker slash dispatch',
  trace: 'Opens local TUI stats trace dashboard; not applicable in headless WorkerSession',
  dump: 'Writes transcript to host clipboard and /tmp JSON; unsafe/TUI-oriented in remote host architecture',
  share: 'External share link / secret gist egress is governed by OpenChamber enterprise/egress policy',
  collab: 'TUI-only (handleTui); live relay collaboration UI is not supported in headless WorkerSession',
  join: 'TUI-only (handleTui); live relay collaboration join is not supported in headless WorkerSession',
  leave: 'TUI-only (handleTui); live relay collaboration leave is not supported in headless WorkerSession',
  browser: 'Browser eval-prelude headless/visible toggle is excluded from headless chat command dispatch',
  copy: 'TUI-only (handleTui); interactive TUI conversation picker for local clipboard',
  open: 'TUI-only (handleTui); opens URL in agent host local desktop browser',
  stats: 'Launches interactive TUI stats dashboard; OpenChamber exposes usage stats via Canonical API',
  changelog: 'Displays OMP CLI changelog text; OpenChamber renders its own product changelog UI',
  hotkeys: 'TUI-only (handleTui); terminal keybinding sheet is inapplicable to Web/Desktop UI',
  extensions: 'TUI-only (handleTui); Extension Control Center is replaced by OpenChamber UI',
  agents: 'TUI-only (handleTui); Agents Hub is replaced by OpenChamber Agents Settings UI',
  git: 'TUI-only (handleTui); OpenChamber has dedicated Host Git UI and APIs',
  local: 'TUI-only (handleTui); opens local:// file in $EDITOR on host TTY',
  hub: 'TUI-only (handleTui); Agent Hub is replaced by OpenChamber subagent/session UI',
  branch: 'TUI-only (handleTui); session branching uses dedicated Canonical API and UI',
  fork: 'TUI-only (handleTui); session forking and pane splitting use dedicated Canonical API and UI',
  tree: 'TUI-only (handleTui); interactive session tree navigator is replaced by OpenChamber session tree UI',
  login: 'TUI-only (handleTui); OAuth login uses dedicated Provider Auth Canonical API and UI',
  logout: 'TUI-only (handleTui); OAuth logout uses dedicated Provider Auth Canonical API and UI',
  mcp: 'Excluded from generic slash dispatch; OpenChamber manages MCP servers via Canonical API (mcp.*)',
  ssh: 'Excluded from generic slash dispatch; remote SSH hosts are owned by the OpenChamber Host layer',
  new: 'TUI-only (handleTui); creating a new session uses Canonical API and UI',
  delete: 'TUI-only (handleTui); deleting a session uses Canonical API and UI',
  resume: 'TUI-only (handleTui); resuming a session uses Canonical API and UI',
  btw: 'TUI-only in OMP registry; projected separately in catalog-resources.ts and handled via Canonical API',
  debug: 'TUI-only (handleTui); interactive terminal debug tools selector',
  move: 'Mutates session directory; OpenChamber binds sessions to Host-owned workspace directories',
  wt: 'Creates and moves session into a git worktree; worktrees are owned by the OpenChamber Host layer',
  'add-dir': 'Mutates multi-root workspace directories; workspace roots are owned by the OpenChamber Host layer',
  'remove-dir': 'Mutates multi-root workspace directories; workspace roots are owned by the OpenChamber Host layer',
  exit: 'TUI-only (handleTui); terminal process exit is inapplicable to persistent Agent Service worker',
  restart: 'TUI-only (handleTui); terminal process restart is inapplicable to persistent Agent Service worker',
  marketplace: 'Excluded from generic slash dispatch; plugins/marketplace are managed via Catalog API and UI',
  plugins: 'Excluded from generic slash dispatch; plugins are managed via Catalog API and UI',
  'reload-plugins': 'Excluded from generic slash dispatch; plugin reload is triggered via Catalog API',
  skills: 'TUI-only (handleTui); skills registry management uses Catalog API and Skills UI',
  live: 'TUI-only (handleTui); realtime voice mode requires terminal/audio device flow',
  record: 'TUI-only (handleTui); terminal screen recording (omp play) is inapplicable to Web/Desktop UI',
  pause: 'TUI-only (handleTui); interactive agent freeze toggle is not exposed in WorkerSession',
  'forget-approvals': 'Excluded from generic slash dispatch; approval state is governed by Host authorization',
  quit: 'TUI-only (handleTui); terminal process quit is inapplicable to persistent Agent Service worker',
} as const satisfies Record<string, string>;

const WORKER_DIR = dirname(fileURLToPath(import.meta.url));

function loadOmpBuiltinCommands(): OmpBuiltinCommandEntry[] {
  const fixturePath = process.env.OMP_DRIFT_COMMANDS_FIXTURE;
  if (fixturePath) {
    const parsed = CommandsFixtureSchema.parse(JSON.parse(readFileSync(fixturePath, 'utf8')));
    return parsed.builtinCommands;
  }
  return BUILTIN_SLASH_COMMANDS_INTERNAL.map(command => ({
    name: command.name,
    hasHandle: command.handle !== undefined,
  }));
}

function validateCommandDrift(ompCommands: ReadonlyArray<OmpBuiltinCommandEntry>): string[] {
  const errors: string[] = [];
  const ompByName = new Map<string, OmpBuiltinCommandEntry>();
  for (const entry of ompCommands) {
    if (ompByName.has(entry.name)) {
      errors.push(`Duplicate OMP builtin command entry: ${entry.name}`);
    }
    ompByName.set(entry.name, entry);
  }

  const allowedSet = new Set<string>(ALLOWED_BUILTIN_COMMANDS);
  const customHandledSet = new Set<string>(CUSTOM_HANDLED_BUILTIN_COMMANDS);

  for (const allowed of ALLOWED_BUILTIN_COMMANDS) {
    const ompEntry = ompByName.get(allowed);
    if (!ompEntry) {
      errors.push(`Allowed builtin command "${allowed}" no longer exists in OMP BUILTIN_SLASH_COMMANDS_INTERNAL`);
      continue;
    }
    if (!ompEntry.hasHandle && !customHandledSet.has(allowed)) {
      errors.push(
        `Allowed builtin command "${allowed}" has no headless handle in OMP ACP_BUILTIN_SLASH_COMMANDS and no custom handler in WorkerSession`,
      );
    }
  }

  for (const [excluded, reason] of Object.entries(EXCLUDED_BUILTIN_COMMANDS)) {
    if (!ompByName.has(excluded)) {
      errors.push(`Excluded builtin command "${excluded}" is stale (missing from OMP BUILTIN_SLASH_COMMANDS_INTERNAL)`);
    }
    if (allowedSet.has(excluded)) {
      errors.push(`Builtin command "${excluded}" appears in both ALLOWED_BUILTIN_COMMANDS and EXCLUDED_BUILTIN_COMMANDS`);
    }
    if (reason.trim().length === 0) {
      errors.push(`Excluded builtin command "${excluded}" must provide a non-empty reason`);
    }
  }

  for (const entry of ompCommands) {
    if (!allowedSet.has(entry.name) && !Object.hasOwn(EXCLUDED_BUILTIN_COMMANDS, entry.name)) {
      errors.push(
        `Uncategorized OMP builtin command "${entry.name}" (hasHandle=${String(entry.hasHandle)}): add to ALLOWED_BUILTIN_COMMANDS or EXCLUDED_BUILTIN_COMMANDS with a reason`,
      );
    }
  }

  return errors;
}

/**
 * Extracts a method body `{ ... }` starting from a unique method header prefix,
 * skipping comments and string/template literals so nested braces inside literals
 * do not distort depth tracking.
 */
function extractMethodBody(source: string, signaturePrefix: string): string {
  const start = source.indexOf(signaturePrefix);
  if (start === -1) {
    throw new Error(`Could not locate method signature: ${signaturePrefix}`);
  }
  let cursor = start + signaturePrefix.length;
  let parenDepth = 1;
  while (cursor < source.length && parenDepth > 0) {
    const ch = source[cursor];
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') parenDepth -= 1;
    cursor += 1;
  }
  const bodyStart = source.indexOf('{', cursor);
  if (bodyStart === -1) {
    throw new Error(`Could not locate opening brace for: ${signaturePrefix}`);
  }
  let braceDepth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  const templateBraceDepths: number[] = [];

  for (let pos = bodyStart; pos < source.length; pos += 1) {
    const ch = source[pos];
    const next = source[pos + 1];
    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        pos += 1;
      }
      continue;
    }
    if (inSingle) {
      if (ch === '\\') {
        pos += 1;
        continue;
      }
      if (ch === '\'') inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '\\') {
        pos += 1;
        continue;
      }
      if (ch === '"') inDouble = false;
      continue;
    }
    if (inTemplate) {
      if (ch === '\\') {
        pos += 1;
        continue;
      }
      if (ch === '$' && next === '{') {
        templateBraceDepths.push(braceDepth);
        braceDepth += 1;
        inTemplate = false;
        pos += 1;
        continue;
      }
      if (ch === '`') inTemplate = false;
      continue;
    }
    if (ch === '/' && next === '/') {
      inLineComment = true;
      pos += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      pos += 1;
      continue;
    }
    if (ch === '\'') {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '`') {
      inTemplate = true;
      continue;
    }
    if (ch === '{') {
      braceDepth += 1;
    } else if (ch === '}') {
      braceDepth -= 1;
      const resumeDepth = templateBraceDepths[templateBraceDepths.length - 1];
      if (resumeDepth !== undefined && braceDepth === resumeDepth) {
        templateBraceDepths.pop();
        inTemplate = true;
        continue;
      }
      if (braceDepth === 0) {
        return source.slice(bodyStart, pos + 1);
      }
    }
  }
  throw new Error(`Unclosed method body for: ${signaturePrefix}`);
}

/** Strips line and block comments so commented-out calls never count as live steps. */
function stripComments(source: string): string {
  let out = '';
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let pos = 0; pos < source.length; pos += 1) {
    const ch = source[pos];
    const next = source[pos + 1];
    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        out += '\n';
      }
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        pos += 1;
      }
      continue;
    }
    if (inSingle) {
      out += ch;
      if (ch === '\\' && pos + 1 < source.length) {
        out += source[pos + 1];
        pos += 1;
        continue;
      }
      if (ch === '\'') inSingle = false;
      continue;
    }
    if (inDouble) {
      out += ch;
      if (ch === '\\' && pos + 1 < source.length) {
        out += source[pos + 1];
        pos += 1;
        continue;
      }
      if (ch === '"') inDouble = false;
      continue;
    }
    if (inTemplate) {
      out += ch;
      if (ch === '\\' && pos + 1 < source.length) {
        out += source[pos + 1];
        pos += 1;
        continue;
      }
      if (ch === '`') inTemplate = false;
      continue;
    }
    if (ch === '/' && next === '/') {
      inLineComment = true;
      pos += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      pos += 1;
      continue;
    }
    if (ch === '\'') inSingle = true;
    else if (ch === '"') inDouble = true;
    else if (ch === '`') inTemplate = true;
    out += ch;
  }
  return out;
}

/**
 * Extracts ordered `this.session.<method>` / `this.sessionManager.<method>` calls
 * (including `this.session.sessionManager.<method>` used by `WorkerModeController`)
 * preserving exact source order across both owners.
 */
function extractOrderedSessionCalls(methodBody: string): string[] {
  const clean = stripComments(methodBody);
  const calls: string[] = [];
  const pattern = /this\.(?:(sessionManager)|(session)(?:\.(sessionManager))?)\.([A-Za-z0-9_]+)(?:\?\.)?\(/g;
  for (const match of clean.matchAll(pattern)) {
    const owner = match[1] === 'sessionManager' || match[3] === 'sessionManager' ? 'sessionManager' : 'session';
    const method = match[4];
    if (method) calls.push(`${owner}.${method}`);
  }
  return calls;
}
const EXPECTED_OMP_PLAN_MODE_CALLS = {
  enterPlanMode: [
    'session.getEnabledToolNames',
    'session.getMountedToolCommandNames',
    'session.hasBuiltInTool',
    'session.getAllToolNames',
    'session.getPlanModeState',
    'session.setPlanModeState',
    'session.setActiveToolsByName',
    'session.setPlanModeState',
    'session.setPlanProposalHandler',
    'session.preparePlanForReview',
    'session.sendPlanModeContext',
    'sessionManager.appendModeChange',
  ],
  applyPlanModeModel: [
    'session.resolveRoleModelWithThinking',
    'session.configuredThinkingLevel',
  ],
  applyPlanModelTransition: [
    'session.setThinkingLevel',
    'session.setModelTemporary',
  ],
  exitPlanMode: [
    'session.runModeExitTeardown',
    'session.abort',
  ],
  tearDownPlanMode: [
    'session.getPlanModeState',
    'session.getEnabledToolNames',
    'session.getMountedToolCommandNames',
    'session.configuredThinkingLevel',
    'session.setPlanModeState',
    'session.restoreNonMCPToolPresentation',
    'session.setPlanModeState',
    'session.configuredThinkingLevel',
    'session.getEnabledToolNames',
    'session.getMountedToolCommandNames',
    'session.setActiveToolPresentation',
    'session.setPlanProposalHandler',
    'sessionManager.appendModeChange',
  ],
  restorePlanPreviousModel: [
    'session.setThinkingLevel',
    'session.setModelTemporary',
  ],
} as const;

function assertSubsequence(
  errors: string[],
  label: string,
  actual: ReadonlyArray<string>,
  requiredOrder: ReadonlyArray<string>,
): void {
  let searchFrom = 0;
  for (const expectedCall of requiredOrder) {
    const foundAt = actual.indexOf(expectedCall, searchFrom);
    if (foundAt === -1) {
      errors.push(
        `${label}: missing or out-of-order call "${expectedCall}" after index ${searchFrom} in [${actual.join(', ')}]`,
      );
      return;
    }
    searchFrom = foundAt + 1;
  }
}

function loadOmpInteractiveModeSource(): string {
  const fixturePath = process.env.OMP_DRIFT_INTERACTIVE_MODE_FIXTURE;
  if (fixturePath) {
    return readFileSync(fixturePath, 'utf8');
  }
  const interactiveModePath = Bun.resolveSync('@oh-my-pi/pi-coding-agent/modes/interactive-mode', WORKER_DIR);
  return readFileSync(interactiveModePath, 'utf8');
}

function validatePlanModeDrift(interactiveModeSource: string, workerModeSource: string): string[] {
  const errors: string[] = [];

  const ompEnterBody = extractMethodBody(interactiveModeSource, 'async #enterPlanMode(');
  const ompApplyModelBody = extractMethodBody(interactiveModeSource, 'async #applyPlanModeModel(');
  const ompApplyTransitionBody = extractMethodBody(interactiveModeSource, 'async #applyPlanModelTransition(');
  const ompExitBody = extractMethodBody(interactiveModeSource, 'async #exitPlanMode(');
  const ompTearDownBody = extractMethodBody(interactiveModeSource, 'async #tearDownPlanMode(');
  const ompRestoreModelBody = extractMethodBody(interactiveModeSource, 'async #restorePlanPreviousModel(');

  const ompActual = {
    enterPlanMode: extractOrderedSessionCalls(ompEnterBody),
    applyPlanModeModel: extractOrderedSessionCalls(ompApplyModelBody),
    applyPlanModelTransition: extractOrderedSessionCalls(ompApplyTransitionBody),
    exitPlanMode: extractOrderedSessionCalls(ompExitBody),
    tearDownPlanMode: extractOrderedSessionCalls(ompTearDownBody),
    restorePlanPreviousModel: extractOrderedSessionCalls(ompRestoreModelBody),
  };

  for (const [method, expectedCalls] of [
    ['enterPlanMode', EXPECTED_OMP_PLAN_MODE_CALLS.enterPlanMode],
    ['applyPlanModeModel', EXPECTED_OMP_PLAN_MODE_CALLS.applyPlanModeModel],
    ['applyPlanModelTransition', EXPECTED_OMP_PLAN_MODE_CALLS.applyPlanModelTransition],
    ['exitPlanMode', EXPECTED_OMP_PLAN_MODE_CALLS.exitPlanMode],
    ['tearDownPlanMode', EXPECTED_OMP_PLAN_MODE_CALLS.tearDownPlanMode],
    ['restorePlanPreviousModel', EXPECTED_OMP_PLAN_MODE_CALLS.restorePlanPreviousModel],
  ] as const) {
    const actualCalls = ompActual[method];
    const matchesExpected =
      actualCalls.length === expectedCalls.length &&
      actualCalls.every((value, index) => value === expectedCalls[index]);
    if (!matchesExpected) {
      errors.push(
        `OMP #${method} session call sequence drifted.\nExpected: [${expectedCalls.join(', ')}]\nActual:   [${actualCalls.join(', ')}]`,
      );
    }
  }

  // Verify OMP semantic invariants that WorkerModeController mirrors.
  const cleanOmpEnter = stripComments(ompEnterBody);
  const cleanOmpModel = stripComments(ompApplyModelBody);
  const cleanOmpTearDown = stripComments(ompTearDownBody);

  if (!/workflow:\s*options\?\.workflow\s*\?\?\s*["']parallel["']/.test(cleanOmpEnter)) {
    errors.push('OMP #enterPlanMode default workflow is no longer "parallel"');
  }
  if (!/hasBuiltInTool\(\s*["']write["']\s*\)/.test(cleanOmpEnter)) {
    errors.push('OMP #enterPlanMode no longer checks hasBuiltInTool("write")');
  }
  if (!/resolveRoleModelWithThinking\(\s*["']plan["']\s*\)/.test(cleanOmpModel)) {
    errors.push('OMP #applyPlanModeModel no longer resolves role "plan"');
  }
  if (!/isMCPToolName/.test(cleanOmpEnter)) {
    errors.push('OMP #enterPlanMode no longer filters MCP tools via isMCPToolName');
  }
  if (!/setPlanProposalHandler\?\.\([^)]*preparePlanForReview/.test(cleanOmpEnter)) {
    errors.push('OMP #enterPlanMode no longer wires setPlanProposalHandler to preparePlanForReview');
  }
  if (!/appendModeChange\(\s*["']plan["']/.test(cleanOmpEnter)) {
    errors.push('OMP #enterPlanMode no longer appends "plan" mode change');
  }
  if (!/setPlanModeState\(\s*undefined\s*\)/.test(cleanOmpTearDown)) {
    errors.push('OMP #tearDownPlanMode no longer clears plan mode state via setPlanModeState(undefined)');
  }

  // Verify WorkerModeController (mode.ts) mirrors the exact orchestration invariants.
  const workerConstructorStart = workerModeSource.indexOf('constructor(');
  const workerEnterStart = workerModeSource.indexOf('private async enterPlan(');
  const workerConstructorSection = workerConstructorStart !== -1 && workerEnterStart > workerConstructorStart
    ? workerModeSource.slice(workerConstructorStart, workerEnterStart)
    : '';
  const workerEnterBody = extractMethodBody(workerModeSource, 'private async enterPlan(');
  const workerExitBody = extractMethodBody(workerModeSource, 'private async exitPlan(');
  const workerApproveBody = extractMethodBody(workerModeSource, 'async approve(');
  const workerRestoreBody = extractMethodBody(workerModeSource, 'async restore(');

  const workerEnterCalls = extractOrderedSessionCalls(workerEnterBody);
  const workerExitCalls = extractOrderedSessionCalls(workerExitBody);
  const workerApproveCalls = extractOrderedSessionCalls(workerApproveBody);
  const workerRestoreCalls = extractOrderedSessionCalls(workerRestoreBody);

  assertSubsequence(errors, 'WorkerModeController.enterPlan', workerEnterCalls, [
    'session.getEnabledToolNames',
    'session.getMountedToolCommandNames',
    'session.getAllToolNames',
    'session.resolveRoleModelWithThinking',
    'session.getPlanModeState',
    'session.setPlanModeState',
    'session.hasBuiltInTool',
    'session.setActiveToolsByName',
    'session.setPlanProposalHandler',
    'session.setModelTemporary',
    'sessionManager.appendModeChange',
  ]);

  // Rollback catch path on enterPlan must restore plan state, proposal handler, tools, and model.
  const enterRollbackTail = workerEnterCalls.slice(workerEnterCalls.indexOf('sessionManager.appendModeChange') + 1);
  assertSubsequence(errors, 'WorkerModeController.enterPlan rollback', enterRollbackTail, [
    'session.setPlanModeState',
    'session.setPlanProposalHandler',
    'session.restoreNonMCPToolPresentation',
    'session.setModelTemporary',
  ]);

  assertSubsequence(errors, 'WorkerModeController.exitPlan', workerExitCalls, [
    'session.getPlanModeState',
    'session.getEnabledToolNames',
    'session.getMountedToolCommandNames',
    'session.setPlanModeState',
    'session.restoreNonMCPToolPresentation',
    'session.setModelTemporary',
    'sessionManager.appendModeChange',
    'session.setPlanProposalHandler',
  ]);

  assertSubsequence(errors, 'WorkerModeController.approve', workerApproveCalls, [
    'session.restoreNonMCPToolPresentation',
  ]);

  assertSubsequence(errors, 'WorkerModeController.restore', workerRestoreCalls, [
    'session.getEnabledToolNames',
    'session.setPlanModeState',
    'session.hasBuiltInTool',
    'session.setActiveToolsByName',
    'session.setPlanProposalHandler',
  ]);

  const cleanWorkerConstructor = stripComments(workerConstructorSection);
  const cleanWorkerEnter = stripComments(workerEnterBody);
  const cleanWorkerExit = stripComments(workerExitBody);
  const cleanWorkerApprove = stripComments(workerApproveBody);
  const cleanWorkerRestore = stripComments(workerRestoreBody);

  if (!/session\.preparePlanForReview\(/.test(cleanWorkerConstructor)) {
    errors.push('WorkerModeController constructor default proposal handler no longer calls session.preparePlanForReview');
  }
  if (!/resolveRoleModelWithThinking\(\s*['"]plan['"]\s*\)/.test(cleanWorkerEnter)) {
    errors.push('WorkerModeController.enterPlan no longer resolves role "plan"');
  }
  if (!/workflow:\s*['"]parallel['"]/.test(cleanWorkerEnter)) {
    errors.push('WorkerModeController.enterPlan no longer sets workflow: "parallel"');
  }
  if (!/hasBuiltInTool\(\s*['"]write['"]\s*\)/.test(cleanWorkerEnter)) {
    errors.push('WorkerModeController.enterPlan no longer checks hasBuiltInTool("write")');
  }
  if (!/isMCPToolName/.test(cleanWorkerEnter)) {
    errors.push('WorkerModeController.enterPlan no longer filters MCP tools via isMCPToolName');
  }
  if (!/appendModeChange\(\s*['"]plan['"]/.test(cleanWorkerEnter)) {
    errors.push('WorkerModeController.enterPlan no longer appends "plan" mode change');
  }
  if (!/setPlanModeState\(\s*undefined\s*\)/.test(cleanWorkerExit)) {
    errors.push('WorkerModeController.exitPlan no longer calls setPlanModeState(undefined)');
  }
  if (!/appendModeChange\(\s*['"]none['"]\s*\)/.test(cleanWorkerExit)) {
    errors.push('WorkerModeController.exitPlan no longer appends "none" mode change');
  }
  if (!/setPlanProposalHandler\(\s*null\s*\)/.test(cleanWorkerExit)) {
    errors.push('WorkerModeController.exitPlan no longer clears proposal handler with null');
  }
  if (!/this\.exitPlan\(\s*false\s*\)/.test(cleanWorkerApprove)) {
    errors.push('WorkerModeController.approve no longer defers tool restoration via exitPlan(false)');
  }
  if (!/workflow:\s*['"]parallel['"]/.test(cleanWorkerRestore) || !/hasBuiltInTool\(\s*['"]write['"]\s*\)/.test(cleanWorkerRestore)) {
    errors.push('WorkerModeController.restore drifted from plan-mode workflow/write-tool invariants');
  }

  return errors;
}

function validateTodoAutoClearDrift(
  interactiveModeSource: string,
  workerSessionSource: string,
  workerProjectionSource: string,
): string[] {
  const errors: string[] = [];
  const ompSyncBody = stripComments(extractMethodBody(interactiveModeSource, '\t#syncTodoHudState('));
  const workerSyncBody = stripComments(extractMethodBody(workerSessionSource, '  private syncTodoAutoClear('));
  const workerCurrentTodosBody = stripComments(extractMethodBody(workerProjectionSource, '  currentTodos('));

  const requiredOmpPrimitives: ReadonlyArray<readonly [string, RegExp]> = [
    ['getTodoHudVisibility', /\bgetTodoHudVisibility\s*\(/],
    ['"dismissed"', /===?\s*["']dismissed["']/],
    ['isClosedTodo', /\bisClosedTodo\s*\(/],
    ['cfgTasksTodoClearDelay.get', /\bcfgTasksTodoClearDelay\.get\s*\(/],
    ['createTodoHudStateData', /\bcreateTodoHudStateData\s*\(/],
    ['TODO_HUD_STATE_CUSTOM_TYPE', /\bTODO_HUD_STATE_CUSTOM_TYPE\b/],
    ['settleInFlightMessagePersistence', /\.settleInFlightMessagePersistence\s*\(/],
    ['appendCustomEntry', /\.appendCustomEntry\s*\(\s*TODO_HUD_STATE_CUSTOM_TYPE/],
    ['delaySeconds * 1000', /\bdelaySeconds\s*\*\s*1000\b/],
  ];

  for (const [label, pattern] of requiredOmpPrimitives) {
    if (!pattern.test(ompSyncBody)) {
      errors.push(`OMP #syncTodoHudState drifted: missing ${label}`);
    }
    if (!pattern.test(workerSyncBody)) {
      errors.push(`WorkerSession.syncTodoAutoClear drifted: missing ${label}`);
    }
  }

  if (!/\bgetTodoHudVisibility\s*\(/.test(workerCurrentTodosBody) || !/===?\s*['"]dismissed['"]/.test(workerCurrentTodosBody)) {
    errors.push('WorkerProjection.currentTodos no longer enforces persisted "dismissed" visibility via getTodoHudVisibility');
  }

  return errors;
}

describe('OMP builtin slash command mirror drift', () => {
  test('every pinned OMP builtin command is either allowed or explicitly excluded with a reason', () => {
    const ompCommands = loadOmpBuiltinCommands();
    const driftErrors = validateCommandDrift(ompCommands);
    expect(driftErrors).toEqual([]);
  });

  if (!process.env.OMP_DRIFT_COMMANDS_FIXTURE) {
    test('ACP_BUILTIN_SLASH_COMMANDS matches handled entries in BUILTIN_SLASH_COMMANDS_INTERNAL', () => {
      const handledInInternal = BUILTIN_SLASH_COMMANDS_INTERNAL.filter(c => c.handle !== undefined).map(c => c.name);
      const acpNames = ACP_BUILTIN_SLASH_COMMANDS.map(c => c.name);
      expect(acpNames).toEqual(handledInInternal);
    });

    test('CUSTOM_HANDLED_BUILTIN_COMMANDS match explicit handlers inside WorkerSession command dispatch', () => {
      const sessionSource = readFileSync(join(WORKER_DIR, 'session.ts'), 'utf8');
      const commandCaseStart = sessionSource.indexOf("case 'command': {");
      expect(commandCaseStart).toBeGreaterThan(-1);
      const commandCaseEnd = sessionSource.indexOf("case 'usage.stats':", commandCaseStart);
      expect(commandCaseEnd).toBeGreaterThan(commandCaseStart);
      const commandCaseSlice = sessionSource.slice(commandCaseStart, commandCaseEnd);
      for (const name of CUSTOM_HANDLED_BUILTIN_COMMANDS) {
        const handlerPattern = new RegExp(`if\\s*\\(\\s*parsed\\.name\\s*===\\s*['"]${name}['"]\\s*\\)`);
        expect(handlerPattern.test(commandCaseSlice)).toBe(true);
      }
    });

    test('every read-only builtin command is a member of ALLOWED_BUILTIN_COMMANDS', () => {
      const allowedSet = new Set<string>(ALLOWED_BUILTIN_COMMANDS);
      const readOnlyAllowed = ALLOWED_BUILTIN_COMMANDS.filter(name => isReadOnlyBuiltinCommand(name));
      expect(readOnlyAllowed.length).toBeGreaterThan(0);
      for (const name of readOnlyAllowed) {
        expect(allowedSet.has(name)).toBe(true);
      }
      // Also verify no stale keys in READ_ONLY_BUILTIN_COMMANDS inside builtin-commands.ts
      const builtinSource = readFileSync(join(WORKER_DIR, 'builtin-commands.ts'), 'utf8');
      const readOnlyMatch = builtinSource.match(/const READ_ONLY_BUILTIN_COMMANDS = \{([\s\S]*?)\}/);
      expect(readOnlyMatch).not.toBeNull();
      const keys = [...(readOnlyMatch?.[1] ?? '').matchAll(/^\s*([a-z-]+):\s*true/gm)].map(m => m[1] ?? '');
      expect(keys.length).toBe(readOnlyAllowed.length);
      for (const key of keys) {
        expect(allowedSet.has(key)).toBe(true);
      }
    });
  }

  test('drift detector fails when fed a mutated OMP command list', () => {
    const pinned = BUILTIN_SLASH_COMMANDS_INTERNAL.map(command => ({
      name: command.name,
      hasHandle: command.handle !== undefined,
    }));

    const withAddedCommand = [...pinned, { name: 'quantum-leap', hasHandle: true }];
    const addedErrors = validateCommandDrift(withAddedCommand);
    expect(addedErrors.some(err => err.includes('quantum-leap'))).toBe(true);

    const withoutCompact = pinned.filter(c => c.name !== 'compact');
    const removedErrors = validateCommandDrift(withoutCompact);
    expect(removedErrors.some(err => err.includes('compact'))).toBe(true);

    const strippedHandle = pinned.map(c => (c.name === 'compact' ? { ...c, hasHandle: false } : c));
    const handleErrors = validateCommandDrift(strippedHandle);
    expect(handleErrors.some(err => err.includes('compact') && err.includes('no headless handle'))).toBe(true);
  });
});

describe('OMP plan-mode orchestration mirror drift', () => {
  test('WorkerModeController plan-mode mirror matches pinned OMP InteractiveMode orchestration', () => {
    const interactiveModeSource = loadOmpInteractiveModeSource();
    const workerModeSource = readFileSync(join(WORKER_DIR, 'mode.ts'), 'utf8');
    const driftErrors = validatePlanModeDrift(interactiveModeSource, workerModeSource);
    expect(driftErrors).toEqual([]);
  });

  test('drift detector fails when fed mutated OMP plan-mode steps', () => {
    const pinnedInteractive = readFileSync(
      Bun.resolveSync('@oh-my-pi/pi-coding-agent/modes/interactive-mode', WORKER_DIR),
      'utf8',
    );
    const workerModeSource = readFileSync(join(WORKER_DIR, 'mode.ts'), 'utf8');

    const withExtraSessionCall = pinnedInteractive.replace(
      'this.session.setPlanProposalHandler?.(title => this.session.preparePlanForReview(title));',
      'this.session.setPlanProposalHandler?.(title => this.session.preparePlanForReview(title));\n\t\tthis.session.enablePlanSandbox();',
    );
    expect(withExtraSessionCall).not.toBe(pinnedInteractive);
    const extraStepErrors = validatePlanModeDrift(withExtraSessionCall, workerModeSource);
    expect(extraStepErrors.some(err => err.includes('enablePlanSandbox'))).toBe(true);

    const withSwappedWorkflow = pinnedInteractive.replace(
      'workflow: options?.workflow ?? "parallel",',
      'workflow: options?.workflow ?? "iterative",',
    );
    expect(withSwappedWorkflow).not.toBe(pinnedInteractive);
    const workflowErrors = validatePlanModeDrift(withSwappedWorkflow, workerModeSource);
    expect(workflowErrors.some(err => err.includes('"parallel"'))).toBe(true);

    const withReorderedWorkerCalls = workerModeSource.replace(
      'this.session.setPlanModeState({ enabled: true, planFilePath: reference, workflow: \'parallel\', reentry: this.current.kind === \'plan\' });\n    try {\n      // Plan mode keeps its own tool set; the preference only decides whether the\n      // subagent task tool stays available while planning.\n      const planTools = [...originalTools, ...(this.session.hasBuiltInTool(\'write\') ? [\'write\'] : [])];\n      if (this.planAllowAgents && this.session.hasBuiltInTool(\'task\') && !planTools.includes(\'task\')) planTools.push(\'task\');\n      await this.session.setActiveToolsByName([...new Set(planTools)]);',
      'try {\n      const planTools = [...originalTools, ...(this.session.hasBuiltInTool(\'write\') ? [\'write\'] : [])];\n      if (this.planAllowAgents && this.session.hasBuiltInTool(\'task\') && !planTools.includes(\'task\')) planTools.push(\'task\');\n      await this.session.setActiveToolsByName([...new Set(planTools)]);\n      this.session.setPlanModeState({ enabled: true, planFilePath: reference, workflow: \'parallel\', reentry: this.current.kind === \'plan\' });',
    );
    expect(withReorderedWorkerCalls).not.toBe(workerModeSource);
    const reorderErrors = validatePlanModeDrift(pinnedInteractive, withReorderedWorkerCalls);
    expect(reorderErrors.some(err => err.includes('WorkerModeController.enterPlan'))).toBe(true);
  });
});

describe('OMP todo auto-clear mirror drift', () => {
  test('WorkerSession and WorkerProjection todo auto-clear mirror matches pinned OMP InteractiveMode.#syncTodoHudState', () => {
    const interactiveModeSource = loadOmpInteractiveModeSource();
    const workerSessionSource = readFileSync(join(WORKER_DIR, 'session.ts'), 'utf8');
    const workerProjectionSource = readFileSync(join(WORKER_DIR, 'projection.ts'), 'utf8');
    const driftErrors = validateTodoAutoClearDrift(interactiveModeSource, workerSessionSource, workerProjectionSource);
    expect(driftErrors).toEqual([]);
  });

  test('drift detector fails when fed mutated OMP todo auto-clear logic', () => {
    const pinnedInteractive = readFileSync(
      Bun.resolveSync('@oh-my-pi/pi-coding-agent/modes/interactive-mode', WORKER_DIR),
      'utf8',
    );
    const workerSessionSource = readFileSync(join(WORKER_DIR, 'session.ts'), 'utf8');
    const workerProjectionSource = readFileSync(join(WORKER_DIR, 'projection.ts'), 'utf8');

    const withChangedDelay = pinnedInteractive.replace(
      'cfgTasksTodoClearDelay.get(owner.settings)',
      'cfgTodoClearMinutes.get(owner.settings)',
    );
    expect(withChangedDelay).not.toBe(pinnedInteractive);
    const delayErrors = validateTodoAutoClearDrift(withChangedDelay, workerSessionSource, workerProjectionSource);
    expect(delayErrors.some(err => err.includes('cfgTasksTodoClearDelay.get'))).toBe(true);

    const withChangedEntryType = pinnedInteractive.replaceAll('TODO_HUD_STATE_CUSTOM_TYPE', '"todo_hud_v2"');
    expect(withChangedEntryType).not.toBe(pinnedInteractive);
    const entryTypeErrors = validateTodoAutoClearDrift(withChangedEntryType, workerSessionSource, workerProjectionSource);
    expect(entryTypeErrors.some(err => err.includes('TODO_HUD_STATE_CUSTOM_TYPE'))).toBe(true);
  });
});
