import type { Agent } from '@openchamber/agent-contract';

/** Canonical agent profiles expose their user-facing label as `name`. */
export function agentLabel(agent: Pick<Agent, 'name'>): string {
    return agent.name;
}
