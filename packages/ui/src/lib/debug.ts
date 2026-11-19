import { z } from 'zod';
import type { Message, Part, StepSummaryPart } from '@openchamber/agent-contract';
import { useSessionUIStore, getRememberedSessionDirectory } from '@/sync/session-ui-store';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { canonicalClient } from '@/api/canonicalClient';
import { hostFilesystem } from '@/lib/host-filesystem';
import { checkIsGitRepository } from '@/lib/gitApi';
import { streamDebugEnabled } from '@/stores/utils/streamDebug';
import { copyTextToClipboard as copyPlainTextToClipboard, type ClipboardCopyResult } from '@/lib/clipboard';
import { getSyncSessions, getSyncMessages, getSyncParts, getAllSyncSessions, getSyncSessionDirectory, getDirectoryState } from '@/sync/sync-refs';
import {
  describeSessionDirectorySources,
  resolveSessionDirectoryFromSources,
  type SessionDirectoryResolution,
  type SessionDirectorySource,
} from '@/sync/session-directory-resolution';
import { useSessionWorktreeStore } from '@/sync/session-worktree-store';
import { getRecentSendFailures, type SendFailureRecord } from '@/sync/send-failure-log';
import { getRecentSessionErrors, type SessionErrorRecord } from '@/sync/session-error-log';
import { buildRuntimeStatusReport } from '@/lib/runtimeStatus';
import { getAttachedSessionDirectory } from '@/sync/session-worktree-contract';
import { useStreamingStore } from '@/sync/streaming';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';

const DebugLocationSchema = z.object({ directory: z.string().optional(), worktree: z.string().optional() });
const DebugHostHealthSchema = z.object({
  status: z.string(),
  openchamberVersion: z.string().optional(),
  runtime: z.string().optional(),
  agentService: z.object({ phase: z.string(), pid: z.number().nullable(), port: z.number().nullable() }).optional(),
});
type DebugHostHealthReport =
  | {
      status: number;
      ok: boolean;
      hostStatus: string | null;
      version: string | null;
      runtime: string | null;
      agentService: z.infer<typeof DebugHostHealthSchema>['agentService'] | null;
    }
  | { error: string };


type SessionDirectoryReport = {
  sessionId: string;
  isCurrentSession: boolean;
  routedDirectory: string | null;
  resolvedFrom: SessionDirectorySource;
  conflict: SessionDirectoryResolution['conflict'];
  sources: Array<{ source: SessionDirectorySource; directory: string }>;
  details: {
    owningChildStore: string | null;
    sessionDisplayPath: string | null;
    sessionIndexed: boolean;
    currentSessionDirectory: string | null;
    rememberedForRuntime: string | null;
    persistedAcrossRestarts: string | null;
    activeDirectory: string | null;
    hostDirectory: string | null;
  };
};

type CompletionStatusReport = {
  messageId: string;
  supported: false;
  unsupportedReason: string;
  completed: null;
  status: null;
  hasCompletedFlag: null;
  hasStopReason: null;
  messageIsComplete: null;
  stepSummaries: StepSummaryPart[];
  raw: Message;
};

type AppStatusReport = {
  runtime: { platform: string | null; isDesktop: boolean; hasRuntimeApis: boolean; desktopServerOrigin: string | null };
  location: { href: string | null; origin: string | null } | null;
  directories: Record<string, unknown>;
  projects: Record<string, unknown>;
  sessions: Record<string, unknown>;
  worktrees: Record<string, unknown>;
  git: { isGitRepo: boolean | null; error?: string };
  localStorage: Record<string, unknown>;
  host: Record<string, unknown>;
  agentService: Record<string, unknown>;
  openchamber: Record<string, unknown>;
  recentSendFailures: SendFailureRecord[];
  recentSessionErrors: SessionErrorRecord[];
  currentSessionDirectoryResolution: SessionDirectoryReport | null;
};

interface DebugMessageInfo {
  messageId: string;
  role: string;
  timestamp: number;
  partsCount: number;
  parts: Array<{
    id: string;
    type: string;
    text?: string;
    textLength?: number;
    tool?: string;
    state?: string;
    isStepMarker?: boolean;
  }>;
  isEmpty: boolean;
  isEmptyResponse: boolean;
  raw: Message;
}

export const debugUtils = {

  getLastAssistantMessage(): DebugMessageInfo | null {
    const state = useSessionUIStore.getState();
    const currentSessionId = state.currentSessionId;

    if (!currentSessionId) {
      console.log('[ERROR] No active session');
      return null;
    }

    const messages = getSyncMessages(currentSessionId);
    if (!messages || messages.length === 0) {
      console.log('[ERROR] No messages in current session');
      return null;
    }

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant') {
        const msgParts = getSyncParts(msg.messageId);
        const parts = msgParts.map((part) => {
          const info: DebugMessageInfo['parts'][number] = {
            id: part.partId,
            type: part.type,
          };

          if (part.type === 'text') {
            info.text = part.content;
            info.textLength = part.content.length;
          } else if (part.type === 'tool_call' || part.type === 'tool_result') {
            info.tool = part.toolName;
            info.state = part.type === 'tool_call' ? part.status : part.isError ? 'failed' : 'completed';
          } else if (part.type === 'step_summary') {
            info.isStepMarker = true;
          }

          return info;
        });

        const hasText = parts.some((p) => p.type === 'text' && p.text && p.text.trim().length > 0);
        const hasTools = parts.some((p) => p.type === 'tool_call' || p.type === 'tool_result');
        const hasStepMarkers = parts.some((p) => p.type === 'step_summary');
        const isEmpty = parts.length === 0;
        const isEmptyResponse = !hasText && !hasTools && (!isEmpty || hasStepMarkers);

        const info: DebugMessageInfo = {
          messageId: msg.messageId,
          role: msg.role,
          timestamp: msg.createdAt,
          partsCount: parts.length,
          parts,
          isEmpty,
          isEmptyResponse,
          raw: msg,
        };

        console.log('[INSPECT] Last Assistant Message:', info);
        console.log('[SUMMARY] Summary:', {
          messageId: info.messageId,
          partsCount: info.partsCount,
          isEmpty: info.isEmpty,
          isEmptyResponse: info.isEmptyResponse,
          hasText,
          hasTools,
          hasStepMarkers,
          onlyStepMarkers: hasStepMarkers && !hasText && !hasTools,
        });

        if (info.isEmpty) {
          console.warn('[WARNING] Message has NO parts!');
        }

        if (info.isEmptyResponse) {
          console.warn('[WARNING] Message has parts but NO meaningful content (empty text, no tools)!');

          if (hasStepMarkers && !hasText && !hasTools) {
            console.warn('[CRITICAL] EMPTY RESPONSE: Only step summaries, no actual content!');
            console.log('Recommendation: Send a follow-up message or try a different model');
          }
        }

        return info;
      }
    }

    console.log('[ERROR] No assistant messages found in current session');
    return null;
  },

  truncateString(value: string | undefined, maxLength: number = 80): string | undefined {
    if (!value || typeof value !== 'string') return value;
    if (value.length <= maxLength) return value;
    return value.substring(0, maxLength) + '…';
  },

  truncateMessages(messages: Message[]): Message[] {
    return messages.map((msg) => ({
      ...msg,
      parts: getSyncParts(msg.messageId).map((part): Part => {
        if (part.type === 'text' || part.type === 'reasoning') {
          return { ...part, content: this.truncateString(part.content) ?? '' };
        }
        if (part.type === 'tool_result') {
          return {
            ...part,
            output: typeof part.output === 'string' ? this.truncateString(part.output) : part.output,
            error: this.truncateString(part.error),
          };
        }
        return part;
      }),
    }));
  },

  getCachedMessageCount(sessionId: string, directory?: string) {
    const state = getDirectoryState(directory);
    return state?.message[sessionId]?.length ?? -1;
  },

  getAllMessages(truncate: boolean = false): Message[] {
    const state = useSessionUIStore.getState();
    const currentSessionId = state.currentSessionId;

    if (!currentSessionId) {
      console.log('[ERROR] No active session');
      return [];
    }

    const messages = getSyncMessages(currentSessionId);
    console.log(`[MESSAGES] Total messages in session: ${messages.length}`);

    messages.forEach((msg, idx) => {
      const msgParts = getSyncParts(msg.messageId);
      console.log(`[${idx}] ${msg.role} - ${msg.messageId} - ${msgParts.length} parts`);
    });

    return truncate ? this.truncateMessages(messages) : messages;
  },

  async getAppStatus(): Promise<AppStatusReport> {
    const directoryState = useDirectoryStore.getState();
    const sessionState = useSessionUIStore.getState();
    const projectsState = useProjectsStore.getState();
    const currentDirectory = directoryState.currentDirectory || null;
    const hostDirectory = hostFilesystem.getDirectory() ?? null;

    const sessions = getSyncSessions();
    const sessionDirectories = new Set<string>();
    const sessionDirectoryCounts: Record<string, number> = {};

    sessions.forEach((session) => {
      const directory = getSyncSessionDirectory(session.sessionId);
      if (typeof directory === 'string' && directory.trim().length > 0) {
        sessionDirectories.add(directory);
        sessionDirectoryCounts[directory] = (sessionDirectoryCounts[directory] ?? 0) + 1;
      } else {
        sessionDirectoryCounts['(none)'] = (sessionDirectoryCounts['(none)'] ?? 0) + 1;
      }
    });

    const localStorageSnapshot = (() => {
      if (typeof window === 'undefined') {
        return { available: false };
      }
      try {
        return {
          available: true,
          lastDirectory: window.localStorage.getItem('lastDirectory'),
          homeDirectory: window.localStorage.getItem('homeDirectory'),
        };
      } catch (error) {
        return {
          available: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    })();

    const runtimeApis = getRegisteredRuntimeAPIs();
    const isDesktopRuntime = typeof window !== 'undefined' && Boolean((window as { __OPENCHAMBER_ELECTRON__?: unknown }).__OPENCHAMBER_ELECTRON__);

    const safeJson = async (resp: Response) => {
      try {
        return await resp.json();
      } catch {
        return null;
      }
    };


    const safeFetchJson = async (url: string): Promise<unknown> => {
      try {
        const resp = await runtimeFetch(url);
        return resp.ok ? await safeJson(resp) : { status: resp.status };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    };

    let pathInfo: unknown = null;
    let projectInfo: unknown = null;
    let settingsInfo: unknown = null;
    let hostHealth: DebugHostHealthReport | null = null;
    let agentServiceReadiness: { ready: boolean; error?: string } = { ready: false };

    if (currentDirectory) {
      try {
        const workspace = await canonicalClient.resolveWorkspace(currentDirectory);
        pathInfo = {
          directory: currentDirectory,
          worktree: workspace.displayPath,
          workspaceId: workspace.workspaceId,
          projectId: workspace.projectId,
        };
      } catch (error) {
        pathInfo = { error: error instanceof Error ? error.message : String(error) };
      }
    } else {
      pathInfo = { error: 'No active workspace directory' };
    }
    const locationInfo = DebugLocationSchema.safeParse(pathInfo).data;
    projectInfo = projectsState.getActiveProject();

    settingsInfo = await safeFetchJson('/api/config/settings');

    try {
      const resp = await runtimeFetch('/health');
      const body = await safeJson(resp);
      const health = DebugHostHealthSchema.safeParse(body).data;
      hostHealth = {
        status: resp.status,
        ok: resp.ok,
        hostStatus: health?.status ?? null,
        version: health?.openchamberVersion ?? null,
        runtime: health?.runtime ?? null,
        agentService: health?.agentService ?? null,
      };
    } catch (error) {
      hostHealth = { error: error instanceof Error ? error.message : String(error) };
    }

    try {
      agentServiceReadiness = { ready: await canonicalClient.checkReady() };
    } catch {
      agentServiceReadiness = { ready: false, error: 'readiness request failed' };
    }

    let gitCheck: { isGitRepo: boolean | null; error?: string } = { isGitRepo: null };
    if (currentDirectory) {
      try {
        gitCheck.isGitRepo = await checkIsGitRepository(currentDirectory);
      } catch (error) {
        gitCheck = {
          isGitRepo: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    const projectSamples = projectsState.projects.map((project) => ({
      id: project.id,
      path: project.path,
      label: project.label,
    }));

    const report = {
      runtime: {
        platform: runtimeApis?.runtime?.platform ?? null,
        isDesktop: isDesktopRuntime,
        hasRuntimeApis: Boolean(runtimeApis),
        desktopServerOrigin: null,
      },
      location: typeof window !== 'undefined'
        ? {
            href: window.location?.href ?? null,
            origin: window.location?.origin ?? null,
          }
        : null,
      directories: {
        currentDirectory,
        hostDirectory: locationInfo?.directory
          || locationInfo?.worktree
          || hostDirectory,
        homeDirectory: directoryState.homeDirectory || null,
        isHomeReady: directoryState.isHomeReady,
        hasPersistedDirectory: directoryState.hasPersistedDirectory,
        isSwitchingDirectory: directoryState.isSwitchingDirectory,
      },
      projects: {
        total: projectsState.projects.length,
        activeProjectId: projectsState.activeProjectId,
        samples: projectSamples,
      },
      sessions: {
        total: sessions.length,
        currentSessionId: sessionState.currentSessionId,
        lastLoadedDirectory: sessionState.lastLoadedDirectory,
        uniqueDirectories: sessionDirectories.size,
        directorySamples: Array.from(sessionDirectories).slice(0, 5),
        directoryCounts: sessionDirectoryCounts,
      },
      worktrees: {
        available: sessionState.availableWorktrees.length,
        metadataEntries: sessionState.worktreeMetadata.size,
      },
      git: gitCheck,
      localStorage: localStorageSnapshot,
      host: {
        pathInfo,
        projectInfo,
        health: hostHealth,
      },
      agentService: agentServiceReadiness,
      openchamber: {
        settingsInfo,
      },
      recentSendFailures: getRecentSendFailures(),
      recentSessionErrors: getRecentSessionErrors(),
      currentSessionDirectoryResolution: sessionState.currentSessionId
        ? this.diagnoseSessionDirectory(sessionState.currentSessionId)
        : null,
    };

    console.log('[DEBUG] App status snapshot:', report);
    return report;
  },

  /**
   * The same text the Runtime Status dialog shows, for a console or remote
   * session that cannot open the dialog.
   */
  async statusReport(): Promise<string> {
    const text = await buildRuntimeStatusReport();
    console.log(text);
    return text;
  },

  /**
   * Prompt sends that were rejected and rolled back in this app session.
   * Newest first; empty means no send was rejected.
   */
  getRecentSendFailures(): SendFailureRecord[] {
    const failures = getRecentSendFailures();
    if (failures.length === 0) {
      console.log('[OK] No prompt sends were rejected in this session.');
    } else {
      console.warn(`[ALERT] ${failures.length} rejected prompt send(s):`);
      console.table(failures);
    }
    return failures;
  },

  /**
   * Report how a session's directory is resolved, from every source, in
   * precedence order. A send is routed by the winning value, so a disagreement
   * here explains a prompt that vanishes without an error: it was posted
   * against a directory that does not own the session.
   */
  diagnoseSessionDirectory(sessionId?: string): SessionDirectoryReport | null {
    const sessionState = useSessionUIStore.getState();
    const targetSessionId = sessionId ?? sessionState.currentSessionId;

    if (!targetSessionId) {
      console.log('[ERROR] No session selected and no session id passed');
      return null;
    }

    const attachment = getAttachedSessionDirectory(
      useSessionWorktreeStore.getState().getAttachment(targetSessionId),
    );
    const worktreeMetadata = sessionState.worktreeMetadata.get(targetSessionId)?.path ?? null;
    const owningStoreDirectory = getSyncSessionDirectory(targetSessionId);
    const sessionRecord = getAllSyncSessions().find((session) => session.sessionId === targetSessionId);
    const selected = targetSessionId === sessionState.currentSessionId
      ? sessionState.currentSessionDirectory
      : null;

    const remembered = getRememberedSessionDirectory(targetSessionId);

    const sources = {
      attachment,
      worktreeMetadata,
      // Native routing comes from workspace ownership, not public display paths.
      authoritative: owningStoreDirectory,
      selected,
      remembered: remembered.runtime,
    };

    const resolution = resolveSessionDirectoryFromSources(sources);
    const routedDirectory = sessionState.getDirectoryForSession(targetSessionId);

    const report = {
      sessionId: targetSessionId,
      isCurrentSession: targetSessionId === sessionState.currentSessionId,
      routedDirectory,
      resolvedFrom: resolution.source,
      conflict: resolution.conflict,
      sources: describeSessionDirectorySources(sources),
      details: {
        owningChildStore: owningStoreDirectory,
        sessionDisplayPath: sessionRecord?.displayPath ?? null,
        sessionIndexed: Boolean(sessionRecord),
        currentSessionDirectory: sessionState.currentSessionDirectory,
        rememberedForRuntime: remembered.runtime,
        persistedAcrossRestarts: remembered.persisted,
        activeDirectory: useDirectoryStore.getState().currentDirectory ?? null,
        hostDirectory: hostFilesystem.getDirectory() ?? null,
      },
    };

    console.log('[DEBUG] Session directory resolution:', report);
    if (resolution.conflict) {
      console.warn(
        `[ALERT] Directory sources disagree: using "${resolution.directory}" (${resolution.source}) `
        + `while "${resolution.conflict.directory}" came from ${resolution.conflict.source}.`,
      );
    } else if (!routedDirectory) {
      console.warn('[ALERT] No directory resolved for this session — sends fall back to the active directory.');
    } else {
      console.log('[OK] All known sources agree on the session directory.');
    }

    return report;
  },

  async buildDiagnosticsReport(): Promise<string> {
    const report = await this.getAppStatus();
    return JSON.stringify(report, null, 2);
  },

  async copyTextToClipboard(text: string): Promise<ClipboardCopyResult> {
    return copyPlainTextToClipboard(text);
  },

  async copyDiagnosticsReport(): Promise<ClipboardCopyResult & { report: string }> {
    const report = await this.buildDiagnosticsReport();
    const result = await this.copyTextToClipboard(report);
    return { ...result, report } as const;
  },

   checkLastMessage() {
    const info = this.getLastAssistantMessage();
    if (!info) return false;

    const isProblematic = info.isEmpty || info.isEmptyResponse;

    if (isProblematic) {
      console.error('[ALERT] PROBLEMATIC MESSAGE DETECTED!');
      console.log('Details:', {
        messageId: info.messageId,
        isEmpty: info.isEmpty,
        isEmptyResponse: info.isEmptyResponse,
        partsCount: info.partsCount,
      });

      if (info.parts.length > 0) {
        console.log('Parts:', info.parts);
      }
    } else {
      console.log('[OK] Last message looks good!');
    }

    return isProblematic;
  },

  getStreamingState() {
    const sessionState = useSessionUIStore.getState();
    const streamingState = useStreamingStore.getState();
    const currentStreamingId = sessionState.currentSessionId
      ? streamingState.streamingMessageIds.get(sessionState.currentSessionId) ?? null
      : null;
    console.log('[STREAM] Streaming State:', {
      streamingMessageId: currentStreamingId,
      streamingMessageIds: Array.from(streamingState.streamingMessageIds.entries()),
      messageStreamStates: Array.from(streamingState.messageStreamStates.entries()),
    });
    return {
      streamingMessageId: currentStreamingId,
      streamingMessageIds: streamingState.streamingMessageIds,
      streamStates: streamingState.messageStreamStates,
    };
  },

  findEmptyMessages(): Message[] {
    const state = useSessionUIStore.getState();
    const currentSessionId = state.currentSessionId;

    if (!currentSessionId) {
      console.log('[ERROR] No active session');
      return [];
    }

    const messages = getSyncMessages(currentSessionId);
    const emptyMessages = messages
      .filter((msg) => msg.role === 'assistant')
      .filter((msg) => {
        const parts = getSyncParts(msg.messageId);
        const hasTextContent = parts.some(
          (p) => p.type === 'text' && p.content.trim().length > 0
        );
        const hasTools = parts.some((p) => p.type === 'tool_call' || p.type === 'tool_result');

        return parts.length === 0 || (!hasTextContent && !hasTools);
      });

    console.log(`[INSPECT] Found ${emptyMessages.length} empty assistant messages`);

    emptyMessages.forEach((msg, idx) => {
      const parts = getSyncParts(msg.messageId);
      console.log(`[${idx}] Empty message:`, {
        messageId: msg.messageId,
        partsCount: parts.length,
        provider: msg.providerId,
        model: msg.modelId,
        timestamp: msg.createdAt,
      });
    });

    return emptyMessages;
  },

   showRetryHelp() {
     console.log('[DEBUG] How to handle empty Claude responses:\n');
     console.log('1. Check the last message:');
    console.log('   __opencodeDebug.getLastAssistantMessage()\n');
    console.log('2. Find all empty messages in session:');
    console.log('   __opencodeDebug.findEmptyMessages()\n');
    console.log('3. To retry, you can:');
    console.log('   - Edit your last user message and resend');
    console.log('   - Send a follow-up message like "Please provide the response"');
    console.log('   - Try a different model (OpenAI models tend to be more reliable)\n');
    console.log('[TIP] Empty responses are usually due to:');
    console.log('   - Model rate limits');
    console.log('   - Context length issues');
    console.log('   - Model refusing to respond to certain prompts');
    console.log('   - API errors from provider');
  },

  analyzeMessageCompletionConsistency(options: {
    includeNonAssistant?: boolean;
    verbose?: boolean;
    maxTableRows?: number;
  } = {}) {
    const { includeNonAssistant = false, verbose = true, maxTableRows = 25 } = options;
    const state = useSessionUIStore.getState();
    const currentSessionId = state.currentSessionId;

    if (!currentSessionId) {
      console.log('[ERROR] No active session');
      return { summary: null, rows: [] };
    }

    const messages = getSyncMessages(currentSessionId);
    const targetMessages = includeNonAssistant
      ? messages
      : messages.filter((msg) => msg.role === 'assistant');

    // Canonical messages have creation timestamps, but no completion or part
    // timestamps. Missing timing support must not be reported as a failed turn.
    const unsupportedReason = 'Canonical messages do not expose completion or part timestamps.';
    const summary = {
      totalMessages: messages.length,
      analyzedMessages: targetMessages.length,
      supported: false,
      unsupportedReason,
      completedMissing: null,
      completedBeforeTool: null,
      completedBeforeReasoning: null,
      runningToolsWhenCompleted: null,
      reasoningOpenWhenCompleted: null,
      withTools: 0,
      withReasoning: 0,
    };

    const rows = targetMessages.map((message, index) => {
      const parts = getSyncParts(message.messageId);
      const hasTools = parts.some((part) => part.type === 'tool_call' || part.type === 'tool_result');
      const hasReasoning = parts.some((part) => part.type === 'reasoning');
      if (hasTools) summary.withTools += 1;
      if (hasReasoning) summary.withReasoning += 1;
      return {
        index,
        messageId: message.messageId,
        role: message.role,
        supported: false,
        unsupportedReason,
        completedAt: null,
        latestToolTimestamp: null,
        latestReasoningTimestamp: null,
        latestPartTimestamp: null,
        completed_missing: null,
        completed_before_tool: null,
        completed_before_reasoning: null,
        running_tools_when_completed: null,
        reasoning_open_when_completed: null,
        has_tools: hasTools,
        has_reasoning: hasReasoning,
      };
    });

    if (verbose) {
      console.table(rows.slice(0, maxTableRows));
      if (rows.length > maxTableRows) {
        console.log(`Displayed first ${maxTableRows} rows out of ${rows.length}.`);
      }
      console.log('[SUMMARY] Message completion timing:', summary);
    }

    return { summary, rows };
  },

  checkCompletionStatus(): CompletionStatusReport | null {
    const state = useSessionUIStore.getState();
    const currentSessionId = state.currentSessionId;

    if (!currentSessionId) {
      console.log('[ERROR] No active session');
      return null;
    }

    const messages = getSyncMessages(currentSessionId);
    const assistantMessages = messages.filter(m => m.role === 'assistant');

    if (assistantMessages.length === 0) {
      console.log('[ERROR] No assistant messages');
      return null;
    }

    const lastMessage = assistantMessages[assistantMessages.length - 1];
    const lastParts = getSyncParts(lastMessage.messageId);
    const stepSummaries = lastParts.filter((p) => p.type === 'step_summary');
    const unsupportedReason = 'Canonical messages do not expose completion timestamps, status, or stop reasons.';
    const completedAt = null;
    const messageStatus = null;
    const hasCompletedFlag = null;
    const hasStopReason = null;
    const messageIsComplete = null;

    const streamingState = useStreamingStore.getState();
    const streamingMessageId = streamingState.streamingMessageIds.get(lastMessage.sessionId) ?? null;
    const lifecycle = streamingState.messageStreamStates.get(lastMessage.messageId);
    const isStreamingCandidate = lastMessage.messageId === streamingMessageId;

    console.log('[SUMMARY] Completion Status:');
    console.log('Message ID:', lastMessage.messageId);
    console.log('Completion diagnostics unsupported:', unsupportedReason);
    console.log('status:', messageStatus);
    console.log('hasCompletedFlag:', hasCompletedFlag);
    console.log('hasStopReason:', hasStopReason);
    console.log('messageIsComplete:', messageIsComplete);
    console.log('lifecycle phase:', lifecycle?.phase);
    console.log('isStreamingCandidate:', isStreamingCandidate);
    console.log('streamingMessageId:', streamingMessageId);
    console.log('Step summaries:', stepSummaries);

    return {
      messageId: lastMessage.messageId,
      supported: false,
      unsupportedReason,
      completed: completedAt,
      status: messageStatus,
      hasCompletedFlag,
      hasStopReason,
      messageIsComplete,
      stepSummaries,
      raw: lastMessage,
    };
  },
};

if (typeof window !== 'undefined') {
  Object.assign(window, { __opencodeDebug: debugUtils });
  if (streamDebugEnabled()) {
    console.log('[DEBUG] OpenCode Debug Utils loaded! Use window.__opencodeDebug in console');
    console.log('Available commands:');
    console.log('  __opencodeDebug.getLastAssistantMessage() - Get last assistant message details');
    console.log('  __opencodeDebug.getAllMessages(truncate?) - List all messages (truncate=true for short preview)');
    console.log('  __opencodeDebug.truncateMessages(messages) - Truncate long fields in messages array');
    console.log('  __opencodeDebug.getAppStatus() - Show app status snapshot');
    console.log('  __opencodeDebug.diagnoseSessionDirectory(sessionId?) - Show how the session directory is resolved');
    console.log('  __opencodeDebug.getRecentSendFailures() - List prompt sends that were rejected and rolled back');
    console.log('  __opencodeDebug.checkLastMessage() - Check if last message is problematic');
    console.log('  __opencodeDebug.findEmptyMessages() - Find all empty assistant messages');
    console.log('  __opencodeDebug.showRetryHelp() - Show instructions for handling empty responses');
    console.log('  __opencodeDebug.getStreamingState() - Get streaming state info');
    console.log('  __opencodeDebug.analyzeMessageCompletionConsistency(opts?) - Compare time.completed vs part timings');
    console.log('  __opencodeDebug.checkCompletionStatus() - Check completion status of last message');
  }

  window.addEventListener('error', (event) => {
    try {
      const message = event.message || '';
      const source = event.filename || '';
      if (
        typeof message === 'string' &&
        message.includes("this._renderer.value.dimensions") &&
        /xterm/i.test(String(source))
      ) {
        event.preventDefault();
      }
    } catch { /* ignored */ }
  });
}
