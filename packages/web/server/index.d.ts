import type { Express } from "express";
import type { Server } from "http";
import type { AgentServiceSupervisorState } from "./lib/host/agent-service-supervisor.js";


export interface ScheduledTasksStatus {
  hasEnabledScheduledTasks: boolean;
  hasRunningScheduledTasks: boolean;
  enabledScheduledTasksCount: number;
  runningScheduledTasksCount: number;
}

export interface QuitRiskStatus {
  tunnel: {
    active: boolean;
  };
  scheduledTasks: ScheduledTasksStatus;
}

export interface WebUiServerController {
  expressApp: Express;
  httpServer: Server;
  getPort: () => number;
  startAgentService: () => Promise<AgentServiceSupervisorState>;
  stopAgentService: () => Promise<void>;
  getAgentServiceState: () => AgentServiceSupervisorState;
  getTunnelUrl: () => string | null;
  getQuitRiskStatus: () => QuitRiskStatus;
  stop: (options?: { exitProcess?: boolean }) => Promise<void>;
}

export interface DesktopNotificationPayload {
  title?: string;
  body?: string;
  tag?: string;
  kind?: "ready" | "error" | "question" | "permission" | "plugin";
  sessionId?: string;
  workspaceId?: string;
  projectId?: string;
  directory?: string;
  requireHidden?: boolean;
  showWhenFocused?: boolean;
}

export interface DesktopRuntimeConfig {
  apiBaseUrl: string;
  requestHeaders: Record<string, string>;
}

export interface DesktopUpdateInfo {
  available: boolean;
  currentVersion?: string;
  version?: string | null;
  body?: string | null;
  date?: string | null;
}

export interface DesktopUpdater {
  check: () => Promise<DesktopUpdateInfo>;
  install: () => Promise<DesktopUpdateInfo>;
  restart: () => Promise<void> | void;
}

export interface StartWebUiServerOptions {
  port?: number;
  host?: string;
  attachSignals?: boolean;
  exitOnShutdown?: boolean;
  apiOnly?: boolean;
  uiPassword?: string | null;
  tryCfTunnel?: boolean;
  tunnelProvider?: string;
  tunnelMode?: string;
  tunnelConfigPath?: string | null;
  tunnelToken?: string;
  tunnelHostname?: string;
  desktopUpdater?: DesktopUpdater;
  /** App-owned built-in resources outside Electron's ASAR archive. */
  builtInExtensionsDir?: string;
  onDesktopNotification?: (payload: DesktopNotificationPayload) => void;
  getIsWindowFocused?: () => boolean;
  getDesktopRuntimeConfig?: () => DesktopRuntimeConfig;
}

export interface ParseServeCliOptionsInput {
  argv?: string[];
  env?: Record<string, string | undefined>;
  defaultPort: number;
  cloudflareProvider: string;
  managedLocalMode: string;
}

export interface ParsedServeCliOptions {
  port: number;
  host?: string;
  uiPassword: string | null;
  tryCfTunnel: boolean;
  tunnelProvider?: string;
  tunnelMode?: string;
  tunnelConfigPath?: string | null;
  tunnelToken?: string;
  tunnelHostname?: string;
  apiOnly: boolean;
}

export declare function startWebUiServer(
  options?: StartWebUiServerOptions
): Promise<WebUiServerController>;

export declare function gracefulShutdown(options?: { exitProcess?: boolean }): Promise<void>;
export declare function parseArgs(options: ParseServeCliOptionsInput): ParsedServeCliOptions;
