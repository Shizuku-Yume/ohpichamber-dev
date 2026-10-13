import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAgentDir, setAgentDir } from '@oh-my-pi/pi-utils';
import { Settings, resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import { disableProvider, disableUserSource, initializeWithSettings, isProviderEnabled, isUserSourceEnabled, reset } from '@oh-my-pi/pi-coding-agent/capability';
import { setActiveSkills, type Skill } from '@oh-my-pi/pi-coding-agent/extensibility/skills';
import { getUserPath } from '@oh-my-pi/pi-coding-agent/discovery/helpers';
import { WorkerSkills } from './catalog-skills.ts';

beforeEach(resetSettingsForTest);
afterEach(resetSettingsForTest);

const fixtureHome = process.env.OPENCHAMBER_SKILL_FIXTURE_HOME;

for (const source of ['native', 'agents', 'github', 'opencode', 'opencode-user'] as const) {
  if (fixtureHome && source !== 'opencode-user') continue;
  test(`an unreadable enabled ${source} skill preserves the last published catalog`, async () => {
    if (source === 'opencode-user' && !fixtureHome) {
      const home = await mkdtemp(join(tmpdir(), 'catalog-skills-home-'));
      try {
        // Bun caches os.homedir(); HOME must exist before this process imports the SDK.
        const child = Bun.spawn([process.execPath, 'test', import.meta.path], {
          env: { ...process.env, HOME: home, OPENCHAMBER_SKILL_FIXTURE_HOME: home }, stdout: 'pipe', stderr: 'pipe',
        });
        const [status, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
        if (status !== 0) throw new Error(`Fresh-HOME skill fixture failed (${status}):\n${stdout}\n${stderr}`);
      } finally { await rm(home, { recursive: true, force: true }); }
      return;
    }
    const root = fixtureHome ?? await mkdtemp(join(tmpdir(), 'catalog-skills-'));
    const home = process.env.HOME;
    const previousAgentDirectory = getAgentDir();
    process.env.HOME = root;
    const cwd = join(root, 'workspace');
    const agentDirectory = join(root, 'agent');
    let release: (() => void) | undefined;
    try {
      await mkdir(join(cwd, '.git'), { recursive: true });
      await mkdir(agentDirectory, { recursive: true });
      const directory = source === 'native' ? join(agentDirectory, 'skills')
        : source === 'opencode-user' ? join(root, '.config', 'opencode', 'skills')
          : join(cwd, `.${source}`, 'skills');
      const file = join(directory, 'root-proof', 'SKILL.md');
      await mkdir(join(directory, 'root-proof'), { recursive: true });
      await writeFile(file, '---\nname: root-proof\ndescription: Readable native skill\n---\nLAST_GOOD_BODY\n');
      // Initialize native discovery from its real profile config, rather than a later global toggle.
      await writeFile(join(agentDirectory, 'config.yml'), source === 'opencode-user' ? 'enabledProviders:\n  - opencode\n' : '');
      setAgentDir(agentDirectory);
      const settings = await Settings.init({ cwd, agentDir: agentDirectory });
      release = initializeWithSettings(settings);
      if (source === 'opencode-user') {
        expect(homedir()).toBe(root);
        expect(isProviderEnabled('opencode')).toBe(true);
        expect(isUserSourceEnabled('opencode')).toBe(true);
        expect(getUserPath({ cwd, home: homedir(), repoRoot: cwd }, 'opencode', 'skills')).toBe(directory);
      }
      const publications: Skill[][] = [];
      let available = false;
      const skills = new WorkerSkills({ worker: { workspaceId: 'workspace', rootSessionId: 'root', workerGeneration: 'generation' },
        agentDirectoryId: 'agent-source', cwd, agentDirectory, options: {},
        publishSkills: async next => { publications.push(next); }, setSkillsRuntimeAvailable: next => { available = next; } });
      const sources = { workspace: '1', agent: '1' };
      expect((await skills.apply(sources, '1')).outcome).toBe('applied');
      const good = skills.read(sources);
      expect(good.skills.find(skill => skill.skillId === 'root-proof')?.description).toBe('Readable native skill');
      await rm(file);
      await mkdir(file);
      const newer = { workspace: '2', agent: '2' };
      const failure = await skills.apply(newer, '2');
      expect(failure.outcome).toBe('failed');
      expect(skills.read(newer)).toEqual({ ...good, persistedSources: newer });
      expect(publications).toHaveLength(1);
      expect(available).toBe(true);
      // A disabled source must not turn a real successful empty discovery into failure.
      if (source === 'opencode-user') disableUserSource('opencode'); else disableProvider(source);
      expect((await skills.apply(newer, '2')).outcome).toBe('applied');
      expect(skills.read(newer).skills.some(skill => skill.skillId === 'root-proof')).toBe(false);
      expect(skills.read(newer).catalogRevision).toBe('2');
    } finally {
      release?.();
      reset();
      setActiveSkills([]);
      setAgentDir(previousAgentDirectory);
      if (home === undefined) delete process.env.HOME; else process.env.HOME = home;
      resetSettingsForTest();
      if (!fixtureHome) await rm(root, { recursive: true, force: true });
    }
  }, 30000);
}
