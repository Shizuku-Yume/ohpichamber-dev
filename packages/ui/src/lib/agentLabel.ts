import type { Agent } from '@openchamber/agent-contract';

<<<<<<< HEAD
/** Canonical agent profiles expose their user-facing label as `name`. */
export function agentLabel(agent: Pick<Agent, 'name'>): string {
    return agent.name;
||||||| bc50ba56aa
/**
 * The name to show for an agent. OpenCode sends a display name next to the
 * agent id; the id (`build`) is only a fallback, capitalized as before.
 */
export function agentLabel(agent: Pick<Agent, 'name' | 'displayName'>): string {
    const displayName = agent.displayName?.trim();
    if (displayName) return displayName;
    return agent.name.charAt(0).toUpperCase() + agent.name.slice(1);
=======
export function agentLabel(agent: Pick<Agent, 'name' | 'displayName'>): string {
    const displayName = agent.displayName?.trim();
    if (displayName) return displayName;
    return agent.name.charAt(0).toUpperCase() + agent.name.slice(1);
>>>>>>> upstream/main
}
