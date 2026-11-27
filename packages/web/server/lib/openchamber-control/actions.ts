import { isString } from '../shared/guards.js';

interface ControlActionDefinition {
  readonly action: string;
  readonly title: string;
  readonly description: string;
  readonly agentExposed?: false;
}

const OPENCHAMBER_CONTROL_ACTION_DEFINITIONS: readonly ControlActionDefinition[] = Object.freeze([
  { action: 'terminal.list', title: 'List terminal panels', description: 'List terminal panels in the captured workspace; requires the user to enable terminal reading in Settings' },
  { action: 'terminal.read', title: 'Read terminal panel output', description: 'Read output from a terminal sessionId listed in this workspace; optional maxBytes; requires terminal reading enabled in Settings' },
  { action: 'projects.list', title: 'List configured projects', description: 'List configured projects; no parameters' },
  { action: 'models.search', title: 'Search models', description: 'The model catalog, favorites and recent models first; optional query, provider, all, limit, offset' },
  { action: 'models.list', title: 'Show model preferences', description: 'Show default, favorite, and recent model preferences; no parameters' },
  { action: 'session.list', title: 'List sessions', description: 'List sessions; optional projectId or directory, limit (default 10), all, or withStatus' },
  { action: 'session.track', title: 'Track a session', description: 'Put sessionId (default: this session) In work; pinned, archived, child and non-project sessions cannot be tracked' },
  { action: 'session.markDone', title: 'Mark a session done', description: 'Remove sessionId (default: this session) from In work' },
  { action: 'session.create', title: 'Create a session', description: 'Create a session in the current directory by default; prompt is optional' },
  { action: 'session.send', title: 'Send a prompt', description: 'Send a new prompt to sessionId; scope with projectId or directory' },
  { action: 'session.fork', title: 'Fork a session', description: 'Fork sessionId; messageId selects the boundary; prompt is optional' },
  { action: 'session.status', title: 'Check session status', description: 'Check sessionId status; directory defaults to the current session' },
  { action: 'session.messages', title: 'Read session messages', description: 'Read text-only messages and current sessionStatus for sessionId; directory and limit 10 are defaults' },
  { action: 'session.link', title: 'Link a change or issue to a session', description: 'Link a change under review (pull or merge request) or an issue, on any service, to a session; requires link, sessionId defaults to the current session. Each link is added beside the others; linking one that is already there updates its title instead of adding it twice. Links are only added; the user removes them' },
  { action: 'pr.watch', title: 'Wait for a pull request', description: 'Watch the pull request or merge request at url for a session. A message arrives in the session when a check fails, every check passes, someone comments or reviews, its branch conflicts or falls behind, or it is merged or closed. Replaces the watch the session had; sessionId defaults to this session' },
  { action: 'pr.unwatch', title: 'Stop waiting for a pull request', description: 'Stop the pull request watch of sessionId, which defaults to this session; the session is not woken' },
  { action: 'wait.list', title: 'List waits and available sources', description: 'List this session’s timer and extension waits, and the sources and arguments it can wait on' },
  { action: 'wait.start', title: 'Start a timer or extension wait', description: 'Requires source and args: "timer" with { "minutes": N } (1 to 1440), or a source and arguments from wait.list. The wait wakes this session when it fires' },
  { action: 'wait.stop', title: 'Stop a timer or extension wait', description: 'Stop waitId, or all timer and extension waits of this session when waitId is omitted, without waking it' },
  { action: 'schedule.status', title: 'Check scheduler status', description: 'Check scheduler status; no parameters', agentExposed: false },
  { action: 'schedule.list', title: 'List scheduled tasks', description: 'List tasks and scheduler status; scope with projectId or directory' },
  { action: 'schedule.create', title: 'Create a scheduled task', description: 'Create task; requires name, prompt, one schedule selector, and model unless targetSessionId is set. targetSessionId reuses a session; without model it keeps that session selection' },
  { action: 'schedule.update', title: 'Change a scheduled task', description: 'Change taskId in place, keeping its id and run state; pass only what changes: name, prompt, model, variant, agent, targetSessionId (empty clears it), a schedule selector, timezone, disabled' },
  { action: 'schedule.run', title: 'Run a scheduled task', description: 'Run taskId; scope with projectId or directory' },
  { action: 'schedule.delete', title: 'Delete a scheduled task', description: 'Delete taskId; scope with projectId or directory' },
  { action: 'schedule.toggle', title: 'Enable or disable a scheduled task', description: 'Enable or disable taskId; requires the disabled boolean' },
  { action: 'session.moveToWorktree', title: 'Move a session into a new worktree', description: 'Move sessionId (default: this session) into a new worktree of its repository, made the way the New worktree dialog makes one; requires worktree.name. carry names the files whose uncommitted changes move with it. The session moves only after the worktree and the destination workspace exist; a failure removes the worktree and puts the carried changes back, or names the stash that keeps them' },
  { action: 'file.open', title: 'Show a file to the user', description: 'Open path in the user\'s file panel, in front of whatever they had open, so they can look at a result you produced: a screenshot, report, CSV, recording, or generated page. Relative to the session directory. Use it only when seeing the file moves the work forward, not for every file you touch' },
]);

const OPENCHAMBER_CONTROL_ACTIONS: readonly string[] = Object.freeze(
  OPENCHAMBER_CONTROL_ACTION_DEFINITIONS.map(({ action }) => action),
);

const AGENT_EXPOSED_CONTROL_ACTION_DEFINITIONS: readonly ControlActionDefinition[] = OPENCHAMBER_CONTROL_ACTION_DEFINITIONS
  .filter(({ agentExposed }) => agentExposed !== false);

const OPENCHAMBER_WEB_ACTION_DEFINITIONS: readonly ControlActionDefinition[] = Object.freeze([
  { action: 'browser.open', title: 'Open a page in the browser panel', description: 'Open url in the in-app browser panel; use it to look at the running app. Without tabId it opens a new background tab and answers with its tabId: pass that tabId to the following actions to keep working there. With tabId it loads url in that tab. Set viewport to mobile, tablet or desktop to lay the page out at that size. The result says whether this client can drive the page: drivable false means display-only, so later browser actions cannot run there' },
  { action: 'browser.snapshot', title: 'Read the open page', description: 'Read the open page: url, title, visible text, and interactive elements with the selectors the other browser actions accept. Pass selector to read only that part of a long page. Reports any errors the page logged, and lists the open tabs with the ids tabId accepts and who opened each: you, the user, or another session' },
  { action: 'browser.click', title: 'Click on the open page', description: 'Click an element; give selector, or text to match a link or button by its visible label' },
  { action: 'browser.type', title: 'Type into the open page', description: 'Type value into the field matched by selector; set submit to press Enter afterwards' },
  { action: 'browser.select', title: 'Select an option on the open page', description: 'One exact option by label or value in the native select matched by selector' },
  { action: 'browser.upload', title: 'Upload files to the open page', description: 'Attach files from the session folder to the file input matched by selector; paths is a list of file paths' },
  { action: 'browser.scroll', title: 'Scroll the open page', description: 'Scroll the page; direction is up, down, top, or bottom, or pass selector to bring one element into view' },
  { action: 'browser.back', title: 'Go back in the browser panel', description: 'Return to the previous page in this tab; no parameters' },
  { action: 'browser.forward', title: 'Go forward in the browser panel', description: 'Move forward again in this tab; no parameters' },
  { action: 'browser.inspect', title: 'Read how an element renders', description: 'Read the computed styles of the element matched by selector — colours, fonts, spacing, borders — as the page actually renders them' },
  { action: 'browser.capture', title: 'Save a screenshot of the page', description: 'Save what is currently visible in the browser panel as an image file in the project and return its path, so a change can be shown rather than described. Pass label to name it (for example before-fix); the result reports the page, layout and path to reference in your answer' },
  { action: 'browser.resize', title: 'Change the page viewport', description: 'Lay the open page out at a different size; viewport is mobile, tablet, desktop, or fill to use the whole panel' },
  { action: 'browser.close', title: 'Close a browser tab', description: 'Close a tab this session opened; without tabId, its most recent one. Never a tab the user opened' },
]);

export const OPENCHAMBER_WEB_ACTIONS: readonly string[] = Object.freeze(
  OPENCHAMBER_WEB_ACTION_DEFINITIONS.map(({ action }) => action),
);

const OPENCHAMBER_KNOWLEDGE_ACTION_DEFINITIONS: readonly ControlActionDefinition[] = Object.freeze([
  { action: 'knowledge.list', title: 'List project knowledge', description: 'Notes with text, todos with state and links, plans with their file paths and session. Optional planId and ready filters. List before adding, to avoid duplicates' },
  { action: 'knowledge.save', title: 'Save project knowledge', description: 'Requires kind and body; with id it replaces. A plan body is the whole markdown, and the answer gives its path. An update may send only the fields it changes: completed, planId or dependsOn; sessionId on a plan, without body' },
  { action: 'knowledge.delete', title: 'Delete project knowledge', description: 'Requires kind and id' },
  { action: 'knowledge.show', title: 'Show a plan to the user', description: 'Open a plan for the user to read, comment on and send to a session; requires kind plan and id' },
]);

export const OPENCHAMBER_KNOWLEDGE_ACTIONS: readonly string[] = Object.freeze(
  OPENCHAMBER_KNOWLEDGE_ACTION_DEFINITIONS.map(({ action }) => action),
);

const OPENCHAMBER_NOTIFY_ACTION_DEFINITIONS: readonly ControlActionDefinition[] = Object.freeze([
  { action: 'notify.send', title: 'Notify the user', description: 'Send the user a notification; requires title, body is optional. By default it appears only while the user is away from OhPiChamber; set showWhenFocused only when it cannot wait' },
]);

export const OPENCHAMBER_NOTIFY_ACTIONS: readonly string[] = Object.freeze(
  OPENCHAMBER_NOTIFY_ACTION_DEFINITIONS.map(({ action }) => action),
);

const OPENCHAMBER_RENDER_ACTION_DEFINITIONS: readonly ControlActionDefinition[] = Object.freeze([
  { action: 'render.page', title: 'Show a page', description: 'Requires html and title' },
]);

export const OPENCHAMBER_RENDER_ACTIONS: readonly string[] = Object.freeze(
  OPENCHAMBER_RENDER_ACTION_DEFINITIONS.map(({ action }) => action),
);

export const OPENCHAMBER_SECRET_ACTIONS: readonly string[] = Object.freeze(['secret.run', 'secret.forget', 'secret.request']);

export const OPENCHAMBER_USAGE_ACTION_DEFINITIONS: readonly ControlActionDefinition[] = Object.freeze([
  { action: 'usage.read', title: 'Read usage limits', description: 'Usage windows, percentages and resets for configured providers in this workspace; providerId reads one' },
]);

export const OPENCHAMBER_USAGE_ACTIONS: readonly string[] = Object.freeze(
  OPENCHAMBER_USAGE_ACTION_DEFINITIONS.map(({ action }) => action),
);

const OPENCHAMBER_WORKFLOW_ACTION_DEFINITIONS: readonly ControlActionDefinition[] = Object.freeze([
  { action: 'workflow.check', title: 'Check a workflow', description: 'Compile script, or a saved workflow by name, without running it: its name, description and phases' },
  { action: 'workflow.run', title: 'Propose a workflow run', description: 'script, or name of a saved workflow, with optional args. The user approves the plan in the chat; the report arrives here as a message when the run ends. Returns runId at once' },
  { action: 'workflow.status', title: 'Check a workflow run', description: 'Phases, agents with their state, key and session id, recent log lines and a result preview of runId' },
  { action: 'workflow.result', title: 'Read a workflow result', description: "The whole result of runId; with agent (its key or session id) that agent's prompt and full answer" },
  { action: 'workflow.stop', title: 'Stop a workflow run', description: 'Stop runId; its running agents are interrupted' },
  { action: 'workflow.resume', title: 'Resume a workflow run', description: 'Run a stopped or failed runId again: agents asked the same as before return their saved answer, the rest run' },
  { action: 'workflow.save', title: 'Save a workflow', description: 'Save script as .openchamber/workflows/<meta.name>.js in this project, to run later by name; overwrite replaces one' },
  { action: 'workflow.list', title: 'List workflows', description: "This project's saved workflows and this session's runs" },
]);

export const WORKFLOW_ANSWER_TOOL = 'openchamber_workflow_answer';

const OPENCHAMBER_WORKFLOW_ANSWER_ACTION_DEFINITIONS: readonly ControlActionDefinition[] = Object.freeze([
  { action: 'workflow.answer', title: 'Submit a workflow answer', description: 'Only for a workflow agent whose prompt asks for it: answer, a JSON value matching the schema in that prompt. Checked on the spot; a mismatch says what to fix' },
]);

const OPENCHAMBER_WORKFLOW_ANSWER_ACTIONS: readonly string[] = Object.freeze(
  OPENCHAMBER_WORKFLOW_ANSWER_ACTION_DEFINITIONS.map(({ action }) => action),
);

export const OPENCHAMBER_WORKFLOW_ACTIONS: readonly string[] = Object.freeze([
  ...OPENCHAMBER_WORKFLOW_ACTION_DEFINITIONS.map(({ action }) => action),
  ...OPENCHAMBER_WORKFLOW_ANSWER_ACTIONS,
]);

const OPENCHAMBER_AGENT_TOOL_ACTION_DEFINITIONS: readonly ControlActionDefinition[] = Object.freeze([
  ...AGENT_EXPOSED_CONTROL_ACTION_DEFINITIONS,
  ...OPENCHAMBER_WORKFLOW_ACTION_DEFINITIONS,
]);

export const OPENCHAMBER_AGENT_TOOL_ACTIONS: readonly string[] = Object.freeze(
  OPENCHAMBER_AGENT_TOOL_ACTION_DEFINITIONS.map(({ action }) => action),
);

export const OPENCHAMBER_ALL_ACTIONS: readonly string[] = Object.freeze([
  ...OPENCHAMBER_USAGE_ACTIONS,
  ...OPENCHAMBER_CONTROL_ACTIONS,
  ...OPENCHAMBER_WEB_ACTIONS,
  ...OPENCHAMBER_KNOWLEDGE_ACTIONS,
  ...OPENCHAMBER_NOTIFY_ACTIONS,
  ...OPENCHAMBER_RENDER_ACTIONS,
  ...OPENCHAMBER_SECRET_ACTIONS,
  ...OPENCHAMBER_WORKFLOW_ACTIONS,
  ...OPENCHAMBER_WORKFLOW_ANSWER_ACTIONS,
]);

const ACTIONS_BY_TOOL = new Map<string, readonly string[]>([
  ['openchamber_usage', OPENCHAMBER_USAGE_ACTIONS],
  ['openchamber', OPENCHAMBER_AGENT_TOOL_ACTIONS],
  ['web', OPENCHAMBER_WEB_ACTIONS],
  ['openchamber_knowledge', OPENCHAMBER_KNOWLEDGE_ACTIONS],
  ['notify', OPENCHAMBER_NOTIFY_ACTIONS],
  ['openchamber_render', OPENCHAMBER_RENDER_ACTIONS],
  ['openchamber_secret', OPENCHAMBER_SECRET_ACTIONS],
  ['openchamber_workflow', OPENCHAMBER_WORKFLOW_ACTIONS],
  [WORKFLOW_ANSWER_TOOL, OPENCHAMBER_WORKFLOW_ANSWER_ACTIONS],
]);

const bareName = (action: string): string => {
  const separator = action.indexOf('.');
  return separator === -1 ? action : action.slice(separator + 1);
};

const uniqueMatch = (candidates: readonly string[], requested: string): string | null => {
  const matches = candidates.filter((candidate) => bareName(candidate) === requested);
  return matches.length === 1 ? (matches[0] ?? null) : null;
};

export type ResolvedAgentToolAction = { action: string; error?: never } | { error: string; action?: never };

export const resolveAgentToolAction = (
  requested: string | null | undefined,
  toolName?: string | null | undefined,
): ResolvedAgentToolAction => {
  const value = isString(requested) ? requested.trim() : '';
  const scoped = toolName ? (ACTIONS_BY_TOOL.get(toolName) ?? null) : null;
  const known = scoped ?? OPENCHAMBER_ALL_ACTIONS;

  if (value && known.includes(value)) {
    return { action: value };
  }
  if (value) {
    const resolved = uniqueMatch(known, value)
      ?? (scoped ? null : uniqueMatch(OPENCHAMBER_ALL_ACTIONS, value));
    if (resolved) {
      return { action: resolved };
    }
  }

  return {
    error: `Unsupported OhPiChamber action: ${value || 'missing'}. Use one of: ${known.join(', ')}`,
  };
};
