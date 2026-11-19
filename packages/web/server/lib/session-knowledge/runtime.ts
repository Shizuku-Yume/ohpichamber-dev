<<<<<<< HEAD:packages/web/server/lib/session-knowledge/runtime.js
/**
 * What a session must be told about the project's knowledge, and whether it has
 * been told yet.
 *
 * One owner, three moments. The block is attached to an outgoing prompt when
 * there is one (a message from the UI, a scheduled task, a session the agent
 * dispatched) and re-sent on its own after compaction, when there is no message
 * to attach it to. The decision is the same in every case, so it lives here
 * rather than in each sender — the client used to own it, which meant sessions
 * started without a UI got nothing at all.
 *
 * What was delivered is recorded in the session's own metadata rather than in
 * the browser. A signature held in a tab is lost when the tab closes, and worse,
 * it survives compaction: the tab goes on believing the agent still has context
 * that has just been summarised away.
 *
 * Upstream writes the same knowledge into OpenCode's session instruction
 * entries. That mechanism does not exist in OMP: the Agent Service carries the
 * block as part of the prompt, and OpenChamber's own metadata records what was
 * delivered. The text and guidance below are upstream's; the delivery stays
 * ours.
 */
import { isRecord } from '../shared/guards.js';
||||||| bc50ba56aa:packages/web/server/lib/session-knowledge/runtime.js
/**
 * What a session must be told about the project's knowledge.
 *
 * The text lives in OpenCode as the session's instruction entries
 * (`/api/experimental/session/:id/instructions/entries/:key`). OpenCode keeps
 * them with the session: the first values go into the system prompt, a value
 * that changes or goes away is announced to the agent at its next step, and
 * compaction, revert and fork keep them. So OpenChamber holds no record of what
 * a session was told; every sender writes what the session should carry now,
 * right before its message, and OpenCode tells the agent only what changed.
 *
 * One owner for every sender (a message from the UI, the queue, a scheduled
 * task, a session the agent dispatched): sessions started without a UI must
 * carry the same context as the ones a tab sends to.
 */
import { isRecord } from '../shared/guards.js';
import { UI_BLOCKS_GUIDANCE } from './ui-blocks-guidance.js';
=======
import type {
  Checkout,
  GuidanceOptions,
  KnowledgeEntries,
  KnowledgeInput,
  KnowledgeNote,
  KnowledgePlan,
  KnowledgeSummary,
  MemoryIndex,
  MemoryIndexMeasurement,
  MemoryTitle,
  SessionKnowledgeDependencies,
  SessionPins,
} from './contracts.js';
import { hasMessage, isNonEmptyString, isOpenChamberMetadata, isSessionMetadata, isStoredPins } from './guards.js';
import { UI_BLOCKS_GUIDANCE } from './ui-blocks-guidance.js';
>>>>>>> upstream/main:packages/web/server/lib/session-knowledge/runtime.ts

const KNOWLEDGE_METADATA_KEY = 'knowledge_context_delivered';
const PINS_METADATA_KEY = 'project_context_pins';

<<<<<<< HEAD:packages/web/server/lib/session-knowledge/runtime.js
/**
 * Budget per source: pins and guidance travel together, but a huge pinned plan
 * must not crowd out the guidance. Anything past a source's budget is cut,
 * loudly.
 */
||||||| bc50ba56aa:packages/web/server/lib/session-knowledge/runtime.js
/**
 * One entry per source, so a memory saved mid-session re-sends the memory
 * index and nothing else. OpenCode orders entries by key.
 */
export const KNOWLEDGE_ENTRY_KEYS = {
  checkout: 'openchamber.checkout',
  pinned: 'openchamber.pinned',
  memory: 'openchamber.memory',
  guidance: 'openchamber.guidance',
  responseStyle: 'openchamber.response-style',
  extensions: 'openchamber.extensions',
};

/** Budget for each entry; anything past it is cut, loudly. */
=======
export const KNOWLEDGE_ENTRY_KEYS = {
  checkout: 'openchamber.checkout',
  pinned: 'openchamber.pinned',
  memory: 'openchamber.memory',
  guidance: 'openchamber.guidance',
  responseStyle: 'openchamber.response-style',
  extensions: 'openchamber.extensions',
} as const;

>>>>>>> upstream/main:packages/web/server/lib/session-knowledge/runtime.ts
const KNOWLEDGE_MAX_LENGTH = 8000;

const truncate = (value: string) => (
  value.length <= KNOWLEDGE_MAX_LENGTH
    ? value
    : `${value.slice(0, KNOWLEDGE_MAX_LENGTH - 1)}…\n\n(truncated)`
);

<<<<<<< HEAD:packages/web/server/lib/session-knowledge/runtime.js
/**
 * Identity of the pins the session should be carrying, content revisions
 * included: editing a pinned note must re-send it, not merely renaming one.
 * Memory and session linking are model-side OMP features; they add no text.
 */
export const buildKnowledgeSignature = ({ notes, plans }) => {
  const parts = [
    ...notes.map((note) => `n:${note.id}:${note.updatedAt}`),
    ...plans.map((plan) => `p:${plan.id}:${plan.title}`),
  ];
  return parts.length === 0 ? '' : parts.sort().join('|');
||||||| bc50ba56aa:packages/web/server/lib/session-knowledge/runtime.js
/**
 * Where the session works, as the agent cannot see it for itself between two
 * messages: another session sharing the checkout may have switched the branch,
 * and the agent would go on editing that session's work. The directory is
 * named too, so a session moved to another worktree reads as a move.
 */
const describeCheckout = ({ directory, branch, placeholder = false }) => {
  if (!branch) return `This session works in \`${directory}\`, with no branch checked out.`;
  const where = `This session works in \`${directory}\`, on branch \`${branch}\`.`;
  return placeholder ? `${where} ${placeholderBranchGuidance(branch)}` : where;
=======
const describeCheckout = ({ directory, branch, placeholder = false }: Checkout) => {
  if (!branch) return `This session works in \`${directory}\`, with no branch checked out.`;
  const where = `This session works in \`${directory}\`, on branch \`${branch}\`.`;
  return placeholder ? `${where} ${placeholderBranchGuidance(branch)}` : where;
>>>>>>> upstream/main:packages/web/server/lib/session-knowledge/runtime.ts
};

<<<<<<< HEAD:packages/web/server/lib/session-knowledge/runtime.js
||||||| bc50ba56aa:packages/web/server/lib/session-knowledge/runtime.js
/**
 * A branch OpenChamber named with a placeholder (Quick worktree's
 * `agile-chipmunk`) and never pushed is renamed after the task by the agent,
 * at the moment it names the task. Said here, with the branch, and only while
 * it holds: once renamed, the entry changes and OpenCode tells the agent so.
 * `work.name` does the rename (its `branch`) and refuses to name the task
 * without it, so the two cannot drift apart; a separate `git branch -m` step
 * was the one weaker models dropped.
 */
const placeholderBranchGuidance = (branch) => `Its name \`${branch}\` is a placeholder OpenChamber generated, not one the user chose,`
  + ' and it is not pushed yet. Name the task with work.name, passing branch too: work.name renames the branch to it.'
  + " Follow the naming the repository's other branches use (`git branch -a`); with none, `<type>/<short-kebab-case>`"
  + ' with the conventional commit types, such as `fix/login-timeout`. No tool or app prefix.'
  + ' A placeholder made for an issue (`issue-180-merry-salamander`) keeps the issue number: work.name puts `180-` in front of'
  + " your name's last segment (`fix/180-login-timeout`) unless your name already has it.";

/** Newest first: when the index outgrows its budget, the oldest titles drop. */
const memoryTitleLines = (entries) => entries
  .slice()
  .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
  .map((entry) => `- ${entry.title}`);

/**
 * When to save, stated in every session where memory is on, and only here. The
 * tool description alone is read only when the agent already means to call it,
 * so agents told nothing here saved only when the user said "remember".
 */
const MEMORY_SAVE_GUIDANCE = 'The openchamber_memory tool keeps memory across sessions. Save to it in the'
  + ' moment, without asking, when the user corrects how you work or states a'
  + ' preference, confirms a non-obvious approach worked, or you learn a project fact'
  + ' that took real effort to find. A project fact an agent would learn from the code,'
  + ' docs and skills, including why and whether it may change, needs no entry; the'
  + ' user\'s corrections and preferences always do. A decision is saved once it is made,'
  + ' never while it is still being discussed, and what the current task\'s own code or'
  + ' commit records needs no entry. Save before your final reply and'
  + ' mention the save there briefly: the app shows only the text after a turn\'s last'
  + ' tool call as the reply.';

/**
 * When to link, stated in every session that has the `openchamber` tool, and
 * only here. Stated only in the action's description, an agent given an issue
 * to investigate never opened the tool and so never linked it.
 */
export const SESSION_LINK_GUIDANCE = "Link to this session with the openchamber tool's session.link,"
  + " as soon as you know it, each issue or pull or merge request the user gives you to"
  + " work on, fix, investigate or review, that you open for this work, or that the work"
  + " resolves. One merely mentioned in passing stays unlinked. The reply need not say you linked it.";

/**
 * When to name the task, stated with the linking guidance for the same reason:
 * an action only its description mentions is never called. The sidebar lists
 * a task under this name, so it is set early and changed only with the task.
 */
export const WORK_NAME_GUIDANCE = "Name the task with the openchamber tool's work.name as soon as it is clear what"
  + " the task is: at most 4 words naming the task itself, such as \"Login timeout fix\" or \"Sidebar task rows\","
  + " never a step of it. Write it in the language of the user's latest message, even when you work in"
  + " English: \"Таймаут входу\" for a user who writes Ukrainian. A branch name stays in English. Rename it only when the work"
  + " becomes a different task; finishing a step, fixing something on the way or a follow-up within the"
  + " same task is no reason. A name the user gave stays.";

/**
 * The managed tools the chat draws from their own call stay direct tools; the
 * rest sit behind Code Mode (../agent-tool/runtime.js). OpenCode's Code Mode
 * teaches the model that tools live in `execute`'s catalog, and a model that
 * called a direct tool from a script got "Unknown tool" and concluded the tool
 * did not exist. Names only the direct tools this session has.
 */
export const directToolsGuidance = (names) => (names.length === 1
  ? `${names[0]} is a direct tool call: never call it from inside a Code Mode execute script, where it does not exist.`
  : `${names.join(', ')} are direct tool calls: never call them from inside a Code Mode execute script, where they do not exist.`);

/**
 * When to draw a page, stated in every session that has the
 * `openchamber_render` tool, and only here. Stated only in the tool
 * description, it went unread: asked for a breakdown of lines of code per
 * package, an agent answered with a list and drew the chart only when asked.
 * Data and structure go to UI blocks (`UI_BLOCKS_GUIDANCE`), which look the
 * same whatever model writes them; a page is left with what the block
 * catalog cannot draw. Interface mockups are named on their own, because a
 * proposed UI change is where a page helps most.
 */
export const RENDER_PAGE_GUIDANCE = "The openchamber_render tool draws an HTML page inline in the chat, above your reply."
  + " Use it for what UI blocks cannot show: how something looks (a proposed interface change, before and after, layout options),"
  + " or a custom drawing the block components do not cover. Never for data: charts, tables and comparisons are UI blocks, even when the user asks to see them."
  + " At most one page per answer."
  + " A mockup of the user's own project takes its look from that project's code (theme tokens, CSS variables, styles), not from OpenChamber's theme."
  + " Draw a page that only shows right before your final reply, and keep the reply to what the page does not show."
  + " A choice that sets the direction of the work goes through ui with awaitAnswer (see UI blocks);"
  + " a choice between visual designs, through an html page with awaitAnswer.";

/**
 * Titles only for memory, never bodies: an index carrying full text grows
 * without bound until it crowds out the conversation it was meant to inform.
 *
 * A full project store's titles alone outgrow the entry budget, so the index
 * is fitted to it whole lines at a time, newest first per scope, and says how
 * many titles were left out. Cutting the rendered text instead dropped the
 * newest entries, the ones most likely to matter, mid-title and unannounced.
 */
const buildMemoryBlock = ({ global, project, enabled = false, complete = false }) => {
  if (global.length === 0 && project.length === 0) {
    if (!enabled) return '';
    // "Empty" only when both scopes loaded: a failed read is not an empty store.
    return complete
      ? `${MEMORY_SAVE_GUIDANCE}\n\nNothing is stored yet.`
      : MEMORY_SAVE_GUIDANCE;
  }

  const preamble = [
    ...(enabled ? [MEMORY_SAVE_GUIDANCE] : []),
    'Stored memory from earlier sessions, titles only, newest first. A title leaves out the'
      + ' conditions and reasons that decide how a memory applies, a self-explanatory'
      + ' one most of all: read each entry that bears on the task with openchamber_memory'
      + ' before acting on it, once per conversation, again only after your context was'
      + ' summarized. Memory was true when written; verify the files, flags and'
      + ' commands it names.',
  ].join('\n\n');
  const scopes = [
    { heading: '### About the user', lines: memoryTitleLines(global) },
    { heading: '### About this project', lines: memoryTitleLines(project) },
  ].filter((scope) => scope.lines.length > 0);

  const OMITTED_NOTE_RESERVE = 120;
  let budget = KNOWLEDGE_MAX_LENGTH - preamble.length - OMITTED_NOTE_RESERVE
    - scopes.reduce((sum, scope) => sum + scope.heading.length + 4, 0);
  let omitted = 0;
  const sections = scopes.map((scope) => {
    const kept = [];
    for (const line of scope.lines) {
      if (line.length + 1 > budget) {
        // Everything older goes too, so a short old title never displaces a long new one.
        budget = 0;
        omitted += 1;
        continue;
      }
      kept.push(line);
      budget -= line.length + 1;
    }
    return kept.length > 0 ? `${scope.heading}\n\n${kept.join('\n')}` : '';
  }).filter(Boolean);

  return [
    preamble,
    ...sections,
    ...(omitted > 0 ? [`${omitted} older titles did not fit here; memory.list gives every title.`] : []),
  ].join('\n\n');
};
=======
const placeholderBranchGuidance = (branch: string) => `Its name \`${branch}\` is a placeholder OpenChamber generated, not one the user chose,`
  + ' and it is not pushed yet. Name the task with work.name, passing branch too: work.name renames the branch to it.'
  + " Follow the naming the repository's other branches use (`git branch -a`); with none, `<type>/<short-kebab-case>`"
  + ' with the conventional commit types, such as `fix/login-timeout`. No tool or app prefix.'
  + ' A placeholder made for an issue (`issue-180-merry-salamander`) keeps the issue number: work.name puts `180-` in front of'
  + " your name's last segment (`fix/180-login-timeout`) unless your name already has it.";

const memoryTitleLines = (entries: MemoryTitle[]) => entries
  .slice()
  .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
  .map((entry) => `- ${entry.title}`);

const MEMORY_SAVE_GUIDANCE = 'The openchamber_memory tool keeps memory across sessions. Save to it in the'
  + ' moment, without asking, when the user corrects how you work or states a'
  + ' preference, or confirms a non-obvious approach worked. Project knowledge (a'
  + ' decision and its reason, a rule, a recipe, a gotcha that took real effort to find)'
  + ' goes where the project keeps agent instructions, when it has such a place'
  + ' (AGENTS.md, skills, module docs): add it to the matching file as part of your work'
  + ' and say so, since every agent and teammate reads those and memory reaches only this'
  + ' user. Memory takes project knowledge only when the project has no such place or it'
  + ' must stay out of the repository: people, business, private setups. What the code,'
  + ' docs, skills or the current commit already hold needs no entry, and unfinished'
  + ' work goes to the project\'s todos and plans. A decision is saved once it is made,'
  + ' never while it is still being discussed. Save before your final reply and'
  + ' mention the save there briefly: the app shows only the text after a turn\'s last'
  + ' tool call as the reply.';

export const SESSION_LINK_GUIDANCE = "Link to this session with session.link (tools.openchamber inside a Code Mode execute script),"
  + " as soon as you know it, each issue or pull or merge request the user gives you to"
  + " work on, fix, investigate or review, that you open for this work, or that the work"
  + " resolves. One merely mentioned in passing stays unlinked. The reply need not say you linked it.";

export const WORK_NAME_GUIDANCE = "Name the task with work.name (tools.openchamber inside execute) as soon as it is clear what"
  + " the task is: at most 4 words naming the task itself, such as \"Login timeout fix\" or \"Sidebar task rows\","
  + " never a step of it. Write it in the language of the user's latest message, even when you work in"
  + " English: \"Таймаут входу\" for a user who writes Ukrainian. A branch name stays in English. Rename it only when the work"
  + " becomes a different task; finishing a step, fixing something on the way or a follow-up within the"
  + " same task is no reason. A name the user gave stays.";

export const DISPATCH_GUIDANCE = "To hand work to another session, call tools.openchamber inside execute:"
  + " session.create starts a new session, session.send gives a task to an existing one (session.list finds it by title)."
  + " A session the user wants for themselves, to follow and talk to, is theirs: create it without ownWork. A session you start"
  + " to get part of the work done and collect its answer, also when the user told you to hand that work off, takes"
  + " ownWork: true: it nests under you, the user does not talk to it, and its answer comes back to you. Smaller pieces"
  + " of your own task go to your subagent tool.";

export const directToolsGuidance = (names: string[]) => (names.length === 1
  ? `${names[0]} is a direct tool call: never call it from inside a Code Mode execute script, where it does not exist.`
  : `${names.join(', ')} are direct tool calls: never call them from inside a Code Mode execute script, where they do not exist.`);

export const RENDER_PAGE_GUIDANCE = "The openchamber_render tool draws an HTML page inline in the chat, above your reply."
  + " Use it for what UI blocks cannot show: how something looks (a proposed interface change, before and after, layout options),"
  + " or a custom drawing the block components do not cover. Never for data: charts, tables and comparisons are UI blocks, even when the user asks to see them."
  + " At most one page per answer."
  + " A mockup of the user's own project takes its look from that project's code (theme tokens, CSS variables, styles), not from OpenChamber's theme."
  + " Draw a page that only shows right before your final reply, and keep the reply to what the page does not show."
  + " A choice that sets the direction of the work goes through ui with awaitAnswer (see UI blocks);"
  + " a choice between visual designs, through an html page with awaitAnswer."
  + " When the rest of the task does not wait on the choice, send answerLater instead of awaitAnswer and keep working: the answer arrives later as a message.";

const buildMemoryBlock = ({ global, project, enabled = false, complete = false }: MemoryIndex) => {
  if (global.length === 0 && project.length === 0) {
    if (!enabled) return '';
    return complete
      ? `${MEMORY_SAVE_GUIDANCE}\n\nNothing is stored yet.`
      : MEMORY_SAVE_GUIDANCE;
  }

  const preamble = [
    ...(enabled ? [MEMORY_SAVE_GUIDANCE] : []),
    'Stored memory from earlier sessions, titles only, newest first. A title leaves out the'
      + ' conditions and reasons that decide how a memory applies, a self-explanatory'
      + ' one most of all: read each entry that bears on the task with openchamber_memory'
      + ' before acting on it, once per conversation, again only after your context was'
      + ' summarized. Memory was true when written; verify the files, flags and'
      + ' commands it names.',
  ].join('\n\n');
  const scopes = [
    { heading: '### About the user', lines: memoryTitleLines(global) },
    { heading: '### About this project', lines: memoryTitleLines(project) },
  ].filter((scope) => scope.lines.length > 0);

  const OMITTED_NOTE_RESERVE = 120;
  let budget = KNOWLEDGE_MAX_LENGTH - preamble.length - OMITTED_NOTE_RESERVE
    - scopes.reduce((sum, scope) => sum + scope.heading.length + 4, 0);
  let omitted = 0;
  const sections = scopes.map((scope) => {
    const kept = [];
    for (const line of scope.lines) {
      if (line.length + 1 > budget) {
        budget = 0;
        omitted += 1;
        continue;
      }
      kept.push(line);
      budget -= line.length + 1;
    }
    return kept.length > 0 ? `${scope.heading}\n\n${kept.join('\n')}` : '';
  }).filter(Boolean);

  return [
    preamble,
    ...sections,
    ...(omitted > 0 ? [`${omitted} older titles did not fit here; memory.list gives every title.`] : []),
  ].join('\n\n');
};
>>>>>>> upstream/main:packages/web/server/lib/session-knowledge/runtime.ts

export const measureMemoryIndex = ({ global, project }: Pick<MemoryIndex, 'global' | 'project'>): MemoryIndexMeasurement => {
  const block = buildMemoryBlock({ global, project, enabled: true, complete: true });
  const omitted = Number(/(\d+) older titles did not fit here/.exec(block)?.[1] ?? 0);
  return { budget: KNOWLEDGE_MAX_LENGTH, used: block.length, omitted };
};

const buildPinnedBlock = ({ notes, plans }: Pick<KnowledgeInput, 'notes' | 'plans'>) => {
  const sections = [];
  if (notes.length > 0) {
    const rendered = notes
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((note) => `- ${note.body.trim()}`)
      .join('\n');
    sections.push(`## Pinned notes\n\n${rendered}`);
  }
  for (const plan of plans) {
    sections.push(plan.body
      ? `## Pinned plan: ${plan.title}\n\n${plan.body}`
      : `## Pinned plan: ${plan.title}\n\n(plan content unavailable)`);
  }
  return sections.join('\n\n');
};

<<<<<<< HEAD:packages/web/server/lib/session-knowledge/runtime.js
export const buildKnowledgeText = ({ notes, plans }) => {
  const blocks = [buildPinnedBlock({ notes, plans })].filter(Boolean);
  if (blocks.length === 0) return '';
||||||| bc50ba56aa:packages/web/server/lib/session-knowledge/runtime.js
/**
 * What a shell fence in a reply does, stated in every session that has the
 * `openchamber_render` tool, which marks a session a person reads. Without it
 * an agent writes such a command in a plain fence, which gets no run button,
 * and asks the user to report back. OpenCode runs it with stdin closed, where
 * the session runs, so it is no way to reach a password prompt or the user's
 * own machine.
 */
export const REPLY_COMMAND_GUIDANCE = "A command the user should run themselves, such as one that deletes or publishes something:"
  + " put it in a ```bash block in your reply and end the turn. The block has a Run button; the command runs in this session's folder with no input,"
  + " so nothing that prompts, and when it ends you get its output and continue on your own without a message from the user.";
=======
export const REPLY_COMMAND_GUIDANCE = "A command the user should run themselves, such as one that deletes or publishes something:"
  + " put it in a ```bash block in your reply and end the turn. The block has a Run button; the command runs in this session's folder with no input,"
  + " so nothing that prompts, and when it ends you get its output and continue on your own without a message from the user.";
>>>>>>> upstream/main:packages/web/server/lib/session-knowledge/runtime.ts

<<<<<<< HEAD:packages/web/server/lib/session-knowledge/runtime.js
  const assembled = blocks.join('\n\n');
  return assembled.length <= KNOWLEDGE_MAX_LENGTH
    ? assembled
    : `${truncate(assembled, KNOWLEDGE_MAX_LENGTH)}\n\n(project knowledge truncated)`;
||||||| bc50ba56aa:packages/web/server/lib/session-knowledge/runtime.js
/**
 * When to reach for a workflow, stated in every session that has the
 * `openchamber_workflow` tool. A run costs many agents, so the agent starts
 * one only when the user asks; spotting a task that fits is the agent's job
 * too, and it offers one instead of starting it. The models are agreed with
 * the user before the run: without them every agent runs on the session's
 * own model, often the most expensive one.
 */
export const WORKFLOW_GUIDANCE = 'The openchamber_workflow tool runs a script that fans a large task out to many agents in the background.'
  + ' Start one when the user asks for a workflow.'
  + ' When the task in front of you has many similar independent pieces (a review per file, an audit across many routes, a migration of many files)'
  + ' or needs results cross-checked at that scale, say so and offer a workflow; never start one unasked.'
  + ' A single feature, a few steps or a short loop over files you can do yourself never gets one.'
  + ' Every agent runs on your own model unless the script names another, and dozens of agents on a top model cost many times what a cheap one does.'
  + ' So when you propose a workflow, give each phase a model in the same message (look them up with the openchamber tool\'s models.list when you have it):'
  + ' a cheap one for reading and checking against a fixed list, a strong one where a phase weighs judgement or writes what lands.'
  + ' Start the run once the user agrees to the models.';

/**
 * When to ask for a secret on a card, stated in every session that has the
 * `openchamber_secret` tool, and only here: an agent that needs a token asks
 * for it before it thinks of the tool, and a token pasted in the chat stays in
 * the transcript.
 */
export const SECRET_REQUEST_GUIDANCE = "The openchamber_secret tool asks the user for a secret (API key, token, password) on a private card in the chat."
  + " Whenever you need one, call it: never ask for a secret in the chat or tell the user to paste one there.";

const directToolNames = ({ rendering, secrets, workflows }) => [
  rendering ? 'openchamber_render' : '',
  secrets ? 'openchamber_secret' : '',
  workflows ? 'openchamber_workflow' : '',
].filter(Boolean);

const buildGuidance = ({ linking, naming, rendering, secrets, workflows }) => {
  const directTools = directToolNames({ rendering, secrets, workflows });
  return [
    linking ? SESSION_LINK_GUIDANCE : '',
    linking && naming ? WORK_NAME_GUIDANCE : '',
    rendering ? UI_BLOCKS_GUIDANCE : '',
    rendering ? RENDER_PAGE_GUIDANCE : '',
    rendering ? REPLY_COMMAND_GUIDANCE : '',
    secrets ? SECRET_REQUEST_GUIDANCE : '',
    workflows ? WORKFLOW_GUIDANCE : '',
    directTools.length > 0 ? directToolsGuidance(directTools) : '',
  ].filter(Boolean).join('\n\n');
};

/**
 * The text each entry should hold now. An empty text means the entry goes
 * away; a key left out keeps what the session holds, which is what a branch
 * that could not be read means.
 */
export const buildKnowledgeEntries = ({ notes, plans, memory, linking = false, naming = false, rendering = false, secrets = false, workflows = false, checkout = null, responseStyleInstruction, extensions }) => {
  const entries = {
    [KNOWLEDGE_ENTRY_KEYS.pinned]: truncate(buildPinnedBlock({ notes, plans })),
    [KNOWLEDGE_ENTRY_KEYS.memory]: truncate(buildMemoryBlock(memory)),
    [KNOWLEDGE_ENTRY_KEYS.guidance]: buildGuidance({ linking, naming, rendering, secrets, workflows }),
  };
  if (responseStyleInstruction !== undefined) {
    entries[KNOWLEDGE_ENTRY_KEYS.responseStyle] = (responseStyleInstruction ?? '').trim();
  }
  // Absent when the catalog could not be read: the session keeps what it holds.
  if (extensions !== undefined) entries[KNOWLEDGE_ENTRY_KEYS.extensions] = truncate(extensions);
  // The branch is told while the agent has the tool, whose worktree move is
  // the one thing it can do about a busy branch.
  if (!linking) entries[KNOWLEDGE_ENTRY_KEYS.checkout] = '';
  else if (checkout) entries[KNOWLEDGE_ENTRY_KEYS.checkout] = describeCheckout(checkout);
  return entries;
=======
export const WORKFLOW_GUIDANCE = 'The openchamber_workflow tool runs a script that fans a large task out to many agents in the background.'
  + ' Start one when the user asks for a workflow.'
  + ' When the task in front of you has many similar independent pieces (a review per file, an audit across many routes, a migration of many files)'
  + ' or needs results cross-checked at that scale, say so and offer a workflow; never start one unasked.'
  + ' A single feature, a few steps or a short loop over files you can do yourself never gets one.'
  + ' Every agent runs on your own model unless the script names another, and dozens of agents on a top model cost many times what a cheap one does.'
  + ' So when you propose a workflow, give each phase a model in the same message (look them up with models.list, tools.openchamber inside execute, when you have it):'
  + ' a cheap one for reading and checking against a fixed list, a strong one where a phase weighs judgement or writes what lands.'
  + ' Start the run once the user agrees to the models.'
  + ' When the user lets runs start without approval in Settings, workflow.run starts the run at once instead of showing it for approval, so agree on the plan and the models in the chat first all the same.';

export const SECRET_REQUEST_GUIDANCE = "The openchamber_secret tool asks the user for a secret (API key, token, password) on a private card in the chat."
  + " Whenever you need one, call it: never ask for a secret in the chat or tell the user to paste one there.";

const directToolNames = ({ rendering, secrets, workflows }: Pick<GuidanceOptions, 'rendering' | 'secrets' | 'workflows'>) => [
  rendering ? 'openchamber_render' : '',
  secrets ? 'openchamber_secret' : '',
  workflows ? 'openchamber_workflow' : '',
].filter(Boolean);

const buildGuidance = ({ linking, naming, rendering, secrets, workflows }: GuidanceOptions) => {
  const directTools = directToolNames({ rendering, secrets, workflows });
  return [
    linking ? SESSION_LINK_GUIDANCE : '',
    linking && naming ? WORK_NAME_GUIDANCE : '',
    linking ? DISPATCH_GUIDANCE : '',
    rendering ? UI_BLOCKS_GUIDANCE : '',
    rendering ? RENDER_PAGE_GUIDANCE : '',
    rendering ? REPLY_COMMAND_GUIDANCE : '',
    secrets ? SECRET_REQUEST_GUIDANCE : '',
    workflows ? WORKFLOW_GUIDANCE : '',
    directTools.length > 0 ? directToolsGuidance(directTools) : '',
  ].filter(Boolean).join('\n\n');
};

export const buildKnowledgeEntries = ({ notes, plans, memory, linking = false, naming = false, rendering = false, secrets = false, workflows = false, checkout = null, responseStyleInstruction, extensions }: KnowledgeInput) => {
  const entries: KnowledgeEntries = {
    [KNOWLEDGE_ENTRY_KEYS.pinned]: truncate(buildPinnedBlock({ notes, plans })),
    [KNOWLEDGE_ENTRY_KEYS.memory]: truncate(buildMemoryBlock(memory)),
    [KNOWLEDGE_ENTRY_KEYS.guidance]: buildGuidance({ linking, naming, rendering, secrets, workflows }),
  };
  if (responseStyleInstruction !== undefined) {
    entries[KNOWLEDGE_ENTRY_KEYS.responseStyle] = (responseStyleInstruction ?? '').trim();
  }
  if (extensions !== undefined) entries[KNOWLEDGE_ENTRY_KEYS.extensions] = truncate(extensions);
  if (!linking) entries[KNOWLEDGE_ENTRY_KEYS.checkout] = '';
  else if (checkout) entries[KNOWLEDGE_ENTRY_KEYS.checkout] = describeCheckout(checkout);
  return entries;
>>>>>>> upstream/main:packages/web/server/lib/session-knowledge/runtime.ts
};

export const createSessionKnowledgeRuntime = (dependencies: SessionKnowledgeDependencies) => {
  const {
    projectContextRuntime,
    resolveProjectId,
<<<<<<< HEAD:packages/web/server/lib/session-knowledge/runtime.js
    // Pins and the delivered-signature cursor live in OpenChamber's own session
    // metadata store, which merges patches after creation.
||||||| bc50ba56aa:packages/web/server/lib/session-knowledge/runtime.js
    // The memory switch: what the panel counts.
    isAgentMemoryEnabled,
    // Whether this session's agent has the `openchamber_memory` tool: what
    // the session is told. The switch alone is not enough, since an OpenCode
    // OpenChamber did not launch never gets the tool.
    isMemoryToolAvailable,
    // Whether this session's agent has the `openchamber` tool to link with.
    isSessionLinkingAvailable = null,
    // A linked worktree or isolated space; main checkout tasks keep session titles.
    isWorkNamingAvailable = async () => false,
    // The checked-out branch, or '' when none is checked out. Failures throw;
    // read only while the agent has the tool.
    readCheckoutBranch = null,
    // `(directory, branch)`: that checked-out branch while its name is
    // OpenChamber's placeholder and it was never pushed, else null.
    readPlaceholderBranch = null,
    // Whether this session's agent has the `openchamber_render` tool.
    isPageRenderingAvailable = async () => false,
    // Whether this session's agent has the `openchamber_secret` tool.
    isSecretRequestAvailable = async () => false,
    // Whether this session's agent has the `openchamber_workflow` tool.
    isWorkflowAvailable = async () => false,
    // `(directory)`: what active extensions add for this session, or null when
    // that cannot be told. Reads no process, since every send waits on it.
    readExtensionInstructions = async () => '',
    // Pins live in OpenChamber's own session metadata store.
=======
    isAgentMemoryEnabled,
    isMemoryToolAvailable,
    isSessionLinkingAvailable = null,
    isWorkNamingAvailable = async () => false,
    readCheckoutBranch = null,
    readPlaceholderBranch = null,
    isPageRenderingAvailable = async () => false,
    isSecretRequestAvailable = async () => false,
    isWorkflowAvailable = async () => false,
    readExtensionInstructions = async () => '',
>>>>>>> upstream/main:packages/web/server/lib/session-knowledge/runtime.ts
    readSessionMetadata = null,
    persistSessionMetadata = null,
<<<<<<< HEAD:packages/web/server/lib/session-knowledge/runtime.js
||||||| bc50ba56aa:packages/web/server/lib/session-knowledge/runtime.js
    // The session's instruction entries in OpenCode: `put(sessionId,
    // directory, key, text)` and `remove(sessionId, directory, key)`. Both are
    // idempotent there, so writing an unchanged value tells the agent nothing.
    instructionEntries = null,
=======
    instructionEntries = null,
>>>>>>> upstream/main:packages/web/server/lib/session-knowledge/runtime.ts
  } = dependencies;

  const requireMetadataStore = () => {
    if (!readSessionMetadata || !persistSessionMetadata) {
      throw new Error('project knowledge needs a session metadata store');
    }
    return { readSessionMetadata, persistSessionMetadata };
  };

<<<<<<< HEAD:packages/web/server/lib/session-knowledge/runtime.js
  /** The session shape the readers below expect, built from our own store. */
  const readStoredSession = async (sessionId) => ({ metadata: await readSessionMetadata(sessionId) });

  /**
   * The user's pins, read fresh. The model sees only what plain OMP sends plus
   * these pins.
   */
  const readPins = (session) => {
    const metadata = isRecord(session?.metadata) ? session.metadata : {};
    const openchamber = isRecord(metadata.openchamber) ? metadata.openchamber : {};
    const pins = isRecord(openchamber[PINS_METADATA_KEY]) ? openchamber[PINS_METADATA_KEY] : {};
    const strings = (value) => Array.isArray(value)
      ? [...new Set(value.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim()))]
      : [];
    return { notes: strings(pins.notes), plans: strings(pins.plans) };
||||||| bc50ba56aa:packages/web/server/lib/session-knowledge/runtime.js
  /** The session shape the readers below expect, built from our own store. */
  const readStoredSession = async (sessionId) => ({ metadata: await readSessionMetadata(sessionId) });

  const readPins = (session) => {
    const metadata = isRecord(session?.metadata) ? session.metadata : {};
    const openchamber = isRecord(metadata.openchamber) ? metadata.openchamber : {};
    const pins = isRecord(openchamber[PINS_METADATA_KEY]) ? openchamber[PINS_METADATA_KEY] : {};
    const strings = (value) => Array.isArray(value)
      ? [...new Set(value.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim()))]
      : [];
    return { notes: strings(pins.notes), plans: strings(pins.plans) };
=======
  const readStoredSession = async (sessionId: string) => {
    if (!readSessionMetadata) throw new TypeError('readSessionMetadata is not a function');
    return { metadata: await readSessionMetadata(sessionId) };
>>>>>>> upstream/main:packages/web/server/lib/session-knowledge/runtime.ts
  };

<<<<<<< HEAD:packages/web/server/lib/session-knowledge/runtime.js
  const collect = async (directory, pins = { notes: [], plans: [] }) => {
||||||| bc50ba56aa:packages/web/server/lib/session-knowledge/runtime.js
  /**
   * Everything the session should be carrying, read fresh. A failure in one
   * source never blanks the rest: a memory store that will not load must not
   * take the user's pinned notes down with it.
   */
  const collect = async (directory, pins = { notes: [], plans: [] }) => {
=======
  const readPins = (session?: { metadata?: unknown } | null): SessionPins => {
    const metadata = isSessionMetadata(session?.metadata) ? session.metadata : {};
    const openchamber = isOpenChamberMetadata(metadata.openchamber) ? metadata.openchamber : {};
    const pins = isStoredPins(openchamber[PINS_METADATA_KEY]) ? openchamber[PINS_METADATA_KEY] : {};
    return {
      notes: Array.isArray(pins.notes)
        ? [...new Set(pins.notes.filter(isNonEmptyString).map((entry) => entry.trim()))]
        : [],
      plans: Array.isArray(pins.plans)
        ? [...new Set(pins.plans.filter(isNonEmptyString).map((entry) => entry.trim()))]
        : [],
    };
  };

  const collect = async (directory: string, pins: SessionPins = { notes: [], plans: [] }) => {
>>>>>>> upstream/main:packages/web/server/lib/session-knowledge/runtime.ts
    const projectId = directory ? await resolveProjectId(directory) : '';

    let notes: KnowledgeNote[] = [];
    let plans: KnowledgePlan[] = [];
    if (projectId) {
      try {
        const context = await projectContextRuntime.readContext(projectId);
        const noteIds = new Set(pins.notes);
        const planIds = new Set(pins.plans);
        notes = (context.notes || []).filter((note) => noteIds.has(note.id));
        const pinnedPlans = (context.plans || []).filter((plan) => planIds.has(plan.id));
        plans = await Promise.all(pinnedPlans.map(async (plan) => {
          try {
            const content = await projectContextRuntime.readPlan(projectId, plan.id);
            return { id: plan.id, title: plan.title, body: content?.body?.trim() || '' };
          } catch {
            return { id: plan.id, title: plan.title, body: '' };
          }
        }));
      } catch {
        notes = [];
        plans = [];
      }
    }

<<<<<<< HEAD:packages/web/server/lib/session-knowledge/runtime.js
    return { notes, plans };
||||||| bc50ba56aa:packages/web/server/lib/session-knowledge/runtime.js
    let memory = { global: [], project: [], enabled: false, complete: false };
    const memoryEnabled = typeof isMemoryToolAvailable === 'function'
      ? await isMemoryToolAvailable().catch(() => false)
      : true;
    if (memoryEnabled) {
      try {
        const stored = await agentMemoryRuntime.readAll(projectId || null);
        // A scope that failed to load is left out entirely rather than indexed
        // as empty, which would teach the agent to store what it already has.
        //
        // Flagged entries are withheld from the model but left in the store, so
        // the user can see what was caught. Dropping them would hide the
        // attempt from the only person able to judge it.
        const visible = (entries) => entries.filter((entry) => !entry.flagged);
        memory = {
          global: stored.globalFailed ? [] : visible(stored.global),
          project: stored.projectFailed ? [] : visible(stored.project),
          enabled: true,
          complete: !stored.globalFailed && !stored.projectFailed,
        };
      } catch {
        memory = { global: [], project: [], enabled: true, complete: false };
      }
    }

    const linking = typeof isSessionLinkingAvailable === 'function'
      ? await Promise.resolve(isSessionLinkingAvailable()).catch(() => false)
      : false;
    const naming = linking && Boolean(directory)
      && await Promise.resolve(isWorkNamingAvailable(directory)).catch(() => false);
    // The branch is read only while the tool that moves a session off it is there.
    const branch = linking && directory && readCheckoutBranch
      ? await Promise.resolve(readCheckoutBranch(directory)).catch(() => null)
      : null;
    const placeholder = Boolean(branch) && readPlaceholderBranch
      ? await Promise.resolve(readPlaceholderBranch(directory, branch)).then((name) => name === branch, () => false)
      : false;
    const checkout = branch !== null ? { directory, branch, placeholder } : null;

    const rendering = await Promise.resolve(isPageRenderingAvailable()).catch(() => false);
    const secrets = await Promise.resolve(isSecretRequestAvailable()).catch(() => false);
    const workflows = await Promise.resolve(isWorkflowAvailable()).catch(() => false);

    return { notes, plans, memory, linking, naming, rendering, secrets, workflows, checkout };
=======
    let memory: MemoryIndex = { global: [], project: [], enabled: false, complete: false };
    const memoryEnabled = isMemoryToolAvailable
      ? await isMemoryToolAvailable().catch(() => false)
      : true;
    if (memoryEnabled) {
      try {
        const stored = await agentMemoryRuntime.readAll(projectId || null);
        const visible = (entries: MemoryTitle[]) => entries.filter((entry) => !entry.flagged);
        memory = {
          global: stored.globalFailed ? [] : visible(stored.global),
          project: stored.projectFailed ? [] : visible(stored.project),
          enabled: true,
          complete: !stored.globalFailed && !stored.projectFailed,
        };
      } catch {
        memory = { global: [], project: [], enabled: true, complete: false };
      }
    }

    const linking = isSessionLinkingAvailable
      ? await Promise.resolve(isSessionLinkingAvailable()).catch(() => false)
      : false;
    const naming = linking && Boolean(directory)
      && await Promise.resolve(isWorkNamingAvailable(directory)).catch(() => false);
    const branch = linking && directory && readCheckoutBranch
      ? await Promise.resolve(readCheckoutBranch(directory)).catch(() => null)
      : null;
    const placeholder = branch && readPlaceholderBranch
      ? await Promise.resolve(readPlaceholderBranch(directory, branch)).then((name) => name === branch, () => false)
      : false;
    const checkout = branch !== null ? { directory, branch, placeholder } : null;

    const rendering = await Promise.resolve(isPageRenderingAvailable()).catch(() => false);
    const secrets = await Promise.resolve(isSecretRequestAvailable()).catch(() => false);
    const workflows = await Promise.resolve(isWorkflowAvailable()).catch(() => false);

    return { notes, plans, memory, linking, naming, rendering, secrets, workflows, checkout };
>>>>>>> upstream/main:packages/web/server/lib/session-knowledge/runtime.ts
  };

  const collectSummary = async (directory: string, pins: SessionPins = { notes: [], plans: [] }): Promise<KnowledgeSummary> => {
    const projectId = directory ? await resolveProjectId(directory) : '';
    const empty = { notes: [], plans: [] };
    if (!projectId) return empty;

    let notes: KnowledgeSummary['notes'] = [];
    let plans: KnowledgeSummary['plans'] = [];
    try {
      const context = await projectContextRuntime.readContext(projectId);
      const noteIds = new Set(pins.notes);
      const planIds = new Set(pins.plans);
      notes = (context.notes || []).filter((note) => noteIds.has(note.id))
        .map((note) => ({ id: note.id, body: note.body }));
      plans = (context.plans || []).filter((plan) => planIds.has(plan.id))
        .map((plan) => ({ id: plan.id, title: plan.title }));
    } catch {
      notes = [];
      plans = [];
    }

<<<<<<< HEAD:packages/web/server/lib/session-knowledge/runtime.js
    return { notes, plans };
  };
||||||| bc50ba56aa:packages/web/server/lib/session-knowledge/runtime.js
    let memory = { global: 0, project: 0 };
    const memoryEnabled = typeof isAgentMemoryEnabled === 'function'
      ? await isAgentMemoryEnabled().catch(() => false)
      : true;
    if (memoryEnabled) {
      try {
        const stored = await agentMemoryRuntime.readAll(projectId);
        memory = {
          global: stored.globalFailed ? 0 : stored.global.length,
          project: stored.projectFailed ? 0 : stored.project.length,
        };
      } catch {
        memory = { global: 0, project: 0 };
      }
    }
=======
    let memory = { global: 0, project: 0 };
    const memoryEnabled = isAgentMemoryEnabled
      ? await isAgentMemoryEnabled().catch(() => false)
      : true;
    if (memoryEnabled) {
      try {
        const stored = await agentMemoryRuntime.readAll(projectId);
        memory = {
          global: stored.globalFailed ? 0 : stored.global.length,
          project: stored.projectFailed ? 0 : stored.project.length,
        };
      } catch {
        memory = { global: 0, project: 0 };
      }
    }
>>>>>>> upstream/main:packages/web/server/lib/session-knowledge/runtime.ts

  const readDeliveredSignature = (session) => {
    const metadata = isRecord(session?.metadata) ? session.metadata : {};
    const openchamber = isRecord(metadata.openchamber) ? metadata.openchamber : {};
    const delivered = openchamber[KNOWLEDGE_METADATA_KEY];
    return typeof delivered === 'string' ? delivered : '';
  };

  /**
   * The text this session still owes, or an empty string when it is already
   * carrying it. `deliveredSignature` comes from the session's metadata.
   */
  const resolvePending = async (directory, deliveredSignature, pins = { notes: [], plans: [] }) => {
    const collected = await collect(directory, pins);
    const signature = buildKnowledgeSignature(collected);
    if (!signature || signature === deliveredSignature) {
      return { text: '', signature };
    }
    return { text: buildKnowledgeText(collected), signature };
  };

  /**
   * What this session still owes, read from its own stored signature.
   */
  const resolvePendingForSession = async (sessionId, directory) => {
    const session = await readStoredSession(sessionId).catch(() => null);
    return resolvePending(directory, readDeliveredSignature(session), readPins(session));
  };

  const collectSummaryForSession = async (sessionId: string, directory: string) => {
    const session = await readStoredSession(sessionId).catch(() => null);
    return collectSummary(directory, readPins(session));
  };

<<<<<<< HEAD:packages/web/server/lib/session-knowledge/runtime.js
  const setPin = async (sessionId, directory, kind, id, pinned) => {
    requireMetadataStore();
||||||| bc50ba56aa:packages/web/server/lib/session-knowledge/runtime.js
  /**
   * Writes what the session should carry now into its instruction entries.
   * Called right before a message goes out, so the agent reads it with that
   * message. Never throws: a message without its background costs the agent
   * some context, a failed send costs the user their message. One entry that
   * will not write does not hold back the others.
   */
  const syncOnce = async (sessionId, directory, responseStyleInstruction) => {
    if (!instructionEntries || !sessionId) return false;
    try {
      const session = await readStoredSession(sessionId).catch(() => null);
      const entries = buildKnowledgeEntries({
        ...await collect(directory, readPins(session)),
        responseStyleInstruction,
        extensions: await readExtensionInstructions(directory).catch(() => null) ?? undefined,
      });
      const writes = await Promise.allSettled(Object.entries(entries).map(([key, text]) => (text
        ? instructionEntries.put(sessionId, directory, key, text)
        : instructionEntries.remove(sessionId, directory, key))));
      const failed = writes.find((write) => write.status === 'rejected');
      if (failed) console.warn('[session-knowledge] entry write failed:', failed.reason?.message || failed.reason);
      return !failed;
    } catch (error) {
      console.warn('[session-knowledge] sync failed:', error?.message || error);
      return false;
    }
  };

  const syncTails = new Map();
  const sync = (sessionId, directory, responseStyleInstruction) => {
    if (!sessionId) return Promise.resolve(false);
    const previous = syncTails.get(sessionId) ?? Promise.resolve(false);
    const current = previous
      .catch(() => false)
      .then(() => syncOnce(sessionId, directory, responseStyleInstruction));
    syncTails.set(sessionId, current);
    return current.finally(() => {
      if (syncTails.get(sessionId) === current) syncTails.delete(sessionId);
    });
  };

  const setPin = async (sessionId, directory, kind, id, pinned) => {
    requireMetadataStore();
=======
  const syncOnce = async (sessionId: string, directory: string, responseStyleInstruction?: string | null) => {
    if (!instructionEntries || !sessionId) return false;
    try {
      const session = await readStoredSession(sessionId).catch(() => null);
      const entries = buildKnowledgeEntries({
        ...await collect(directory, readPins(session)),
        responseStyleInstruction,
        extensions: await readExtensionInstructions(directory).catch(() => null) ?? undefined,
      });
      const writes = await Promise.allSettled(Object.entries(entries).map(([key, text]) => (text
        ? instructionEntries.put(sessionId, directory, key, text)
        : instructionEntries.remove(sessionId, directory, key))));
      const failed = writes.find((write) => write.status === 'rejected');
      if (failed) console.warn('[session-knowledge] entry write failed:', failed.reason?.message || failed.reason);
      return !failed;
    } catch (error) {
      console.warn('[session-knowledge] sync failed:', (hasMessage(error) ? error.message : undefined) || error);
      return false;
    }
  };

  const syncTails = new Map<string, Promise<boolean>>();
  const sync = (sessionId: string, directory: string, responseStyleInstruction?: string | null) => {
    if (!sessionId) return Promise.resolve(false);
    const previous = syncTails.get(sessionId) ?? Promise.resolve(false);
    const current = previous
      .catch(() => false)
      .then(() => syncOnce(sessionId, directory, responseStyleInstruction));
    syncTails.set(sessionId, current);
    return current.finally(() => {
      if (syncTails.get(sessionId) === current) syncTails.delete(sessionId);
    });
  };

  const setPin = async (sessionId: string, directory: string, kind: 'note' | 'plan', id: string, pinned: boolean): Promise<SessionPins> => {
    const { persistSessionMetadata } = requireMetadataStore();
>>>>>>> upstream/main:packages/web/server/lib/session-knowledge/runtime.ts
    const pins = readPins(await readStoredSession(sessionId));
    const key = kind === 'note' ? 'notes' : 'plans';
    const next = new Set(pins[key]);
    if (pinned) next.add(id);
    else next.delete(id);
<<<<<<< HEAD:packages/web/server/lib/session-knowledge/runtime.js
    // Clearing the delivered signature is what makes the next send carry the
    // changed pin set; the merge patch leaves neighbouring state alone.
||||||| bc50ba56aa:packages/web/server/lib/session-knowledge/runtime.js
    // The next send writes the changed pin set; the merge patch leaves
    // neighbouring state alone.
=======
>>>>>>> upstream/main:packages/web/server/lib/session-knowledge/runtime.ts
    await persistSessionMetadata(sessionId, directory, {
      openchamber: {
        [PINS_METADATA_KEY]: { ...pins, [key]: [...next] },
        [KNOWLEDGE_METADATA_KEY]: '',
      },
    });
    return { ...pins, [key]: [...next] };
  };

  /**
   * Recorded only once the message carrying it has actually gone out. Writing
   * it when the text is handed over would leave a failed send believing the
   * agent had context it never received.
   *
   * Merged onto a fresh read, because the session's metadata holds other
   * OpenChamber state — pinned messages among it — and a blind write would
   * drop whatever changed in between.
   */
  const recordDelivered = async (sessionId, directory, signature) => {
    requireMetadataStore();
    await persistSessionMetadata(sessionId, directory, {
      openchamber: { [KNOWLEDGE_METADATA_KEY]: signature },
    });
  };

  return {
    collect,
    collectSummary,
    collectSummaryForSession,
    resolvePending,
    resolvePendingForSession,
    recordDelivered,
    readDeliveredSignature,
    readPins,
    setPin,
    metadataKey: KNOWLEDGE_METADATA_KEY,
    pinsMetadataKey: PINS_METADATA_KEY,
  };
};
