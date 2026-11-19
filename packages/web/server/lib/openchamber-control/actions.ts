<<<<<<< HEAD:packages/web/server/lib/openchamber-control/actions.js
/**
 * Two capabilities, two tools.
 *
 * Controlling sessions and driving a page are different intents, and a single
 * tool description covering both is vaguer than either — which is how a model
 * ends up calling the wrong one. Separate tools also mean turning one off
 * removes it entirely, parameters included, rather than leaving its inputs
 * visible in a shared schema.
 */
const OPENCHAMBER_CONTROL_ACTION_DEFINITIONS = Object.freeze([
  { action: 'projects.list', title: 'List configured projects', description: 'List configured projects; no parameters' },
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/actions.js
/**
 * Two capabilities, two tools.
 *
 * Controlling sessions and driving a page are different intents, and a single
 * tool description covering both is vaguer than either — which is how a model
 * ends up calling the wrong one. Separate tools also mean turning one off
 * removes it entirely, parameters included, rather than leaving its inputs
 * visible in a shared schema.
 */
export const OPENCHAMBER_CONTROL_ACTION_DEFINITIONS = Object.freeze([
  { action: 'projects.list', title: 'List session destinations', description: 'Projects and Chats; use an id as projectId for session.create. No parameters' },
  { action: 'models.list', title: 'Show model preferences', description: 'Default, favorite and recent models; no parameters' },
=======
export const OPENCHAMBER_CONTROL_ACTION_DEFINITIONS = Object.freeze([
  { action: 'projects.list', title: 'List session destinations', description: 'Projects and Chats; use an id as projectId for session.create. No parameters' },
  { action: 'models.list', title: 'Show model preferences', description: 'Default, favorite and recent models; no parameters' },
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/actions.ts
  { action: 'models.search', title: 'Search models', description: 'The model catalog, favorites and recent models first; optional query, provider, all, limit, offset' },
<<<<<<< HEAD:packages/web/server/lib/openchamber-control/actions.js
  { action: 'models.list', title: 'Show model preferences', description: 'Show default, favorite, and recent model preferences; no parameters' },
  { action: 'session.list', title: 'List sessions', description: 'List sessions; optional projectId or directory, limit (default 10), all, or withStatus' },
  { action: 'session.create', title: 'Create a session', description: 'Create a session in the current directory by default; prompt is optional' },
  { action: 'session.send', title: 'Send a prompt', description: 'Send a new prompt to sessionId; scope with projectId or directory' },
  { action: 'session.fork', title: 'Fork a session', description: 'Fork sessionId; messageId selects the boundary; prompt is optional' },
  { action: 'session.status', title: 'Check session status', description: 'Check sessionId status; directory defaults to the current session' },
  { action: 'session.messages', title: 'Read session messages', description: 'Read text-only messages and current sessionStatus for sessionId; directory and limit 10 are defaults' },
  { action: 'session.link', title: 'Link a change or issue to a session', description: 'Link a change under review (pull or merge request) or an issue, on any service, to a session; requires link, sessionId defaults to the current session. Each link is added beside the others; linking one that is already there updates its title instead of adding it twice. Links are only added; the user removes them' },
  { action: 'pr.watch', title: 'Wait for a pull request', description: 'Watch the pull request or merge request at url for a session. A message arrives in the session when a check fails, every check passes, someone comments or reviews, its branch conflicts or falls behind, or it is merged or closed. Replaces the watch the session had; sessionId defaults to this session' },
  { action: 'pr.unwatch', title: 'Stop waiting for a pull request', description: 'Stop the pull request watch of sessionId, which defaults to this session; the session is not woken' },
  { action: 'schedule.status', title: 'Check scheduler status', description: 'Check scheduler status; no parameters', agentExposed: false },
  { action: 'schedule.list', title: 'List scheduled tasks', description: 'List tasks and scheduler status; scope with projectId or directory' },
  { action: 'schedule.create', title: 'Create a scheduled task', description: 'Create task; requires name, prompt, one schedule selector, and model unless targetSessionId is set. targetSessionId reuses a session; without model it keeps that session selection' },
  { action: 'schedule.update', title: 'Change a scheduled task', description: 'Change taskId in place, keeping its id and run state; pass only what changes: name, prompt, model, variant, agent, targetSessionId (empty clears it), a schedule selector, timezone, disabled' },
  { action: 'schedule.run', title: 'Run a scheduled task', description: 'Run taskId; scope with projectId or directory' },
  { action: 'schedule.delete', title: 'Delete a scheduled task', description: 'Delete taskId; scope with projectId or directory' },
  { action: 'schedule.toggle', title: 'Enable or disable a scheduled task', description: 'Enable or disable taskId; requires the disabled boolean' },
  { action: 'session.moveToWorktree', title: 'Move a session into a new worktree', description: 'Move sessionId (default: this session) into a new worktree of its repository, made the way the New worktree dialog makes one; requires worktree.name. carry names the files whose uncommitted changes move with it. The session moves only after the worktree and the destination workspace exist; a failure removes the worktree and puts the carried changes back, or names the stash that keeps them' },
  { action: 'file.open', title: 'Show a file to the user', description: 'Open path in the user\'s file panel, in front of whatever they had open, so they can look at a result you produced: a screenshot, report, CSV, recording, or generated page. Relative to the session directory. Use it only when seeing the file moves the work forward, not for every file you touch' },
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/actions.js
  { action: 'session.list', title: 'List sessions', description: 'Newest top-level sessions here; each has inWork (in the sidebar\'s In work) and doneSuggested (its last turn looks finished). Filters inWork, busy (running now), query (title words); inWork and busy span every project unless scoped and return all matches. Optional limit, all, children, withStatus (status as in session.status)' },
  { action: 'session.markDone', title: 'Mark a session done', description: 'Take sessionId (default: this session) out of In work, as the Done button does. Only on the user\'s word; a later message puts it back' },
  { action: 'session.track', title: 'Put a session in work', description: 'Put sessionId back in In work, as the Track button does, such as to undo a markDone' },
  { action: 'session.create', title: 'Create a session', description: 'In this directory by default; projectId from projects.list selects a project or openchamber:chats for a new Chat. Use the returned directory for later session actions. Prompt optional' },
  { action: 'session.send', title: 'Send a prompt', description: 'New prompt to sessionId' },
  { action: 'session.fork', title: 'Fork a session', description: 'Fork sessionId at messageId; prompt optional' },
  { action: 'session.status', title: 'Check session status', description: 'Status of sessionId: busy, idle, or waiting when it cannot go on until the user answers it. An unknown id is an error' },
  { action: 'session.messages', title: 'Read session messages', description: 'Text messages and sessionStatus of sessionId' },
  { action: 'session.moveToWorktree', title: 'Move a session into a new worktree', description: 'Move sessionId (default: this session) and its carry files into a new worktree, made the way the New worktree dialog makes one; requires worktree. Nothing moves when carry cannot be applied; directory is ignored' },
  { action: 'session.link', title: 'Link a change or issue to a session', description: 'Add link to sessionId (default: this session); the same link again updates its title. Only the user removes links' },
  { action: 'pr.watch', title: 'Wait on a pull request', description: 'Requires url of a GitHub pull request or GitLab merge request. A message arrives in this session when a check fails or every check passes, someone comments or reviews, the branch conflicts or falls behind, or it is merged or closed. One wake ends the watch: watch again to keep waiting. Never wait with a sleep loop' },
  { action: 'pr.unwatch', title: 'Stop waiting on a pull request', description: 'This session stops waiting; no parameters' },
  { action: 'work.name', title: 'Name the task', description: 'Name the worktree\'s or isolated space\'s task for sessionId (default: this session), never a session. In title: at most 4 words in the user\'s latest language; rename only for a different task. A user-given name stays. Main checkout and plain folders need no naming. A worktree on an OpenChamber-generated placeholder branch also requires branch, the English branch name after the task, and renames it; any other branch stays' },
  { action: 'schedule.status', title: 'Check scheduler status', description: 'No parameters', agentExposed: false },
  { action: 'schedule.list', title: 'List scheduled tasks', description: 'Tasks and scheduler status' },
  { action: 'schedule.create', title: 'Create a scheduled task', description: 'Requires name, prompt, one schedule selector, and model unless targetSessionId is set. That session keeps its model and agent unless the task names others, which then become the session\'s. A named model is checked against the catalog when the task is written. runInWorktree (git only) runs each run in a fresh worktree on baseBranch (default HEAD); cleanupWorktree false keeps it' },
  { action: 'schedule.update', title: 'Change a scheduled task', description: 'Change taskId in place, keeping its id and run state; pass only what changes. runInWorktree, baseBranch and cleanupWorktree switch a task to run in an isolated worktree (git only)' },
  { action: 'schedule.run', title: 'Run a scheduled task', description: 'Run taskId now' },
  { action: 'schedule.delete', title: 'Delete a scheduled task', description: 'Delete taskId' },
  { action: 'schedule.toggle', title: 'Enable or disable a scheduled task', description: 'Requires taskId and disabled' },
  { action: 'file.open', title: 'Show a file to the user', description: 'Put path in front of the user\'s file panel, for a result worth seeing: a screenshot, report, CSV, recording, generated page' },
=======
  { action: 'session.list', title: 'List sessions', description: 'Newest top-level sessions here; each has inWork (in the sidebar\'s In work) and doneSuggested (its last turn looks finished). Filters inWork, busy (running now), query (title words); inWork and busy span every project unless scoped and return all matches. Optional limit, all, children, withStatus (status as in session.status)' },
  { action: 'session.markDone', title: 'Mark a session done', description: 'Take sessionId (default: this session) out of In work, as the Done button does. Only on the user\'s word; a later message puts it back' },
  { action: 'session.track', title: 'Put a session in work', description: 'Put sessionId back in In work, as the Track button does, such as to undo a markDone' },
  { action: 'session.create', title: 'Create a session', description: 'In this directory by default; projectId from projects.list selects a project or openchamber:chats for a new Chat. Use the returned directory for later session actions. Prompt optional' },
  { action: 'session.send', title: 'Send a prompt', description: 'New prompt to sessionId' },
  { action: 'session.fork', title: 'Fork a session', description: 'Fork sessionId at messageId; prompt optional' },
  { action: 'session.status', title: 'Check session status', description: 'Status of sessionId: busy, idle, or waiting when it cannot go on until the user answers it. An unknown id is an error' },
  { action: 'session.messages', title: 'Read session messages', description: 'Text messages and sessionStatus of sessionId' },
  { action: 'session.moveToWorktree', title: 'Move a session into a new worktree', description: 'Move sessionId (default: this session) and its carry files into a new worktree, made the way the New worktree dialog makes one; requires worktree. Nothing moves when carry cannot be applied; directory is ignored' },
  { action: 'session.link', title: 'Link a change or issue to a session', description: 'Add link to sessionId (default: this session); the same link again updates its title' },
  { action: 'session.unlink', title: 'Remove a link from a session', description: 'Remove a link from sessionId (default: this session), named by the url or identifier it was linked with' },
  { action: 'pr.watch', title: 'Wait on a pull request', description: 'Requires url of a GitHub pull request or GitLab merge request. Same as wait.start with source "pr"', agentExposed: false },
  { action: 'pr.unwatch', title: 'Stop waiting on a pull request', description: 'This session stops waiting on the pull request at url, or on every one without url', agentExposed: false },
  { action: 'wait.list', title: 'List waits', description: "This session's waits, and the sources to wait on (the built-in timer, pull requests, and what extensions offer), with the args each takes" },
  { action: 'wait.start', title: 'Wait on a timer, a pull request or an extension', description: 'Requires source and args: "timer" with { "minutes": N } (1 to 1440); "pr" with { "url": "<GitHub pull request or GitLab merge request address>" }, which wakes the session when a check fails or every check passes, someone comments or reviews, the branch conflicts or falls behind, or it is merged or closed; or a source from wait.list with args as its params say. Each pull request is its own wait, so a session can wait on several. One wake ends the wait, so start it again to keep waiting. End your turn while you wait. Never wait with a sleep loop' },
  { action: 'wait.stop', title: 'Stop a wait', description: 'Stop waitId (a pull request wait\'s waitId is its address), or every wait of this session without it' },
  { action: 'work.name', title: 'Name the task', description: 'Name the worktree\'s or isolated space\'s task for sessionId (default: this session), never a session. In title: at most 4 words in the user\'s latest language; rename only for a different task. A user-given name stays. Main checkout and plain folders need no naming. A worktree on an OpenChamber-generated placeholder branch also requires branch, the English branch name after the task, and renames it; any other branch stays' },
  { action: 'schedule.status', title: 'Check scheduler status', description: 'No parameters', agentExposed: false },
  { action: 'schedule.list', title: 'List scheduled tasks', description: 'Tasks and scheduler status' },
  { action: 'schedule.create', title: 'Create a scheduled task', description: 'Requires name, prompt, one schedule selector, and model unless targetSessionId is set. That session keeps its model and agent unless the task names others, which then become the session\'s. A named model is checked against the catalog when the task is written. runInWorktree (git only) runs each run in a fresh worktree on baseBranch (default HEAD); cleanupWorktree false keeps it' },
  { action: 'schedule.update', title: 'Change a scheduled task', description: 'Change taskId in place, keeping its id and run state; pass only what changes. runInWorktree, baseBranch and cleanupWorktree switch a task to run in an isolated worktree (git only)' },
  { action: 'schedule.run', title: 'Run a scheduled task', description: 'Run taskId now' },
  { action: 'schedule.delete', title: 'Delete a scheduled task', description: 'Delete taskId' },
  { action: 'schedule.toggle', title: 'Enable or disable a scheduled task', description: 'Requires taskId and disabled' },
  { action: 'file.open', title: 'Show a file to the user', description: 'Put path in front of the user\'s file panel, for a result worth seeing: a screenshot, report, CSV, recording, generated page' },
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/actions.ts
]);

const OPENCHAMBER_CONTROL_ACTIONS = Object.freeze(
  OPENCHAMBER_CONTROL_ACTION_DEFINITIONS.map(({ action }) => action),
);

const AGENT_EXPOSED_CONTROL_ACTION_DEFINITIONS = OPENCHAMBER_CONTROL_ACTION_DEFINITIONS
  .filter(({ agentExposed }) => agentExposed !== false);
<<<<<<< HEAD:packages/web/server/lib/openchamber-control/actions.js
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/actions.js
const isScheduleAction = ({ action }) => action.startsWith('schedule.');
=======
const isScheduleAction = ({ action }: { action: string }) => action.startsWith('schedule.');
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/actions.ts

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/actions.js
const OPENCHAMBER_WEB_ACTION_DEFINITIONS = Object.freeze([
  { action: 'browser.open', title: 'Open a page in the browser panel', description: 'Open url in the in-app browser panel; use it to look at the running app. Without tabId it opens a new background tab and answers with its tabId: pass that tabId to the following actions to keep working there. With tabId it loads url in that tab. Set viewport to mobile, tablet or desktop to lay the page out at that size. The result says whether this client can drive the page: drivable false means display-only, so later browser actions cannot run there' },
  { action: 'browser.snapshot', title: 'Read the open page', description: 'Read the open page: url, title, visible text, and interactive elements with the selectors the other browser actions accept. Pass selector to read only that part of a long page. Reports any errors the page logged, and lists the open tabs with the ids tabId accepts and who opened each: you, the user, or another session' },
  { action: 'browser.click', title: 'Click on the open page', description: 'Click an element; give selector, or text to match a link or button by its visible label' },
  { action: 'browser.type', title: 'Type into the open page', description: 'Type value into the field matched by selector; set submit to press Enter afterwards' },
  { action: 'browser.select', title: 'Select an option on the open page', description: 'One exact option by label or value in the native select matched by selector' },
  { action: 'browser.scroll', title: 'Scroll the open page', description: 'Scroll the page; direction is up, down, top, or bottom, or pass selector to bring one element into view' },
  { action: 'browser.back', title: 'Go back in the browser panel', description: 'Return to the previous page in this tab; no parameters' },
  { action: 'browser.forward', title: 'Go forward in the browser panel', description: 'Move forward again in this tab; no parameters' },
  { action: 'browser.inspect', title: 'Read how an element renders', description: 'Read the computed styles of the element matched by selector — colours, fonts, spacing, borders — as the page actually renders them' },
  { action: 'browser.capture', title: 'Save a screenshot of the page', description: 'Save what is currently visible in the browser panel as an image file in the project and return its path, so a change can be shown rather than described. Pass label to name it (for example before-fix); the result reports the page, layout and path to reference in your answer' },
  { action: 'browser.resize', title: 'Change the page viewport', description: 'Lay the open page out at a different size; viewport is mobile, tablet, desktop, or fill to use the whole panel' },
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/actions.js
/**
 * The control service runs sessions and scheduled tasks alike, for the CLI
 * too, but agents get them as two tools: scheduling is its own intent, carries
 * ten inputs of its own, and the user can switch it off without losing
 * session control.
 */
export const OPENCHAMBER_AGENT_TOOL_ACTION_DEFINITIONS = Object.freeze(
  AGENT_EXPOSED_CONTROL_ACTION_DEFINITIONS.filter((definition) => !isScheduleAction(definition)),
);

export const OPENCHAMBER_AGENT_TOOL_ACTIONS = Object.freeze(
  OPENCHAMBER_AGENT_TOOL_ACTION_DEFINITIONS.map(({ action }) => action),
);

export const OPENCHAMBER_SCHEDULE_ACTION_DEFINITIONS = Object.freeze(
  AGENT_EXPOSED_CONTROL_ACTION_DEFINITIONS.filter(isScheduleAction),
);

export const OPENCHAMBER_SCHEDULE_ACTIONS = Object.freeze(
  OPENCHAMBER_SCHEDULE_ACTION_DEFINITIONS.map(({ action }) => action),
);

export const OPENCHAMBER_WEB_ACTION_DEFINITIONS = Object.freeze([
  { action: 'browser.open', title: 'Open a page in the browser panel', description: 'Load url; without tabId into a new background tab, whose tabId the result returns for later actions. drivable false means display-only: no further actions there' },
  { action: 'browser.snapshot', title: 'Read the open page', description: 'url, title, visible text, interactive elements with selectors, logged errors, and open tabs with their ids and who opened each; selector reads one part' },
  { action: 'browser.click', title: 'Click on the open page', description: 'By selector, or text for a link or button label' },
  { action: 'browser.type', title: 'Type into the open page', description: 'Type value into selector' },
  { action: 'browser.select', title: 'Select an option on the open page', description: 'One exact option by label or value in the native select matched by selector' },
  { action: 'browser.scroll', title: 'Scroll the open page', description: 'By direction, or to bring selector into view' },
  { action: 'browser.back', title: 'Go back in the browser panel', description: 'No parameters' },
  { action: 'browser.forward', title: 'Go forward in the browser panel', description: 'No parameters' },
  { action: 'browser.inspect', title: 'Read how an element renders', description: 'Computed styles of selector as rendered' },
  { action: 'browser.capture', title: 'Save a screenshot of the page', description: 'Save the visible panel as an image in the project; returns its path to cite in your answer' },
  { action: 'browser.resize', title: 'Change the page viewport', description: 'Lay the page out at viewport; fill uses the whole panel' },
=======
export const OPENCHAMBER_AGENT_TOOL_ACTION_DEFINITIONS = Object.freeze(
  AGENT_EXPOSED_CONTROL_ACTION_DEFINITIONS.filter((definition) => !isScheduleAction(definition)),
);

export const OPENCHAMBER_AGENT_TOOL_ACTIONS = Object.freeze(
  OPENCHAMBER_AGENT_TOOL_ACTION_DEFINITIONS.map(({ action }) => action),
);

export const OPENCHAMBER_SCHEDULE_ACTION_DEFINITIONS = Object.freeze(
  AGENT_EXPOSED_CONTROL_ACTION_DEFINITIONS.filter(isScheduleAction),
);

export const OPENCHAMBER_SCHEDULE_ACTIONS = Object.freeze(
  OPENCHAMBER_SCHEDULE_ACTION_DEFINITIONS.map(({ action }) => action),
);

export const OPENCHAMBER_WEB_ACTION_DEFINITIONS = Object.freeze([
  { action: 'browser.open', title: 'Open a page in the browser panel', description: 'Load url; without tabId into a new background tab, whose tabId the result returns for later actions. drivable false means display-only: no further actions there' },
  { action: 'browser.snapshot', title: 'Read the open page', description: 'url, title, visible text, interactive elements with refs (e12) and selectors, frames and shadow DOM included, logged errors, an open dialog, and open tabs with their ids and who opened each; selector reads one part of the top document. Refs last until the next snapshot' },
  { action: 'browser.click', title: 'Click on the open page', description: 'By ref, selector, or text for a link or button label; a real mouse click' },
  { action: 'browser.hover', title: 'Hover over an element', description: 'Move the mouse over ref, selector or text, for menus and tooltips that open on hover' },
  { action: 'browser.type', title: 'Type into the open page', description: 'Replace the text of the field ref or selector with value; submit presses Enter after' },
  { action: 'browser.press', title: 'Press a key', description: 'key such as Enter, Escape, Tab, ArrowDown, Shift+Tab or Meta+a; into ref or selector when given, else wherever the page has focus' },
  { action: 'browser.select', title: 'Select an option on the open page', description: 'One exact option by label or value in the native select ref or selector' },
  { action: 'browser.drag', title: 'Drag an element onto another', description: 'Press on ref or selector, move to to (a ref) or toSelector, release' },
  { action: 'browser.upload', title: 'Put files in a file input', description: 'paths into the file input ref or selector, which the snapshot lists even when hidden. Only files in this session\'s folder or OpenCode\'s temp folder' },
  { action: 'browser.dialog', title: 'Answer a page dialog', description: 'In a tab the user opened: accept true or false for the alert, confirm or prompt the page opened; value is the prompt answer. Until answered, the page runs nothing else' },
  { action: 'browser.wait', title: 'Wait for the page', description: 'Until text, ref or selector shows on the page, or with gone until it leaves; timeoutMs at most 15000' },
  { action: 'browser.scroll', title: 'Scroll the open page', description: 'By direction, or to bring ref or selector into view' },
  { action: 'browser.back', title: 'Go back in the browser panel', description: 'No parameters' },
  { action: 'browser.forward', title: 'Go forward in the browser panel', description: 'No parameters' },
  { action: 'browser.inspect', title: 'Read how an element renders', description: 'Computed styles of ref or selector as rendered' },
  { action: 'browser.capture', title: 'Save a screenshot of the page', description: 'Save the visible panel as an image in the project; returns its path to cite in your answer' },
  { action: 'browser.resize', title: 'Change the page viewport', description: 'Lay the page out at viewport; fill uses the whole panel' },
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/actions.ts
  { action: 'browser.close', title: 'Close a browser tab', description: 'Close a tab this session opened; without tabId, its most recent one. Never a tab the user opened' },
]);

export const OPENCHAMBER_WEB_ACTIONS = Object.freeze(
  OPENCHAMBER_WEB_ACTION_DEFINITIONS.map(({ action }) => action),
);

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/actions.js
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/actions.js
/**
 * Memory is its own tool for the same reason web is: remembering across
 * sessions is a distinct intent from controlling one, and a shared description
 * would blur both. It also has to switch off cleanly and completely, which a
 * shared schema cannot do.
 *
 * The session already carries an index of stored titles and says to read an
 * entry before acting on it (../session-knowledge/runtime.js), so memory.read
 * takes a title as the index spells it and memory.list is for a missing or
 * stale index.
 */
export const OPENCHAMBER_MEMORY_ACTION_DEFINITIONS = Object.freeze([
  { action: 'memory.read', title: 'Read a stored memory', description: 'Full text of one memory; requires title or memoryId' },
  { action: 'memory.list', title: 'List stored memories', description: 'Titles, when the session index is missing, stale or cut short' },
  { action: 'memory.save', title: 'Remember something', description: 'Requires title, body, scope. Saving the same thing updates it; memoryId rewrites that entry, to correct one or merge several into it' },
  { action: 'memory.delete', title: 'Forget a memory', description: 'For a memory that turned out wrong or obsolete; requires memoryId and scope' },
]);

export const OPENCHAMBER_MEMORY_ACTIONS = Object.freeze(
  OPENCHAMBER_MEMORY_ACTION_DEFINITIONS.map(({ action }) => action),
);
=======
export const OPENCHAMBER_MEMORY_ACTION_DEFINITIONS = Object.freeze([
  { action: 'memory.read', title: 'Read a stored memory', description: 'Full text of one memory; requires title or memoryId' },
  { action: 'memory.list', title: 'List stored memories', description: 'Titles, when the session index is missing, stale or cut short' },
  { action: 'memory.save', title: 'Remember something', description: 'Requires title, body, scope. Saving the same thing updates it; memoryId rewrites that entry, to correct one or merge several into it' },
  { action: 'memory.delete', title: 'Forget a memory', description: 'For a memory that turned out wrong or obsolete; requires memoryId and scope' },
]);

export const OPENCHAMBER_MEMORY_ACTIONS = Object.freeze(
  OPENCHAMBER_MEMORY_ACTION_DEFINITIONS.map(({ action }) => action),
);
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/actions.ts

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/actions.js
/**
 * Project knowledge: keeping the Notes, Todos and Plans the user sees in the
 * panel is a distinct intent from running sessions. One small vocabulary with
 * `kind` keeps the bare verbs unambiguous, the way memory's are. Plans are
 * markdown files, so reading one and small edits use the agent's own file
 * tools on the path list gives.
 */
const OPENCHAMBER_KNOWLEDGE_ACTION_DEFINITIONS = Object.freeze([
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/actions.js
/**
 * Project knowledge is its own tool: keeping the Notes, Todos and Plans the
 * user sees in the panel is a distinct intent from running sessions, and the
 * user switches it off on its own without losing session control. One small
 * vocabulary with `kind` keeps the bare verbs unambiguous, the way memory's are.
 * Plans are markdown files, so reading one and small edits use the agent's
 * own file tools on the path list gives.
 */
export const OPENCHAMBER_KNOWLEDGE_ACTION_DEFINITIONS = Object.freeze([
=======
export const OPENCHAMBER_KNOWLEDGE_ACTION_DEFINITIONS = Object.freeze([
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/actions.ts
  { action: 'knowledge.list', title: 'List project knowledge', description: 'Notes with text, todos with state and links, plans with their file paths and session. Optional planId and ready filters. List before adding, to avoid duplicates' },
  { action: 'knowledge.save', title: 'Save project knowledge', description: 'Requires kind and body; with id it replaces. A plan body is the whole markdown, and the answer gives its path. An update may send only the fields it changes: completed, planId or dependsOn; sessionId on a plan, without body' },
  { action: 'knowledge.delete', title: 'Delete project knowledge', description: 'Requires kind and id' },
  { action: 'knowledge.show', title: 'Show a plan to the user', description: 'Open a plan for the user to read, comment on and send to a session; requires kind plan and id' },
]);

export const OPENCHAMBER_KNOWLEDGE_ACTIONS = Object.freeze(
  OPENCHAMBER_KNOWLEDGE_ACTION_DEFINITIONS.map(({ action }) => action),
);

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/actions.js
/**
 * Notify is its own tool so it can stay off by default and disappear
 * completely: an agent that can page the user is a choice the user makes.
 */
const OPENCHAMBER_NOTIFY_ACTION_DEFINITIONS = Object.freeze([
  { action: 'notify.send', title: 'Notify the user', description: 'Send the user a notification; requires title, body is optional. By default it appears only while the user is away from OhPiChamber; set showWhenFocused only when it cannot wait' },
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/actions.js
/**
 * Notify is its own tool so it can stay off by default and disappear
 * completely: an agent that can page the user is a choice the user makes.
 */
export const OPENCHAMBER_NOTIFY_ACTION_DEFINITIONS = Object.freeze([
  { action: 'notify.send', title: 'Notify the user', description: 'Requires title' },
=======
export const OPENCHAMBER_NOTIFY_ACTION_DEFINITIONS = Object.freeze([
  { action: 'notify.send', title: 'Notify the user', description: 'Requires title' },
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/actions.ts
]);

export const OPENCHAMBER_NOTIFY_ACTIONS = Object.freeze(
  OPENCHAMBER_NOTIFY_ACTION_DEFINITIONS.map(({ action }) => action),
);

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/actions.js
/**
 * Render draws a page into the chat. The page itself travels in the call's
 * input, which the chat already stores and syncs, so the action only checks it.
 */
const OPENCHAMBER_RENDER_ACTION_DEFINITIONS = Object.freeze([
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/actions.js
/**
 * Render is its own tool: a page drawn into the chat is a distinct intent from
 * any of the others, and its long layout guidance should cost context only for
 * users who keep it on. The page itself travels in the call's input, which the
 * chat already stores and syncs, so the action only checks it.
 */
export const OPENCHAMBER_RENDER_ACTION_DEFINITIONS = Object.freeze([
=======
export const OPENCHAMBER_RENDER_ACTION_DEFINITIONS = Object.freeze([
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/actions.ts
  { action: 'render.page', title: 'Show a page', description: 'Requires html and title' },
]);

export const OPENCHAMBER_RENDER_ACTIONS = Object.freeze(
  OPENCHAMBER_RENDER_ACTION_DEFINITIONS.map(({ action }) => action),
);

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/actions.js
/**
 * Workflows fan a large task out to many agents. They ship dark behind
 * OPENCHAMBER_WORKFLOWS_ENABLE; a build without the runtime answers 503.
 */
const OPENCHAMBER_WORKFLOW_ACTION_DEFINITIONS = Object.freeze([
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/actions.js
/**
 * Image generation is its own tool: off by default, and while on it calls a
 * second model the user chose, which costs money of its own.
 */
export const OPENCHAMBER_IMAGE_ACTION_DEFINITIONS = Object.freeze([
  { action: 'image.generate', title: 'Generate an image', description: 'Requires prompt' },
]);

export const OPENCHAMBER_IMAGE_ACTIONS = Object.freeze(
  OPENCHAMBER_IMAGE_ACTION_DEFINITIONS.map(({ action }) => action),
);

/**
 * Asking for a secret is its own tool: it is the one action that takes a
 * credential from the user, so it can be switched off alone. `secret.run`
 * hands the values to one command's environment; `secret.request` writes one
 * to a private file and only its path reaches the agent.
 */
export const OPENCHAMBER_SECRET_ACTION_DEFINITIONS = Object.freeze([
  { action: 'secret.run', title: 'Run with secrets', description: 'Requires program, reason and inputs; optional args and timeoutMs' },
  { action: 'secret.request', title: 'Ask for a secret', description: 'Requires label and reason' },
  { action: 'secret.forget', title: 'Forget remembered secrets', description: 'No inputs' },
]);

export const OPENCHAMBER_SECRET_ACTIONS = Object.freeze(
  OPENCHAMBER_SECRET_ACTION_DEFINITIONS.map(({ action }) => action),
);

/**
 * Usage is its own tool: reading provider quotas is a distinct intent from
 * the others, it is off until the user turns it on, and each read asks every
 * configured provider, so it has to disappear completely when off.
 */
export const OPENCHAMBER_USAGE_ACTION_DEFINITIONS = Object.freeze([
  { action: 'usage.read', title: 'Read usage limits', description: 'Usage windows, percentages and resets of every configured provider, as Settings > Usage shows them; providerId reads one' },
]);

export const OPENCHAMBER_USAGE_ACTIONS = Object.freeze(
  OPENCHAMBER_USAGE_ACTION_DEFINITIONS.map(({ action }) => action),
);

/**
 * Workflows are their own tool: fanning a large task out to many agents is a
 * distinct intent with its own scripting guidance, and the tool is off until
 * the user turns it on, so it has to disappear completely.
 */
export const OPENCHAMBER_WORKFLOW_ACTION_DEFINITIONS = Object.freeze([
=======
export const OPENCHAMBER_IMAGE_ACTION_DEFINITIONS = Object.freeze([
  { action: 'image.generate', title: 'Generate an image', description: 'Requires prompt' },
]);

export const OPENCHAMBER_IMAGE_ACTIONS = Object.freeze(
  OPENCHAMBER_IMAGE_ACTION_DEFINITIONS.map(({ action }) => action),
);

export const OPENCHAMBER_SECRET_ACTION_DEFINITIONS = Object.freeze([
  { action: 'secret.run', title: 'Run with secrets', description: 'Requires program, reason and inputs; optional args and timeoutMs' },
  { action: 'secret.request', title: 'Ask for a secret', description: 'Requires label and reason' },
  { action: 'secret.forget', title: 'Forget remembered secrets', description: 'No inputs' },
]);

export const OPENCHAMBER_SECRET_ACTIONS = Object.freeze(
  OPENCHAMBER_SECRET_ACTION_DEFINITIONS.map(({ action }) => action),
);

export const OPENCHAMBER_USAGE_ACTION_DEFINITIONS = Object.freeze([
  { action: 'usage.read', title: 'Read usage limits', description: 'Usage windows, percentages and resets of every configured provider, as Settings > Usage shows them; providerId reads one' },
]);

export const OPENCHAMBER_USAGE_ACTIONS = Object.freeze(
  OPENCHAMBER_USAGE_ACTION_DEFINITIONS.map(({ action }) => action),
);

export const OPENCHAMBER_TERMINAL_ACTION_DEFINITIONS = Object.freeze([
  { action: 'terminal.list', title: 'List terminals', description: "This folder's terminal panels: sessionId, cwd, status, createdAt, mode and purpose, without their output; directory lists another folder's" },
  { action: 'terminal.read', title: 'Read a terminal', description: 'The output a terminal from terminal.list printed, as plain text end-aligned to a line; maxBytes caps it, truncated says older output was dropped and retainedBytes how much this server still holds' },
]);

export const OPENCHAMBER_TERMINAL_ACTIONS = Object.freeze(
  OPENCHAMBER_TERMINAL_ACTION_DEFINITIONS.map(({ action }) => action),
);

export const OPENCHAMBER_WORKFLOW_ACTION_DEFINITIONS = Object.freeze([
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/actions.ts
  { action: 'workflow.check', title: 'Check a workflow', description: 'Compile script, or a saved workflow by name, without running it: its name, description and phases' },
  { action: 'workflow.run', title: 'Propose a workflow run', description: 'script, or name of a saved workflow, with optional args. The run waits for the user to approve it in the chat, or starts at once when their settings allow that; the report arrives here as a message when the run ends. Returns runId and state at once' },
  { action: 'workflow.status', title: 'Check a workflow run', description: 'Phases, agents with their state, key and session id, recent log lines and a result preview of runId' },
  { action: 'workflow.result', title: 'Read a workflow result', description: "The whole result of runId; with agent (its key or session id) that agent's prompt and full answer" },
  { action: 'workflow.stop', title: 'Stop a workflow run', description: 'Stop runId; its running agents are interrupted' },
  { action: 'workflow.resume', title: 'Resume a workflow run', description: 'Run a stopped or failed runId again: agents asked the same as before return their saved answer, the rest run' },
  { action: 'workflow.save', title: 'Save a workflow', description: 'Save script as .openchamber/workflows/<meta.name>.js in this project, to run later by name; overwrite replaces one' },
  { action: 'workflow.list', title: 'List workflows', description: "This project's saved workflows and this session's runs" },
]);


export const WORKFLOW_ANSWER_TOOL = 'openchamber_workflow_answer';

const OPENCHAMBER_WORKFLOW_ANSWER_ACTION_DEFINITIONS = Object.freeze([
  { action: 'workflow.answer', title: 'Submit a workflow answer', description: 'Only for a workflow agent whose prompt asks for it: answer, a JSON value matching the schema in that prompt. Checked on the spot; a mismatch says what to fix' },
]);

const OPENCHAMBER_WORKFLOW_ANSWER_ACTIONS = Object.freeze(
  OPENCHAMBER_WORKFLOW_ANSWER_ACTION_DEFINITIONS.map(({ action }) => action),
);

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/actions.js
export const OPENCHAMBER_WORKFLOW_ACTIONS = Object.freeze([
  ...OPENCHAMBER_WORKFLOW_ACTION_DEFINITIONS.map(({ action }) => action),
  ...OPENCHAMBER_WORKFLOW_ANSWER_ACTIONS,
]);

/**
 * What the managed `openchamber` tool may ask for. Scheduling stays in this
 * tool: the Host declares one control tool and moving schedule actions to a
 * second name would leave them unreachable. Workflow actions join it because
 * the Agent Service exposes no separate workflow tool; knowledge has its own
 * tool (`openchamber_knowledge`), so its verbs stay out and a bare `delete`
 * keeps meaning schedule.delete here.
 */
const OPENCHAMBER_AGENT_TOOL_ACTION_DEFINITIONS = Object.freeze([
  ...AGENT_EXPOSED_CONTROL_ACTION_DEFINITIONS,
  // Workflow actions ride this one tool: the Agent Service's managed catalog
  // has no separate workflow tool, and without them an agent could not
  // propose, follow or answer a run. The runtime answers 503 when the feature
  // is off.
  ...OPENCHAMBER_WORKFLOW_ACTION_DEFINITIONS,
]);

export const OPENCHAMBER_AGENT_TOOL_ACTIONS = Object.freeze(
  OPENCHAMBER_AGENT_TOOL_ACTION_DEFINITIONS.map(({ action }) => action),
);

/**
 * Which actions each managed tool may ask for.
 *
 * The callback needs this because models routinely drop the namespace: asked
 * for `memory.read` from a tool already called `openchamber_memory`, they send
 * `read`, since the tool's own name appears to have said "memory" already. The
 * name is unambiguous inside one tool's action set even when it is not across
 * all of them (`delete` belongs to both schedule and memory), so resolution
 * starts from the tool that asked.
 */
const ACTIONS_BY_TOOL = Object.freeze({
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/actions.js
/**
 * Which actions each managed tool may ask for.
 *
 * The callback needs this because models routinely drop the namespace: asked
 * for `memory.read` from a tool already called `openchamber_memory`, they send
 * `read`, since the tool's own name appears to have said "memory" already. The
 * name is unambiguous inside one tool's action set even when it is not across
 * all of them (`delete` belongs to both schedule and memory), so resolution
 * starts from the tool that asked.
 */
const ACTIONS_BY_TOOL = Object.freeze({
=======
const ACTIONS_BY_TOOL: Readonly<Record<string, readonly string[]>> = Object.freeze({
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/actions.ts
  openchamber: OPENCHAMBER_AGENT_TOOL_ACTIONS,
  openchamber_web: OPENCHAMBER_WEB_ACTIONS,
  openchamber_knowledge: OPENCHAMBER_KNOWLEDGE_ACTIONS,
  openchamber_notify: OPENCHAMBER_NOTIFY_ACTIONS,
  openchamber_render: OPENCHAMBER_RENDER_ACTIONS,
<<<<<<< HEAD:packages/web/server/lib/openchamber-control/actions.js
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/actions.js
  openchamber_image: OPENCHAMBER_IMAGE_ACTIONS,
  openchamber_secret: OPENCHAMBER_SECRET_ACTIONS,
  openchamber_usage: OPENCHAMBER_USAGE_ACTIONS,
=======
  openchamber_image: OPENCHAMBER_IMAGE_ACTIONS,
  openchamber_secret: OPENCHAMBER_SECRET_ACTIONS,
  openchamber_usage: OPENCHAMBER_USAGE_ACTIONS,
  openchamber_terminal: OPENCHAMBER_TERMINAL_ACTIONS,
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/actions.ts
  openchamber_workflow: OPENCHAMBER_WORKFLOW_ACTIONS,
  [WORKFLOW_ANSWER_TOOL]: OPENCHAMBER_WORKFLOW_ANSWER_ACTIONS,
});

const bareName = (action: string) => {
  const separator = action.indexOf('.');
  return separator === -1 ? action : action.slice(separator + 1);
};

const uniqueMatch = (candidates: readonly string[], requested: string) => {
  const matches = candidates.filter((candidate) => bareName(candidate) === requested);
  return matches.length === 1 ? matches[0] : null;
};

export const resolveAgentToolAction = (requested: string | null, toolName: string | null) => {
  const value = requested?.trim() ?? '';
  const scoped = ACTIONS_BY_TOOL[toolName ?? 'null'] ?? null;
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

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/actions.js
/** Everything the callback route will dispatch, whichever tool asked. */

||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/actions.js
/** Everything the callback route will dispatch, whichever tool asked. */
=======
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/actions.ts
export const OPENCHAMBER_ALL_ACTIONS = Object.freeze([
  ...OPENCHAMBER_CONTROL_ACTIONS,
  ...OPENCHAMBER_WEB_ACTIONS,
  ...OPENCHAMBER_KNOWLEDGE_ACTIONS,
  ...OPENCHAMBER_NOTIFY_ACTIONS,
  ...OPENCHAMBER_RENDER_ACTIONS,
<<<<<<< HEAD:packages/web/server/lib/openchamber-control/actions.js
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/actions.js
  ...OPENCHAMBER_IMAGE_ACTIONS,
  ...OPENCHAMBER_SECRET_ACTIONS,
  ...OPENCHAMBER_USAGE_ACTIONS,
=======
  ...OPENCHAMBER_IMAGE_ACTIONS,
  ...OPENCHAMBER_SECRET_ACTIONS,
  ...OPENCHAMBER_USAGE_ACTIONS,
  ...OPENCHAMBER_TERMINAL_ACTIONS,
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/actions.ts
  ...OPENCHAMBER_WORKFLOW_ACTIONS,
  ...OPENCHAMBER_WORKFLOW_ANSWER_ACTIONS,
]);
