import { beforeEach, describe, expect, it, vi } from 'vitest';

const writeObjectiveMock = vi.fn(async () => undefined);
const generateSmallModelTextMock = vi.fn(async () => ({ text: '' }));

vi.mock('./objectives.js', () => ({
  GOAL_OBJECTIVE_CHAR_LIMIT: 5_000,
  writeObjective: writeObjectiveMock,
}));

vi.mock('../small-model/index.js', () => ({
  generateSmallModelText: generateSmallModelTextMock,
}));

const { buildGoalIntroText, createSessionGoal } = await import('./create.js');

describe('session goal creation', () => {
  beforeEach(() => {
    writeObjectiveMock.mockReset().mockResolvedValue(undefined);
    generateSmallModelTextMock.mockReset().mockResolvedValue({ text: '' });
  });

  it('saves the goal in OpenChamber\'s own store without an OpenCode request', async () => {
    const fetchMock = vi.fn();
    const persistSessionGoal = vi.fn(async () => undefined);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;
    try {
      const goal = await createSessionGoal({
        scope: { workspaceId: 'ws_123', cwd: '/repo/app' },
        sessionID: 'ses_123',
        objective: 'Finish and verify the migration',
        tokenBudget: 200_000,
        providerID: 'openai',
        modelID: 'gpt-5.5',
        persistSessionGoal,
      });

      expect(writeObjectiveMock).toHaveBeenCalledWith('ses_123', 'Finish and verify the migration');
      expect(goal).toMatchObject({ objective: '', objectiveFile: true, status: 'active', tokenBudget: 200_000 });
      expect(persistSessionGoal).toHaveBeenCalledWith('ses_123', '/repo/app', goal);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('falls back to an inline objective when the objective file cannot be written', async () => {
    writeObjectiveMock.mockRejectedValueOnce(new Error('disk unavailable'));
    const persistSessionGoal = vi.fn(async () => undefined);

    await createSessionGoal({
      scope: { workspaceId: 'ws_123', cwd: '/repo/app' },
      sessionID: 'ses_123',
      objective: 'Finish the migration',
      onWarning: vi.fn(),
      persistSessionGoal,
    });

    const [, , goal] = persistSessionGoal.mock.calls[0];
    expect(goal).toMatchObject({ objective: 'Finish the migration', objectiveFile: false });
  });

  it('requires a Host scope before writing a goal', async () => {
    await expect(createSessionGoal({
      sessionID: 'ses_123',
      objective: 'Finish the migration',
    })).rejects.toThrow(/Host session scope with cwd/);
  });

  it('passes workspace identity, never cwd, to canonical small-model distillation', async () => {
    generateSmallModelTextMock.mockResolvedValueOnce({ text: 'distilled criteria' });
    const persistSessionGoal = vi.fn(async () => undefined);

    await createSessionGoal({
      scope: { workspaceId: 'ws_123', cwd: '/repo/app' },
      sessionID: 'ses_123',
      objective: 'x'.repeat(5_001),
      persistSessionGoal,
    });

    expect(generateSmallModelTextMock).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws_123', sessionID: 'ses_123',
    }));
    expect(generateSmallModelTextMock.mock.calls[0][0].directory).toBeUndefined();
  });

  it('builds the same goal intro with an optional budget', () => {
    expect(buildGoalIntroText(null)).toContain('Goal mode is active for this session.');
    expect(buildGoalIntroText(200_000)).toContain('A token budget of 200000 tokens applies to this goal.');
  });
});
