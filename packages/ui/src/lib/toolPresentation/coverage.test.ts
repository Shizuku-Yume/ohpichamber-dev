import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { overrides } from '../../../../../package.json';
import { KNOWN_TOOL_NAMES, OMP_TOOL_NAMES, toolPresentation } from './index';

const known = (name: string): boolean => (KNOWN_TOOL_NAMES as readonly string[]).includes(name);

/**
 * The registry is only as good as its coverage: a tool OMP ships that the
 * registry never heard of falls back to a wrench and its raw name. These tests
 * read OMP's own name lists out of the pinned tarball, so an OMP upgrade that
 * adds a tool fails here instead of silently degrading the chat.
 */
const REPO_ROOT = new URL('../../../../../', import.meta.url);

const tarball = (name: '@oh-my-pi/pi-coding-agent' | '@oh-my-pi/pi-tui'): string => {
    const pin = overrides[name];
    if (!pin.startsWith('file:vendor/omp/')) throw new Error(`No vendored tarball pin for ${name}`);
    return fileURLToPath(new URL(pin.slice('file:'.length), REPO_ROOT));
};

const readMember = (archive: string, member: string): string => {
    const result = spawnSync('tar', ['-xOzf', archive, member], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`tar failed for ${member}: ${result.stderr}`);
    return result.stdout;
};

/** The string literals of a `const NAME = [...] as const` list in OMP's source. */
const nameList = (source: string, constant: string): string[] => {
    const start = source.indexOf(`export const ${constant}`);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = source.indexOf('] as const', start);
    expect(end).toBeGreaterThan(start);
    return [...source.slice(start, end).matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? '');
};

/** The keys of OMP's pi-tui renderer registry. */
const rendererNames = (source: string): string[] => {
    const start = source.indexOf('export const toolRenderers');
    const end = source.indexOf('};', start);
    return [...source.slice(start, end).matchAll(/^\t([a-z_]+):/gm)].map((match) => match[1] ?? '');
};

const ompNames = (): { builtin: string[]; hidden: string[]; renderers: string[] } => {
    const codingAgent = readMember(tarball('@oh-my-pi/pi-coding-agent'), 'package/src/tools/builtin-names.ts');
    const tui = readMember(tarball('@oh-my-pi/pi-tui'), 'package/src/tools/index.ts');
    return {
        builtin: nameList(codingAgent, 'BUILTIN_TOOL_NAMES'),
        hidden: nameList(codingAgent, 'HIDDEN_TOOL_NAMES'),
        renderers: rendererNames(tui),
    };
};

/** The fork's own tools: the Agent Service registers these beside OMP's. */
const HOST_TOOL_NAMES = ['openchamber', 'openchamber_knowledge', 'web', 'notify', 'openchamber_render', 'openchamber_workflow'] as const;

describe('OMP tool presentation coverage', () => {
    test('every OMP builtin and hidden tool has a registry entry', () => {
        const { builtin, hidden } = ompNames();
        expect(builtin.length).toBeGreaterThan(25);
        for (const name of [...builtin, ...hidden]) {
            expect(`${name}: ${known(name)}`).toBe(`${name}: true`);
        }
    });

    test('every tool pi-tui renders has a registry entry', () => {
        const { renderers } = ompNames();
        expect(renderers.length).toBeGreaterThan(20);
        for (const name of renderers) {
            expect(`${name}: ${known(name)}`).toBe(`${name}: true`);
        }
    });

    test('the advisor and the fork host tools are covered', () => {
        for (const name of ['advise', ...HOST_TOOL_NAMES]) {
            expect(`${name}: ${known(name)}`).toBe(`${name}: true`);
        }
    });

    test('every entry carries a label, an icon, a grouping class and both describers', () => {
        for (const name of KNOWN_TOOL_NAMES) {
            const entry = toolPresentation(name);
            expect(`${name}: ${entry.label.trim().length > 0}`).toBe(`${name}: true`);
            expect(`${name}: ${entry.icon.trim().length > 0}`).toBe(`${name}: true`);
            expect(`${name}: ${['read', 'search', 'call'].includes(entry.group)}`).toBe(`${name}: true`);
            expect(`${name}: ${typeof entry.describeCall}`).toBe(`${name}: function`);
            expect(`${name}: ${typeof entry.describeResult}`).toBe(`${name}: function`);
        }
    });

    test('no invented tool names: fetch is a pipeline, not a tool', () => {
        expect(KNOWN_TOOL_NAMES).not.toContain('fetch');
        expect(OMP_TOOL_NAMES).not.toContain('fetch');
    });

    test('an unknown extension tool falls back to its own name and the wrench', () => {
        const entry = toolPresentation('mcp__server_custom');
        expect(entry.label).toBe('mcp__server_custom');
        expect(entry.icon).toBe('tools');
        expect(entry.describeCall({ anything: 'x' })).toBeNull();
    });

    test('a runtime alias reads as its base tool', () => {
        expect(toolPresentation('runtime.read:2').label).toBe('Read');
        expect(toolPresentation('search').label).toBe('Grep');
    });
});
