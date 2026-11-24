import type { CSSProperties } from 'react';

type ParsedFindLine =
    | { kind: 'hit'; filePath: string; startLine: number; endLine?: string; score?: number; snippet: string }
    | { kind: 'header'; filePath: string; score: number; meta: string }
    | { kind: 'text'; text: string };

const FIND_URL_SCHEME_RE = /^https?:\/\//i;
const FIND_HIT_TARGET_RE = /^(.+):(\d+)(?:-(\d+))?$/;
const FIND_SCORE_RE = /^([01]\.\d{2})$/;
const FIND_COL_SEP_RE = /\s{2,}/;

function parseFindScore(value: string): number | undefined {
    if (!FIND_SCORE_RE.test(value)) return undefined;
    const score = Number(value);
    return score >= 0 && score <= 1 ? score : undefined;
}

function parseFindLine(line: string): ParsedFindLine {
    const trimmed = line.trimStart();
    const sep1 = FIND_COL_SEP_RE.exec(trimmed);
    if (!sep1) return { kind: 'text', text: line };

    const target = trimmed.slice(0, sep1.index);
    if (!target || FIND_URL_SCHEME_RE.test(target)) {
        return { kind: 'text', text: line };
    }

    const rest1 = trimmed.slice(sep1.index + sep1[0].length);
    const sep2 = FIND_COL_SEP_RE.exec(rest1);
    const hitTarget = FIND_HIT_TARGET_RE.exec(target);
    if (hitTarget?.[1] && hitTarget[2]) {
        const filePath = hitTarget[1];
        if (FIND_URL_SCHEME_RE.test(filePath)) return { kind: 'text', text: line };
        if (sep2) {
            const score = parseFindScore(rest1.slice(0, sep2.index));
            if (score !== undefined) {
                return {
                    kind: 'hit',
                    filePath,
                    startLine: parseInt(hitTarget[2], 10),
                    endLine: hitTarget[3],
                    score,
                    snippet: rest1.slice(sep2.index + sep2[0].length),
                };
            }
        } else {
            const trailingScore = parseFindScore(rest1.trim());
            if (trailingScore !== undefined) {
                return {
                    kind: 'hit',
                    filePath,
                    startLine: parseInt(hitTarget[2], 10),
                    endLine: hitTarget[3],
                    score: trailingScore,
                    snippet: '',
                };
            }
        }
        return {
            kind: 'hit',
            filePath,
            startLine: parseInt(hitTarget[2], 10),
            endLine: hitTarget[3],
            snippet: rest1,
        };
    }

    if (!/^\s/.test(line) && sep2) {
        const score = parseFindScore(rest1.slice(0, sep2.index));
        const meta = rest1.slice(sep2.index + sep2[0].length);
        if (score !== undefined && meta) {
            return {
                kind: 'header',
                filePath: target,
                score,
                meta,
            };
        }
    }

    return { kind: 'text', text: line };
}

export function parseFindLines(lines: readonly string[]): ParsedFindLine[] {
    const parsed: ParsedFindLine[] = [];
    let inFailures = false;
    for (const line of lines) {
        if (inFailures) {
            parsed.push({ kind: 'text', text: line });
            continue;
        }
        if (line.trim() === 'failures:') {
            inFailures = true;
            parsed.push({ kind: 'text', text: line });
            continue;
        }
        parsed.push(parseFindLine(line));
    }
    return parsed;
}

export function findScoreBadgeStyle(score: number): CSSProperties {
    if (score >= 0.7) {
        return {
            color: 'var(--status-success)',
            backgroundColor: 'var(--status-success-background)',
            borderColor: 'var(--status-success-border)',
        };
    }
    if (score >= 0.4) {
        return {
            color: 'var(--status-warning)',
            backgroundColor: 'var(--status-warning-background)',
            borderColor: 'var(--status-warning-border)',
        };
    }
    return {
        color: 'var(--muted-foreground)',
        backgroundColor: 'color-mix(in srgb, var(--surface-muted) 40%, transparent)',
        borderColor: 'var(--border)',
    };
}
