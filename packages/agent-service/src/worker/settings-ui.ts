import {
  parsePlacement,
  type OmpSettingPlacement,
} from '@openchamber/agent-contract';
import { orderedSettings } from '@oh-my-pi/pi-coding-agent/config/all-settings';
import { cfgAdvisorEnabled } from '@oh-my-pi/pi-coding-agent/advisor/settings';
import { cfgComposerPredictions } from '@oh-my-pi/pi-coding-agent/modes/settings';
import { cfgPlanEnabled } from '@oh-my-pi/pi-coding-agent/plan-mode/settings';
import { cfgRetryUsageAwareFallback, cfgDefaultThinkingLevel } from '@oh-my-pi/pi-coding-agent/session/settings';
import type { Settings } from '@oh-my-pi/pi-coding-agent/config/settings';

/**
 * Where each OMP setting belongs across GUI surfaces:
 * - `page:section`: concept-owned placement on an existing OpenChamber page and section.
 * - `engine`: long-tail settings rendered on the OMP Settings page.
 * - `tui-only`: terminal presentation or terminal interaction.
 * - `owned-by <settingsItem>`: an existing OpenChamber control already owns and writes the concept.
 * - `boundary`: crosses the enterprise boundary (endpoint, key, relay, share, listener or telemetry). Configured in config.yml only; never rendered or written by a GUI route.
 *
 * Every TUI-visible setting from OMP's `orderedSettings()` is placed here.
 * Untabbed settings default to `hidden` unless explicitly placed below.
 */
const RAW_PLACEMENTS: Readonly<Record<string, string>> = {
  'auth.unpausedProviders': 'boundary',
  'tui.renderEmbeds': 'tui-only',
  'encourageEdits': 'config-only',
  'providers.cacheWarmingStrategy': 'config-only',
  'providers.cacheWarmingCompactPercent': 'config-only',
  'providers.cacheWarmingCompactTokens': 'config-only',
  'live.endpoint': 'boundary',
  'live.apiKey': 'boundary',
  'providers.webKeyless': 'boundary',
  'codexResets.autoRedeem5h': 'boundary',
  'codexResets.autoRedeemWeekly': 'boundary',
  'claudeResets.autoRedeem5h': 'boundary',
  'claudeResets.autoRedeemWeekly': 'boundary',
  'claudeResets.autoRedeemFable': 'boundary',
  'mnemopi.recallRelevance': 'config-only',
  'mnemopi.embeddingQueryPrefix': 'config-only',
  'mnemopi.embeddingInputType': 'config-only',
  'todo.midRunNudges': 'config-only',
  'find.verifyModel': 'config-only',
  'commit.enabled': 'boundary',
  'bash.allowedEnvVars': 'boundary',
  'task.autoParallel': 'config-only',
  'task.steps': 'config-only',
  'task.crossInstance': 'boundary',
  'browser.webkit': 'config-only',
  'browser.webkitPath': 'boundary',
  'disassembler.backend': 'config-only',
  'disassembler.maxOpen': 'config-only',
  'disassembler.idleCloseSec': 'config-only',
  'ghidra.installDir': 'boundary',
  'ghidra.python': 'boundary',
  'binja.installDir': 'boundary',
  'binja.python': 'boundary',
  'mcp.evalNamespaces': 'config-only',
  'mcp.builtinTransforms': 'config-only',
  // --- appearance (50) ---
  'theme.dark': 'tui-only',
  'theme.light': 'tui-only',
  'symbolPreset': 'tui-only',
  'colorBlindMode': 'tui-only',
  'composer.shape': 'tui-only',
  'composer.tokenRate': 'tui-only',
  'statusLine.preset': 'tui-only',
  'statusLine.separator': 'tui-only',
  'statusLine.contextLine': 'tui-only',
  'statusLine.sessionAccent': 'tui-only',
  'statusLine.transparent': 'tui-only',
  'statusLine.compactThinkingLevel': 'tui-only',
  'statusLine.showHookStatus': 'tui-only',
  'terminal.showImages': 'tui-only',
  'images.autoResize': 'chat:images',
  'images.blockImages': 'chat:images',
  'tui.resizeScrollback': 'tui-only',
  'pty.notify': 'tui-only',
  'terminal.showProgress': 'tui-only',
  'terminal.programStatus': 'tui-only',
  'tui.textSizing': 'tui-only',
  'tui.colorfulMarkdown': 'tui-only',
  'tui.renderMermaid': 'tui-only',
  'tui.renderSvg': 'tui-only',
  'tui.autoGraph': 'tui-only',
  'tui.reactions': 'tui-only',
  'tui.codexResetFireworks': 'tui-only',
  'tui.titleState': 'tui-only',
  'tui.titleSpinner': 'tui-only',
  'tui.spinnerInterval': 'tui-only',
  'tui.maxFps': 'tui-only',
  'tui.hyperlinks': 'tui-only',
  'tui.mouse': 'tui-only',
  'tui.tight': 'tui-only',
  'display.shimmer': 'tui-only',
  'tui.motion': 'tui-only',
  'display.pinnedAgents': 'tui-only',
  // OMP reads these seven only in its terminal transcript renderer
  // (`modes/interactive-mode.ts`, `modes/utils/ui-helpers.ts`) and OMP's own
  // session loader hardcodes the compacted-history collapse. Nothing in this
  // app's transcript reads them, so they are terminal presentation and stay
  // out of the GUI.
  'display.subagentLivePreview': 'tui-only',
  'display.smoothStreaming': 'tui-only',
  'display.hideToolActivity': 'tui-only',
  'display.showTokenUsage': 'tui-only',
  'display.showTurnTime': 'tui-only',
  'display.cacheMissMarker': 'tui-only',
  'display.shellVisualization': 'tui-only',
  'display.advisorCollapsedLines': 'tui-only',
  'display.collapseCompacted': 'tui-only',
  'showHardwareCursor': 'tui-only',
  'tui.imeSafeCursor': 'tui-only',
  'task.showResolvedModelBadge': 'tui-only',
  'title.icons': 'tui-only',

  // --- interaction (61) ---
  'autoResume': 'sessions:general',
  'git.enabled': 'git:general',
  'steeringMode': 'sessions:execution',
  'followUpMode': 'sessions:execution',
  'interruptMode': 'sessions:execution',
  'btw.inject': 'chat:btw',
  'tui.vimMode': 'tui-only',
  'tui.vimModeDisplay': 'tui-only',
  'loop.mode': 'sessions:execution',
  'loop.conditionTimeoutMs': 'tui-only',
  'composer.recallClearedDrafts': 'tui-only',
  'doubleEscapeAction': 'tui-only',
  'input.bareExitOnEmptySession': 'tui-only',
  'input.bareSlashCommands': 'tui-only',
  'treeFilterMode': 'tui-only',
  'autocompleteMaxVisible': 'tui-only',
  'spelling.typoDetection': 'tui-only',
  'spelling.autocomplete': 'tui-only',
  'composer.predictions': 'tui-only',
  'composer.predictionAlternatives': 'tui-only',
  'spelling.autocorrect': 'tui-only',
  'emojiAutocomplete': 'tui-only',
  'paste.largeMenuThreshold': 'tui-only',
  'startup.quiet': 'tui-only',
  'startup.showSplash': 'tui-only',
  'startup.setupWizard': 'tui-only',
  'startup.checkUpdate': 'tui-only',
  'update.channel': 'tui-only',
  'update.auto': 'tui-only',
  'marketplace.autoUpdate': 'tui-only',
  'startup.changelogMode': 'tui-only',
  'session.worktreeScope': 'sessions:worktree',
  'magicKeywords.enabled': 'chat:composer',
  'magicKeywords.ultrathink': 'chat:composer',
  'magicKeywords.chillax': 'chat:composer',
  'magicKeywords.orchestrate': 'chat:composer',
  'magicKeywords.workflow': 'chat:composer',
  'magicKeywords.jevify': 'chat:composer',
  'completion.notify': 'notifications:events',
  'error.notify': 'notifications:events',
  'ask.timeout': 'engine',
  'ask.notify': 'notifications:events',
  'recap.enabled': 'owned-by chat.session-recap',
  'recap.idleSeconds': 'owned-by chat.session-recap',
  'power.sleepPrevention': 'general:power',
  'features.unexpectedStopDetection': 'engine',
  'tools.approval': 'config-only',
  'tools.approvalMode': 'tui-only',
  'tools.restrictedFolders': 'config-only',
  'skills.registryUrl': 'boundary',
  'stt.enabled': 'voice:stt',
  'stt.submitTrigger': 'voice:stt',
  'collab.relayUrl': 'boundary',
  'collab.webUrl': 'boundary',
  'collab.displayName': 'boundary',
  'collab.autoStart': 'boundary',
  'share.serverUrl': 'boundary',
  'share.store': 'boundary',
  'share.redactSecrets': 'boundary',
  'stream.serverUrl': 'boundary',
  'stream.redactPatterns': 'boundary',

  // --- context (31) ---
  'workspace.additionalDirectories': 'boundary',
  'contextFiles.extra': 'boundary',
  'contextPromotion.enabled': 'sessions:context',
  'extendedContext': 'sessions:context',
  'branchSummary.enabled': 'sessions:context',
  'compaction.enabled': 'sessions:compaction',
  'compaction.experimentalContextManagement': 'sessions:compaction',
  'compaction.midTurnEnabled': 'sessions:compaction',
  // An ordered array with five choices the generic row cannot honour: a chip
  // group would write one string into the array instead of an order. It stays
  // config.yml-only until a control that edits the sequence exists.
  'compaction.methodOrder': 'config-only',
  'compaction.thresholdPercent': 'sessions:compaction',
  'compaction.thresholdTokens': 'sessions:compaction',
  'compaction.handoffSaveToDisk': 'sessions:compaction',
  'compaction.remoteStreamingV2Enabled': 'sessions:compaction',
  'compaction.asyncEnabled': 'sessions:compaction',
  'compaction.idleEnabled': 'sessions:compaction',
  'compaction.idleThresholdTokens': 'sessions:compaction',
  'compaction.idleTimeoutSeconds': 'sessions:compaction',
  'compaction.supersedeReads': 'sessions:compaction',
  'compaction.dropUseless': 'sessions:compaction',
  'snapcompact.systemPrompt': 'engine',
  'snapcompact.toolResults': 'engine',
  'tools.format': 'engine',
  // `snapcompact.shape` only picks the frame shape snapcompact prints text
  // with, which is how OMP's terminal transcript renders an archive. This app
  // renders no such frame, so it is terminal presentation like `display.*`.
  'snapcompact.shape': 'tui-only',
  // TTSR interrupts the agent mid-stream when output matches a rule pattern.
  // `session/ttsr-coordinator.ts` runs that in the SDK, not in OMP's renderer,
  // so these stay on the engine page: they change what the agent does, not how
  // a transcript looks.
  'ttsr.enabled': 'engine',
  'ttsr.judge': 'engine',
  'ttsr.contextMode': 'engine',
  'ttsr.interruptMode': 'engine',
  'ttsr.repeatMode': 'engine',
  'ttsr.repeatGap': 'engine',
  'ttsr.builtinRules': 'engine',
  'ttsr.disabledRules': 'config-only',

  // --- files (28) ---
  'edit.mode': 'engine',
  'edit.magic.model': 'boundary',
  'edit.fuzzyMatch': 'engine',
  'edit.fuzzyThreshold': 'engine',
  'edit.streamingAbort': 'engine',
  'edit.recoverInlineEdits': 'engine',
  'edit.blockAutoGenerated': 'engine',
  'edit.enforceSeenLines': 'engine',
  'edit.blackbox.enabled': 'engine',
  'edit.autoRepair.enabled': 'engine',
  'readLineNumbers': 'engine',
  'read.defaultLimit': 'engine',
  // `read.renderMarkdown` only sets `details.contentType`, and
  // `read.toolResultPreview` is read by OMP's transcript helpers; both are
  // consumed by pi-tui renderers only, and this app's transcript reads neither.
  'read.renderMarkdown': 'tui-only',
  'read.toolResultPreview': 'tui-only',
  'read.summarize.enabled': 'engine',
  'read.summarize.prose': 'engine',
  'read.summarize.minBodyLines': 'engine',
  'read.summarize.minCommentLines': 'engine',
  'read.summarize.minTotalLines': 'engine',
  'read.summarize.unfoldUntil': 'engine',
  'read.summarize.unfoldLimit': 'engine',
  'lsp.enabled': 'engine',
  'lsp.lazy': 'engine',
  'lsp.shared': 'engine',
  'lsp.formatOnWrite': 'engine',
  'lsp.diagnosticsOnWrite': 'engine',
  'lsp.diagnosticsOnEdit': 'engine',
  'lsp.diagnosticsDeduplicate': 'engine',
  'lsp.requestTimeout': 'engine',

  // --- shell (18) ---
  'bash.enabled': 'engine',
  'bash.allowCompoundCommands': 'engine',
  'bash.autoBackground.enabled': 'engine',
  'bash.gitGuard': 'engine',
  'bash.patterns': 'config-only',
  'bashInterceptor.enabled': 'engine',
  'bash.direnv': 'engine',
  'bash.direnvLoadTimeoutMs': 'engine',
  'shellMinimizer.enabled': 'engine',
  'shellMinimizer.sourceOutlineLevel': 'engine',
  'eval.py': 'engine',
  'eval.js': 'engine',
  'eval.autoProvision': 'engine',
  'eval.tools.enabled': 'engine',
  'eval.workpool.freshAgents': 'engine',
  'eval.autoBackground.enabled': 'engine',
  'python.kernelMode': 'engine',
  'python.interpreter': 'boundary',

  // --- memory (31) ---
  'memory.backend': 'memory:backend',
  'sharpshooter.model': 'memory:backend',
  'autolearn.enabled': 'memory:backend',
  'autolearn.autoContinue': 'memory:backend',
  'mnemopi.dbPath': 'boundary',
  'mnemopi.bank': 'memory:backend',
  'mnemopi.scoping': 'memory:backend',
  'mnemopi.embeddingVariant': 'memory:backend',
  'mnemopi.autoRecall': 'memory:backend',
  'mnemopi.autoRetain': 'memory:backend',
  'mnemopi.polyphonicRecall': 'memory:backend',
  'mnemopi.enhancedRecall': 'memory:backend',
  'mnemopi.proactiveLinking': 'memory:backend',
  'mnemopi.noEmbeddings': 'memory:backend',
  'mnemopi.embeddingModel': 'memory:backend',
  'mnemopi.embeddingApiUrl': 'boundary',
  'mnemopi.embeddingApiKey': 'boundary',
  'mnemopi.llmMode': 'memory:backend',
  'mnemopi.llmBaseUrl': 'boundary',
  'mnemopi.llmApiKey': 'boundary',
  'mnemopi.llmModel': 'memory:backend',
  'hindsight.apiUrl': 'boundary',
  'hindsight.apiToken': 'boundary',
  'hindsight.bankId': 'memory:backend',
  'hindsight.scoping': 'memory:backend',
  'hindsight.globalScope': 'memory:backend',
  'hindsight.autoRecall': 'memory:backend',
  'hindsight.autoRetain': 'memory:backend',
  'hindsight.retainMode': 'memory:backend',
  'hindsight.mentalModelsEnabled': 'memory:backend',
  'hindsight.mentalModelAutoSeed': 'memory:backend',

  // --- model (65) ---
  // The Defaults section's thinking control writes it; no generic row does,
  // because the value is a model-specific effort the picker renders.
  'defaultThinkingLevel': 'owned-by sessions.default-thinking',
  'modelRoleStorage': 'behavior:prompt',
  'personality': 'behavior:prompt',
  'inlineToolDescriptors': 'behavior:prompt',
  'includeModelInPrompt': 'behavior:prompt',
  'includeWorkspaceTree': 'behavior:prompt',
  'skillful': 'behavior:prompt',
  'prewalk.enabled': 'agents:prewalk',
  'prewalk.from': 'agents:prewalk',
  'prewalk.into': 'agents:prewalk',
  'prewalk.auto': 'agents:prewalk',
  'prewalk.autoTarget': 'agents:prewalk',
  'images.describeForTextModels': 'chat:images',
  'images.urls.enabled': 'boundary',
  'images.urls.backends': 'boundary',
  'images.urls.command': 'boundary',
  'images.urls.publicBaseUrl': 'boundary',
  'images.urls.ttlHours': 'boundary',
  'images.urls.bindHost': 'boundary',
  'images.urls.sshTarget': 'boundary',
  'images.urls.sshRemotePort': 'boundary',
  'hideThinkingBlock': 'chat:thinking',
  'expandThinkingBlocks': 'chat:thinking',
  'proseOnlyThinking': 'chat:thinking',
  'omitThinking': 'chat:thinking',
  'externalThinking': 'chat:thinking',
  'model.loopGuard.enabled': 'engine',
  'model.loopGuard.checkAssistantContent': 'engine',
  'model.loopGuard.toolCallReminder': 'engine',
  'model.toolCallLoopGuard.enabled': 'engine',
  'model.toolCallLoopGuard.threshold': 'engine',
  'model.toolCallLoopGuard.exemptTools': 'config-only',
  'providers.autoThinkingMaxEffort': 'engine',
  'temperature': 'sessions:sampling',
  'topP': 'sessions:sampling',
  'topK': 'sessions:sampling',
  'minP': 'sessions:sampling',
  'presencePenalty': 'sessions:sampling',
  'repetitionPenalty': 'sessions:sampling',
  'textVerbosity': 'sessions:sampling',
  'tier.openai': 'providers:tiers',
  'tier.anthropic': 'providers:tiers',
  'tier.google': 'providers:tiers',
  'tier.subagent': 'providers:tiers',
  'tier.advisor': 'providers:tiers',
  'retry.maxRetries': 'sessions:retry',
  'retry.maxDelayMs': 'sessions:retry',
  'retry.waitForUsageReset': 'sessions:retry',
  'retry.modelFallback': 'sessions:retry',
  'retry.fallbackOn': 'sessions:retry',
  'retry.rateLimitWalksChain': 'sessions:retry',
  'retry.usageAwareFallback': 'sessions:retry',
  'retry.usageReservePct': 'sessions:retry',
  'retry.usageReservePolicy': 'sessions:retry',
  'retry.fallbackChains': 'owned-by sessions.fallback-model',
  'retry.fallbackRevertPolicy': 'sessions:retry',
  'providers.anthropic.serverSideFallback': 'sessions:retry',
  'advisor.enabled': 'agents:advisor',
  'advisor.syncBacklog': 'agents:advisor',
  'advisor.immuneTurns': 'agents:advisor',
  'advisor.continueSeverity': 'agents:advisor',
  'advisor.reviewMode': 'agents:advisor',
  'advisor.reviewInterval': 'agents:advisor',
  'advisor.maxNotesPerUpdate': 'agents:advisor',
  'advisor.evictStaleResults': 'agents:advisor',

  // --- tasks (45) ---
  'task.isolation.enabled': 'sessions:isolation',
  'task.isolation.apply': 'sessions:isolation',
  'task.isolation.merge': 'sessions:isolation',
  'task.isolation.commits': 'sessions:isolation',
  'isolation.backend': 'sessions:worktree',
  'worktree.clone': 'sessions:worktree',
  'worktree.cleanSource': 'sessions:worktree',
  'worktree.onStart': 'sessions:worktree',
  'worktree.onExit': 'sessions:worktree',
  'worktree.base': 'boundary',
  'ovnfs.path': 'boundary',
  'task.eager': 'agents:subagents',
  'task.batch': 'agents:subagents',
  'task.file': 'agents:subagents',
  'task.structured': 'agents:subagents',
  'task.speculativeLaunch': 'agents:subagents',
  'task.enableEffort': 'agents:subagents',
  'task.perCallModel': 'agents:subagents',
  'task.perCallModelAllow': 'config-only',
  'task.maxConcurrency': 'engine',
  'task.workerThreads': 'agents:subagents',
  'task.enableLsp': 'agents:subagents',
  'task.maxRecursionDepth': 'engine',
  'task.maxRuntimeMs': 'agents:subagents',
  'task.completionProbe': 'agents:subagents',
  'task.agentIdleTtlMs': 'agents:subagents',
  'task.softRequestBudget': 'agents:subagents',
  'task.softRequestBudgetNotice': 'agents:subagents',
  'task.maxEffort': 'agents:subagents',
  'task.prewalk': 'agents:subagents',
  'plan.enabled': 'sessions:plan',
  'plan.defaultOnStartup': 'sessions:plan',
  'plan.autosave': 'sessions:plan',
  'plan.autosaveDir': 'boundary',
  'goal.enabled': 'sessions:plan',
  'goal.statusInFooter': 'tui-only',
  'goal.continuationModes': 'config-only',
  'title.generator': 'sessions:title',
  'title.refreshOnReplan': 'sessions:title',
  'title.refreshAfterPrompts': 'sessions:title',
  'skills.enableSkillCommands': 'engine',
  'commands.enableClaudeUser': 'commands:catalog',
  'commands.enableClaudeProject': 'commands:catalog',
  'commands.enableOpencodeUser': 'commands:catalog',
  'commands.enableOpencodeProject': 'commands:catalog',

  // --- providers (41) ---
  'providers.maxInFlightRequests': 'config-only',
  'providers.ollama-cloud.maxConcurrency': 'providers:protocol',
  'providers.webSearchTimeoutSeconds': 'web-search:providers',
  'providers.antigravityEndpoint': 'boundary',
  'providers.fireworksTier': 'providers:protocol',
  'providers.tinyModelDevice': 'providers:protocol',
  'providers.tinyModelDtype': 'providers:protocol',
  'providers.kimiApiFormat': 'providers:protocol',
  'providers.openaiWebsockets': 'providers:protocol',
  'providers.openaiResponsesWebsockets': 'providers:protocol',
  'providers.openaiLiveSteering': 'providers:protocol',
  'providers.muse-code.storeResponses': 'providers:protocol',
  'providers.openai-codex.daybreak': 'providers:protocol',
  'providers.cacheRetention': 'providers:protocol',
  'providers.cacheWarming': 'providers:protocol',
  'providers.streamFirstEventTimeoutSeconds': 'providers:protocol',
  'providers.streamIdleTimeoutSeconds': 'providers:protocol',
  'providers.openrouterVariant': 'providers:protocol',
  'provider.appendOnlyContext': 'providers:protocol',
  'telemetry.otlpExportEnabled': 'boundary',
  'secrets.enabled': 'providers:privacy',
  'exa.enabled': 'web-search:providers',
  'exa.searchDelayMs': 'web-search:providers',
  'searxng.endpoint': 'boundary',
  'codexResets.autoRedeem': 'usage:resets',
  'codexResets.minBlockedMinutes': 'usage:resets',
  'codexResets.keepCredits': 'usage:resets',
  'codexResets.salvageHorizonHours': 'usage:resets',
  'claudeResets.autoRedeem': 'usage:resets',
  'claudeResets.minBlockedMinutes': 'usage:resets',
  'claudeResets.keepCredits': 'usage:resets',
  'claudeResets.salvageHorizonHours': 'usage:resets',
  'live.voice': 'voice:general',
  'tts.localVoice': 'voice:general',
  'tts.localSpeed': 'voice:general',
  'speech.enabled': 'voice:general',
  'speech.mode': 'voice:general',
  'speech.enhanced': 'voice:general',
  'speech.voice': 'voice:general',
  'speech.speed': 'voice:general',
  'providers.fetch': 'voice:general',

  // --- tools (80) ---
  'tools.artifactSpillThreshold': 'engine',
  'tools.artifactTailBytes': 'engine',
  'tools.artifactHeadBytes': 'engine',
  'tools.outputMaxColumns': 'engine',
  'tools.artifactTailLines': 'engine',
  'tools.artifactMaxBytes': 'engine',
  'todo.enabled': 'tools:available',
  'todo.reminders': 'tools:todo',
  'todo.remindersMax': 'tools:todo',
  'todo.eager': 'tools:todo',
  'tasks.todoClearDelay': 'tools:todo',
  'glob.enabled': 'tools:available',
  'grep.enabled': 'tools:available',
  'grep.contextBefore': 'tools:grep',
  'grep.contextAfter': 'tools:grep',
  'astGrep.enabled': 'tools:available',
  'astEdit.enabled': 'tools:available',
  'find.enabled': 'tools:available',
  'debug.enabled': 'tools:available',
  'launch.enabled': 'tools:available',
  'speechgen.enabled': 'tools:available',
  'generate_image.enabled': 'tools:available',
  'computer.enabled': 'tools:available',
  'ratchet.enabled': 'tools:available',
  'archive.enabled': 'tools:available',
  'computer.display': 'tools:computer',
  'computer.maxWidth': 'tools:computer',
  'computer.maxHeight': 'tools:computer',
  'computer.backgroundFallback': 'tools:computer',
  'images.questionTimeoutMs': 'engine',
  'checkpoint.enabled': 'tools:available',
  'fetch.enabled': 'tools:available',
  'vault.enabled': 'tools:available',
  'github.enabled': 'tools:available',
  'github.cache.enabled': 'tools:github',
  'github.cache.softTtlSec': 'tools:github',
  'github.cache.hardTtlSec': 'tools:github',
  'web_search.enabled': 'tools:available',
  'ida.python': 'boundary',
  'ida.installDir': 'boundary',
  'security.enabled': 'tools:available',
  'ask.enabled': 'tools:available',
  'out.enabled': 'tools:available',
  'tools.intentTracing': 'engine',
  'tools.abortOnFabricatedResult': 'engine',
  'tools.speculativeExecution.enabled': 'engine',
  'tools.speculativeExecution.maxInFlight': 'engine',
  'tools.maxTimeout': 'engine',
  'async.enabled': 'engine',
  // `--wait-async` keeps print mode alive across job results; this app never
  // runs print mode, so nothing in the GUI reads the flag.
  'async.printWake': 'tui-only',
  'async.widgets': 'engine',
  'tools.commands': 'engine',
  'tools.commandDocs': 'engine',
  'tools.commandInline': 'config-only',
  'tools.commandNotices': 'engine',
  // `dev.autoqa` posts tool grievances to https://qa.omp.sh and the fork never
  // registers a consent handler, so this toggle silently re-arms recording
  // with no GUI consent surface. It crosses the enterprise boundary and stays
  // in config.yml like `dev.autoqaPush.endpoint`.
  'dev.autoqa': 'boundary',
  'dev.autoqaPush.endpoint': 'boundary',
  'extensionHandlers.toolCallTimeoutMs': 'engine',
  'extensionHandlers.modeControl': 'engine',
  // `getAssistantTextRenderers`/`getLinkSchemes` have no consumer in this app;
  // the switch only changes OMP's terminal renderer.
  'extensionRenderers.assistantText': 'tui-only',
  'extensionRenderers.transcriptPresenters': 'tui-only',
  'browser.enabled': 'tools:available',
  'browser.cdpUrl': 'boundary',
  'browser.relay': 'boundary',
  'browser.relayUrl': 'boundary',
  'browser.headless': 'tools:browser',
  'browser.cmux': 'tools:browser',
  'browser.tern': 'tools:browser',
  'browser.freezeOnTurnEnd': 'tools:browser',
  'browser.idleCloseSec': 'tools:browser',
  'browser.screenshotDir': 'boundary',
  'mcp.enableProjectConfig': 'engine',
  'mcp.startupTimeoutMs': 'engine',
  'mcp.shared': 'boundary',
  'mcp.idleStopMinutes': 'config-only',
  // `setMcpRenderMarkdownResults` is a pi-tui renderer switch.
  'mcp.renderMarkdownResults': 'tui-only',
  'mcp.notifications': 'engine',
  'mcp.notificationDebounceMs': 'engine',
  // `spotlight.experiment.enabled` ships tool output to
  // https://cloud.stencil.so with a Stencil credential: egress, not a GUI
  // behaviour.
  'spotlight.experiment.enabled': 'boundary',

  // --- Untabbed settings explicitly placed ---
  // The role record is drawn by the shared `ModelRoleEditor`, not by a generic
  // row: Defaults (default), Agents (task, advisor), Tools (image) and Memory
  // (memory) each edit one role through the same control.
  'modelRoles': 'owned-by omp.modelRoles',
  'cycleOrder': 'tui-only',
  'modelPresets': 'tui-only',
  'suggestion.generator': 'owned-by chat.suggestion-generator',
};

function buildTable(): Readonly<Record<string, OmpSettingPlacement>> {
  const table: Record<string, OmpSettingPlacement> = {};
  for (const [id, raw] of Object.entries(RAW_PLACEMENTS)) {
    table[id] = parsePlacement(raw);
  }
  return table;
}

/**
 * The placement table mapping OMP setting IDs to their placement.
 * Untabbed IDs default to `{ type: 'hidden' }` unless listed above.
 */
export const OMP_SETTING_PLACEMENTS: Readonly<Record<string, OmpSettingPlacement>> = buildTable();

/** Pages that have GUI controls rendering their OMP settings. */
const GUI_WRITTEN_PAGES: Readonly<Record<string, true>> = {
  sessions: true,
  chat: true,
  behavior: true,
  agents: true,
  tools: true,
  memory: true,
};

/**
 * Whether an engine setting has a working GUI control:
 * booleans become toggles, numbers become steppers, strings/enums/options become chips/selects.
 * Complex non-primitive settings (Record, Array) with no declared options or enum values
 * cannot be edited via generic controls and would render as empty chip groups; they stay in config.yml.
 */
function isRenderableEngineSetting(setting: {
  readonly id: string;
  readonly type: string;
  readonly options?: readonly unknown[];
  readonly enumValues?: readonly unknown[];
}): boolean {
  if (setting.type === 'boolean' || setting.type === 'number' || setting.type === 'string') return true;
  const choices = setting.options ?? setting.enumValues ?? [];
  return choices.length > 0;
}
function extractChoices(s: object): { options?: readonly unknown[]; enumValues?: readonly unknown[] } {
  const options = 'options' in s && Array.isArray(s.options) ? s.options : undefined;
  const enumValues = 'enumValues' in s && Array.isArray(s.enumValues) ? s.enumValues : undefined;
  return { options, enumValues };
}

const ORDERED_SETTINGS_MAP: ReadonlyMap<string, { type: string; options?: readonly unknown[]; enumValues?: readonly unknown[] }> = new Map(
  orderedSettings().map((s) => {
    const { options, enumValues } = extractChoices(s);
    return [s.id, { type: s.type, options, enumValues }];
  }),
);
/** The ids the OMP route returns and accepts: rows a GUI owner draws or writes. Every other id is omitted and refused. */
export const OMP_SETTING_EXPOSED_IDS: ReadonlySet<string> = new Set(
  Object.entries(OMP_SETTING_PLACEMENTS)
    .filter(([id, placement]) => {
      if (placement.type === 'owned-by') return true;
      if (placement.type === 'page') {
        if (GUI_WRITTEN_PAGES[placement.page] !== true) return false;
        // A page placement is a claim that a control draws the row; a value no
        // control can draw is placed `config-only` instead, so this is only a
        // guard against a future mis-placement rendering an empty chip group.
        const desc = ORDERED_SETTINGS_MAP.get(id);
        return desc ? isRenderableEngineSetting({ id, ...desc }) : false;
      }
      if (placement.type === 'engine') {
        const desc = ORDERED_SETTINGS_MAP.get(id);
        return desc ? isRenderableEngineSetting({ id, ...desc }) : false;
      }
      return false;
    })
    .map(([id]) => id),
);

/** Every owner named by an owned-by placement, so a test can check they are real controls. */
export const OMP_SETTING_OWNER_IDS: readonly string[] = [
  ...new Set(
    Object.values(OMP_SETTING_PLACEMENTS)
      .flatMap((p) => (p.type === 'owned-by' ? [p.owner] : []))
  ),
];

/**
 * OMP gates several of its panel rows on conditions over live settings.
 * Unknown condition names leave the row visible.
 */
const CONDITIONS: Readonly<Record<string, (settings: Settings) => boolean>> = {
  advisorEnabled: (settings) => cfgAdvisorEnabled.get(settings) === true,
  composerPredictionsEnabled: (settings) => cfgComposerPredictions.get(settings) === true,
  usageAwareFallbackEnabled: (settings) => cfgRetryUsageAwareFallback.get(settings) === true,
  planModeEnabled: (settings) => cfgPlanEnabled.get(settings) === true,
  planAutosaveEnabled: (settings) => cfgPlanEnabled.get(settings) === true,
  // OMP's `settings-ui.ts` gates this on `cfgDefaultThinkingLevel === "auto"`;
  // the auto thinking ceiling only applies to the auto preset.
  autoThinkingActive: (settings) => cfgDefaultThinkingLevel.get(settings) === 'auto',
};

export interface OmpSettingPresentation {
  readonly placement: OmpSettingPlacement;
  readonly condition?: string;
  readonly conditionActive?: boolean;
}

/**
 * Placement plus OMP's own condition state for one descriptor.
 */
export function presentOmpSetting(
  id: string,
  condition: string | undefined,
  settings: Settings,
): OmpSettingPresentation {
  const placement = OMP_SETTING_PLACEMENTS[id] ?? { type: 'hidden' };
  const presentation: OmpSettingPresentation = { placement };
  if (condition === undefined) return presentation;
  const evaluate = Object.hasOwn(CONDITIONS, condition) ? CONDITIONS[condition] : undefined;
  return {
    ...presentation,
    condition,
    conditionActive: evaluate === undefined ? true : evaluate(settings),
  };
}
