import { z } from 'zod';
import type { AgentSessionEvent } from '@oh-my-pi/pi-coding-agent/session/agent-session-events';
import type { VibeSpawnCorrelation } from './subagent-projection.ts';

const VIBE_SPAWN_TOOL = 'vibe_spawn';

const VibeSpawnArgsSchema = z.looseObject({
  prompt: z.string().optional().catch(undefined),
  name: z.string().optional().catch(undefined),
  cli: z.string().optional().catch(undefined),
});
type VibeSpawnArgs = z.infer<typeof VibeSpawnArgsSchema>;

const VibeSpawnDetailsSchema = z.looseObject({
  spawned: z.looseObject({
    id: z.string().min(1),
  }).optional(),
});

const VibeSpawnResultSchema = z.looseObject({
  isError: z.boolean().optional(),
  details: VibeSpawnDetailsSchema.optional(),
});

const VibeSpawnEventArgsSchema = z.looseObject({
  args: VibeSpawnArgsSchema.optional(),
});

export class VibeSpawnTracker {
  private readonly argsByCallId = new Map<string, VibeSpawnArgs>();

  constructor(private readonly onCorrelate: (correlation: VibeSpawnCorrelation) => void) { }

  observeSessionEvent(event: AgentSessionEvent, publicText: (text: string) => string): void {
    switch (event.type) {
      case 'message_update': {
        const update = event.assistantMessageEvent;
        if (update.type !== 'toolcall_end') break;
        const call = update.toolCall;
        if (call.id && call.name === VIBE_SPAWN_TOOL) {
          const parsedArgs = VibeSpawnArgsSchema.safeParse(call.arguments);
          if (parsedArgs.success) this.argsByCallId.set(call.id, parsedArgs.data);
        }
        break;
      }
      case 'message_end': {
        if (event.message.role !== 'assistant' || !Array.isArray(event.message.content)) break;
        for (const block of event.message.content) {
          if (block.type === 'toolCall' && block.name === VIBE_SPAWN_TOOL && !this.argsByCallId.has(block.id)) {
            const parsedArgs = VibeSpawnArgsSchema.safeParse(block.arguments);
            if (parsedArgs.success) this.argsByCallId.set(block.id, parsedArgs.data);
          }
        }
        break;
      }
      case 'tool_execution_start': {
        if (event.toolName === VIBE_SPAWN_TOOL && !this.argsByCallId.has(event.toolCallId)) {
          const parsedArgs = VibeSpawnArgsSchema.safeParse(event.args);
          if (parsedArgs.success) this.argsByCallId.set(event.toolCallId, parsedArgs.data);
        }
        break;
      }
      case 'tool_execution_update': {
        if (event.toolName !== VIBE_SPAWN_TOOL) break;
        const parsedArgs = VibeSpawnArgsSchema.safeParse(event.args);
        if (
          parsedArgs.success
          && (parsedArgs.data.prompt !== undefined || parsedArgs.data.name !== undefined || parsedArgs.data.cli !== undefined)
        ) {
          this.argsByCallId.set(event.toolCallId, parsedArgs.data);
        }
        const parsedResult = VibeSpawnResultSchema.safeParse(event.partialResult);
        const spawnedId = parsedResult.success ? parsedResult.data.details?.spawned?.id : undefined;
        if (!spawnedId) break;
        const args = parsedArgs.success && parsedArgs.data.prompt !== undefined
          ? parsedArgs.data
          : this.argsByCallId.get(event.toolCallId);
        this.emitCorrelation(event.toolCallId, spawnedId, args, publicText);
        break;
      }
      case 'tool_execution_end': {
        if (event.toolName !== VIBE_SPAWN_TOOL) break;
        const inlineArgs = VibeSpawnEventArgsSchema.safeParse(event);
        const parsedInlineArgs = inlineArgs.success ? inlineArgs.data.args : undefined;
        const savedArgs = this.argsByCallId.get(event.toolCallId);
        this.argsByCallId.delete(event.toolCallId);
        const parsedResult = VibeSpawnResultSchema.safeParse(event.result);
        const resultIsError = parsedResult.success && parsedResult.data.isError === true;
        if (event.isError || resultIsError) break;
        const spawnedId = parsedResult.success ? parsedResult.data.details?.spawned?.id : undefined;
        if (!spawnedId) break;
        const effectiveArgs = parsedInlineArgs?.prompt !== undefined ? parsedInlineArgs : (savedArgs ?? parsedInlineArgs);
        this.emitCorrelation(event.toolCallId, spawnedId, effectiveArgs, publicText);
        break;
      }
      default:
        break;
    }
  }

  private emitCorrelation(
    toolCallId: string,
    spawnedId: string,
    args: VibeSpawnArgs | undefined,
    publicText: (text: string) => string,
  ): void {
    const correlation: VibeSpawnCorrelation = {
      subagentId: spawnedId,
      toolCallId: publicText(toolCallId),
    };
    if (args?.prompt !== undefined) correlation.prompt = publicText(args.prompt);
    if (args?.name !== undefined) correlation.name = publicText(args.name);
    if (args?.cli !== undefined) correlation.cli = args.cli;
    this.onCorrelate(correlation);
  }
}
