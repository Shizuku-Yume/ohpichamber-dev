import type {
 AdvisorNote,
 ApprovalRequest,
 Message,
 Project,
 QuestionRequest,
 Session,
 SessionRuntimeStatus,
 SessionSnapshot,
 Run,
 QueueState,
 CatalogUpdate,
 ShellJob,
 Workspace,
 ModelCatalog,
 ProviderCatalog,
 AgentCatalog,
 SessionMetadataState,
} from "@openchamber/agent-contract"

export type Path = {
 directory: string
 worktree: string
 home: string
 projectId?: string
 workspaceId?: string
}

export type ProjectMeta = {
 name?: string
 icon?: { override?: string; color?: string }
 commands?: { start?: string }
}

export type State = {
 status: "loading" | "partial" | "complete"
 project: string
 projectMeta: ProjectMeta | undefined
 icon: string | undefined
 path: Path
 workspace: Workspace | undefined
 models?: ModelCatalog
 providers?: ProviderCatalog
 agents?: AgentCatalog
 discoveryErrors?: Record<string, string>
 session: Session[]
 /**
  * Host metadata for sessions this directory does not hold yet, kept until a
  * session record arrives. An auto-generated title is announced for a session
  * created moments ago; dropping it left the row stale until a reload.
  */
 pendingMetadata?: Record<string, SessionMetadataState>
 sessionTotal: number
 sessionListSource?: "empty" | "persisted" | "live" | "authoritative"
 sessionRevision?: number
 sessionEventRevision?: Record<string, number>
 /** Bumped only when an accepted run acknowledgement changes run control. */
 runControlRevision?: Record<string, number>
 /**
  * Accepted live run for a session that has no snapshot yet. The projected
  * session row carries only `activeRunId`; the full run keeps the snapshot
  * invariant when the first in-flight snapshot is admitted.
  */
 runControlActiveRun?: Record<string, Run>
 sessionEpoch: Record<string, string>
 sessionCursor: Record<string, string>
 sessionDeletedRevision?: Record<string, number>
 session_status: Record<string, SessionRuntimeStatus>
 sessionStatusReady?: boolean
 sessionStatusInvalidated?: Record<string, true>
 snapshot: Record<string, SessionSnapshot>
 queue: Record<string, QueueState>
 catalog: Record<string, CatalogUpdate>
 shell: Record<string, ShellJob>
 partOwner: Record<string, Record<string, string>>
 permission: Record<string, ApprovalRequest[]>
 form: Record<string, QuestionRequest[]>
 vcs: unknown
 limit: number
 message: Record<string, Message[]>
 cleanse: Record<string, CleanseProgressState>
 advisor: Record<string, AdvisorState>
}
export type AdvisorState = {
 sessionId: string
 epoch: string
 sequence: string
 notes: AdvisorNote[]
 updatedAt: number
}
export type CleanseProgressState = {
 sessionId: string
 epoch: string
 sequence: string
 status: 'discovering' | 'repairing' | 'verifying' | 'completed' | 'failed' | 'cancelled'
 activeCheckers: string[]
 completedCheckers: string[]
 repairedFiles: string[]
 diagnosticsCount?: number
 summary?: string
 updatedAt: number
}

export type GlobalState = {
 ready: boolean
 error?: InitError
 path: Path
 projects: Project[]
 workspaces: Workspace[]
 discoveryErrors: Record<string, string>
 reload: undefined | "pending" | "complete"
}

type InitError = { type: "init"; message: string }

export type DirState = { lastAccessAt: number }

export type EvictPlan = {
 stores: string[]
 state: Map<string, DirState>
 pins: Set<string>
 max: number
 ttl: number
 graceMs?: number
 now: number
 hasPendingBlockingRequests?: (directory: string) => boolean
}

export type DisposeCheck = {
 directory: string
 hasStore: boolean
 pinned: boolean
 booting: boolean
 loadingSessions: boolean
 hasPendingBlockingRequests: boolean
}

export const MAX_DIR_STORES = 30
export const EVICTION_GRACE_MS = 30 * 1000
export const DIR_IDLE_TTL_MS = 20 * 60 * 1000
export const SESSION_CACHE_LIMIT = 20

const EMPTY_PATH: Path = { directory: "", worktree: "", home: "" }

export const INITIAL_STATE: State = {
 project: "",
 projectMeta: undefined,
 icon: undefined,
 path: EMPTY_PATH,
 workspace: undefined,
 status: "loading",
 session: [],
 sessionTotal: 0,
 sessionListSource: "empty",
 pendingMetadata: {},
 sessionRevision: 0,
 sessionEventRevision: {},
 runControlRevision: {},
 runControlActiveRun: {},
 sessionEpoch: {},
 sessionCursor: {},
 sessionDeletedRevision: {},
 snapshot: {},
 queue: {},
 catalog: {},
 shell: {},
 partOwner: {},
 session_status: {},
 permission: {},
 form: {},
 vcs: undefined,
 limit: 5,
 message: {},
 cleanse: {},
 advisor: {},
}

export const INITIAL_GLOBAL_STATE: GlobalState = {
 ready: false,
 path: EMPTY_PATH,
 projects: [],
 workspaces: [],
 discoveryErrors: {},
 reload: undefined,
}

