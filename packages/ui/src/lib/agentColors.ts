import type { Agent } from '@openchamber/agent-contract';
import type { Theme } from '@/types/theme';
import { chromaticDistance, contrastRatio } from './theme/color';

/** `color` is a semantic theme CSS variable. */
export type AgentColor = { color: string };

const BUILD_COLOR: AgentColor = { color: 'var(--status-success)' };
const SYNTAX_COLORS = [
  { key: 'keyword', color: 'var(--syntax-keyword)' },
  { key: 'type', color: 'var(--syntax-type)' },
  { key: 'function', color: 'var(--syntax-function)' },
  { key: 'number', color: 'var(--syntax-number)' },
  { key: 'string', color: 'var(--syntax-string)' },
  { key: 'operator', color: 'var(--syntax-operator)' },
  { key: 'variable', color: 'var(--syntax-variable)' },
] as const;
const MIN_SEPARATION = 0.055;

function hashName(name: string): number {
  let hash = 0;
  for (let index = 0; index < name.length; index++) hash = Math.imul(hash, 31) + name.charCodeAt(index) | 0;
  return hash >>> 0;
}

/** Allocate against the complete native directory roster, never a filtered picker list.
 * Build owns success; other agents exhaust distinct syntax colors before reuse.
 * Stable IDs keep assignments independent of profile labels and server ordering. */
export function createAgentColorResolver(theme: Theme, agents: readonly Pick<Agent, 'agentId'>[]) {
  const { surface, syntax, status } = theme.colors;
  const backgrounds = [surface.background, surface.muted, surface.elevated];
  const distance = (a: string, b: string) => Math.min(...backgrounds.map((background) =>
    chromaticDistance(a, b, background, surface.background) ?? (a === b ? 0 : 1)));
  const candidates = SYNTAX_COLORS.map((color) => ({ ...color, value: syntax.base[color.key] }));
  const visible = candidates.filter((color) => backgrounds.every((background) =>
    (contrastRatio(color.value, background, surface.background) ?? 1.5) >= 1.5));
  const remaining = [...(visible.length ? visible : candidates)];
  const palette: typeof candidates = [];
  const chosen = [status.success];
  while (remaining.length) {
    let bestIndex = 0;
    let bestDistance = -1;
    for (let index = 0; index < remaining.length; index++) {
      const separation = Math.min(...chosen.map((value) => distance(remaining[index].value, value)));
      if (separation > bestDistance) { bestIndex = index; bestDistance = separation; }
    }
    if (bestDistance < MIN_SEPARATION) break;
    const [color] = remaining.splice(bestIndex, 1);
    palette.push(color);
    chosen.push(color.value);
  }
  // Monochrome or very sparse themes may have no alternative to success.
  // Reuse a syntax role rather than inventing an unrelated decorative color.
  if (!palette.length) palette.push(visible[0] ?? candidates[0]);

  const ordered = [...agents].sort((a, b) => a.agentId < b.agentId ? -1 : a.agentId > b.agentId ? 1 : 0);
  const assigned = new Map<string, AgentColor>();
  const used = new Set<number>();
  for (const agent of ordered) {
    if (agent.agentId === 'build' || assigned.has(agent.agentId)) continue;
    if (used.size === palette.length) used.clear();
    const available = palette.map((_, index) => index).filter((index) => !used.has(index));
    // Prefer colored syntax accents to the neutral code foreground while possible.
    const colorful = available.filter((index) => distance(palette[index].value, '#808080') >= 0.035);
    const choices = colorful.length ? colorful : available;
    const index = choices[hashName(agent.agentId) % choices.length];
    assigned.set(agent.agentId, { color: palette[index].color });
    used.add(index);
  }
  return (agentId: string | undefined): AgentColor => {
    if (!agentId || agentId === 'build') return BUILD_COLOR;
    return assigned.get(agentId) ?? { color: palette[hashName(agentId) % palette.length].color };
  };
}
