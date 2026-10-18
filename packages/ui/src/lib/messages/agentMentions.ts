import type { Agent } from '@openchamber/agent-contract';

interface AgentMentionSource {
  value: string;
  start: number;
  end: number;
}

interface ParsedAgentMention {
  name: string;
  source?: AgentMentionSource;
}

interface ParsedAgentResult {
  sanitizedText: string;
  mention: ParsedAgentMention | null;
}

const isWordBoundaryChar = (char: string | null): boolean => {
  if (!char) {
    return true;
  }
  return /(\s|\(|\)|\[|\]|\{|\}|"|'|`|,|\.|;|:)/.test(char);
};

export const parseAgentMentions = (rawText: string, agents: Agent[]): ParsedAgentResult => {
  if (rawText.length === 0) {
    return { sanitizedText: rawText, mention: null };
  }

  if (agents.length === 0 || !rawText.includes("@")) {
    return { sanitizedText: rawText, mention: null };
  }
  const selectableAgents = agents;

  let firstMention: ParsedAgentMention | null = null;

  for (const agent of selectableAgents) {
    const escapedAgentName = agent.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`@${escapedAgentName}\\b`, "gi");
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(rawText)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      const charBefore = start > 0 ? rawText[start - 1] : null;

      if (!isWordBoundaryChar(charBefore)) {
        continue;
      }

      const mention: ParsedAgentMention = {
        name: agent.name,
        source: {
          value: match[0],
          start,
          end,
        },
      };

      if (!firstMention) {
        firstMention = mention;
      }

    }
  }

  if (!firstMention) {
    return { sanitizedText: rawText, mention: null };
  }

  return {
    sanitizedText: rawText,
    mention: firstMention,
  };
};
