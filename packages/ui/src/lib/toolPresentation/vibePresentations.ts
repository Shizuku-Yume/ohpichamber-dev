import { z } from 'zod';

import { inputText, text, tt } from './helpers';
import type { ToolPresentation } from './types';

const vibeScreenSnapshotSchema = z.object({
    id: z.string(),
    cli: z.string(),
    state: z.string(),
    killed: z.boolean().optional(),
    model: z.string().optional(),
    turns: z.number(),
    queued: z.number(),
    turnStartedAt: z.number().optional(),
    turnMessage: z.string().optional(),
    currentTool: z.string().optional(),
    currentToolArgs: z.string().optional(),
    lastIntent: z.string().optional(),
    trace: z.array(z.string()).default([]),
    outputTail: z.array(z.string()).default([]),
    lastActivity: z.string().optional(),
    lastActivityAt: z.number().optional(),
});

const vibeToolDetailsSchema = z.object({
    op: z.enum(['spawn', 'send', 'wait', 'kill', 'list']).optional(),
    screens: z.array(vibeScreenSnapshotSchema).default([]),
    hiddenKilled: z.array(z.string()).optional(),
    spawned: z.object({
        id: z.string(),
        cli: z.string(),
        jobId: z.string(),
    }).optional(),
    send: z.object({
        id: z.string(),
        mode: z.enum(['turn', 'steered', 'queued']),
        jobId: z.string().optional(),
    }).optional(),
    wait: z.object({
        settled: z.array(z.object({
            id: z.string(),
            jobId: z.string(),
            status: z.enum(['completed', 'failed', 'cancelled']),
        })),
        stillRunning: z.array(z.string()),
        timedOut: z.boolean(),
        waiting: z.boolean().optional(),
    }).optional(),
    killed: z.object({
        id: z.string(),
        cancelledTurn: z.boolean(),
    }).optional(),
});

export const VIBE_TOOL_PRESENTATIONS = {
    vibe_spawn: {
        label: 'Vibe spawn', icon: 'ai-agent', group: 'call', outputLanguage: 'text',
        describeCall: (input) => {
            const cli = inputText(input, 'cli');
            const target = inputText(input, 'name', 'prompt');
            const parts = [cli, target].filter(Boolean);
            return parts.length > 0 ? text(parts.join(' · ')) : null;
        },
        describeResult: (result) => {
            const spawned = vibeToolDetailsSchema.safeParse(result).data?.spawned;
            if (!spawned) return null;
            return text(`${spawned.id} · ${spawned.cli}`);
        },
    },
    vibe_send: {
        label: 'Vibe send', icon: 'send-plane', group: 'call', outputLanguage: 'text',
        describeCall: (input) => {
            const session = inputText(input, 'session');
            const snippet = text(input.message, 80);
            if (session && snippet) return text(`→ ${session} · ${snippet}`);
            if (session) return text(`→ ${session}`);
            return snippet;
        },
        describeResult: (result) => {
            const send = vibeToolDetailsSchema.safeParse(result).data?.send;
            if (!send) return null;
            return text(`${send.id} · ${send.mode}`);
        },
    },
    vibe_wait: {
        label: 'Vibe wait', icon: 'time', group: 'call', outputLanguage: 'text',
        describeCall: (input) => {
            const sessions = z.array(z.string()).safeParse(input.sessions).data
                ?.map((entry) => entry.trim())
                .filter(Boolean);
            if (sessions && sessions.length > 0) {
                return text(sessions.join(', '));
            }
            const timeout = z.number().safeParse(input.timeout).data;
            return timeout !== undefined ? `${timeout}s` : null;
        },
        describeResult: (result) => {
            const parsed = vibeToolDetailsSchema.safeParse(result).data;
            const wait = parsed?.wait;
            if (!wait) return null;
            if (wait.waiting === true && wait.settled.length === 0 && wait.stillRunning.length === 0 && !wait.timedOut) {
                const runningScreens = parsed.screens.filter((screen) => screen.state === 'running' || screen.state === 'starting').length;
                return runningScreens > 0 ? tt('chat.toolPart.summary.vibeRunning', { count: runningScreens }) : null;
            }
            const parts = [
                tt('chat.toolPart.summary.vibeSettled', { count: wait.settled.length }),
                tt('chat.toolPart.summary.vibeRunning', { count: wait.stillRunning.length }),
                wait.timedOut ? tt('chat.toolPart.summary.timedOut') : null,
            ].filter(Boolean);
            return parts.join(' · ');
        },
    },
    vibe_kill: {
        label: 'Vibe kill', icon: 'close', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'session'),
        describeResult: (result) => {
            const killed = vibeToolDetailsSchema.safeParse(result).data?.killed;
            if (!killed) return null;
            const parts = [
                killed.id,
                tt('chat.toolPart.summary.killed'),
                killed.cancelledTurn ? tt('chat.toolPart.summary.cancelledTurn') : null,
            ].filter(Boolean);
            return parts.join(' · ');
        },
    },
    vibe_list: {
        label: 'Vibe list', icon: 'layout', group: 'call', outputLanguage: 'text',
        describeCall: () => '',
        describeResult: (result) => {
            const parsed = vibeToolDetailsSchema.safeParse(result).data;
            if (!parsed) return null;
            const total = parsed.screens.length;
            const active = parsed.screens.filter((screen) => screen.state === 'running' || screen.state === 'starting').length;
            const countLabel = total === 1
                ? tt('chat.toolPart.summary.sessionSingle', { count: total })
                : tt('chat.toolPart.summary.sessionsPlural', { count: total });
            if (active > 0) {
                return `${countLabel} · ${tt('chat.toolPart.summary.activeCount', { count: active })}`;
            }
            return countLabel;
        },
    },
} satisfies Record<string, ToolPresentation>;
