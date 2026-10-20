import type {
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
} from "@openchamber/agent-contract"

/** Resolved filesystem context retained for UI routing and directory selection. */
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

/** Per-directory canonical runtime state. Host metadata is revisioned on Session. */
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
}

export const INITIAL_GLOBAL_STATE: GlobalState = {
  ready: false,
  path: EMPTY_PATH,
  projects: [],
  workspaces: [],
  discoveryErrors: {},
  reload: undefined,
}

