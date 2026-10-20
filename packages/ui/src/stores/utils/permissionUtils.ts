import type { EditPermissionMode } from "../types/sessionTypes";

/**
 * Native agent profiles carry no ordered permission rules: the Host approval
 * policy decides each request, so editing starts from "ask" until the caller
 * supplies an explicit per-session or global mode.
 */
export const getAgentDefaultEditPermission: (agentName?: string) => EditPermissionMode = () => 'ask';
