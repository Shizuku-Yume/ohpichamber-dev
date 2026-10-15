import { beforeEach, describe, expect, mock, test } from 'bun:test';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
};


let skillsResponse: Deferred<Response> = deferred();
const runtimeFetchModule = await import('@/lib/runtime-fetch');
mock.module('@/lib/runtime-fetch', () => ({
  ...runtimeFetchModule,
  runtimeFetch: () => skillsResponse.promise,
}));

const { useSkillsStore } = await import('./useSkillsStore');


describe('instance-scoped stores reject responses from the previous instance', () => {
  beforeEach(() => {
    skillsResponse = deferred();
    useSkillsStore.getState().resetForRuntimeSwitch();
  });


  test('a skills load in flight during a switch does not land in the new instance', async () => {
    const load = useSkillsStore.getState().loadSkills('/repo');

    useSkillsStore.getState().resetForRuntimeSwitch();
    skillsResponse.resolve(new Response(
      JSON.stringify({ skills: [{ name: 'from-instance-a', path: '/repo/.agents/skills/a/SKILL.md' }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    await load;

    expect(useSkillsStore.getState().skillsByDirectory['/repo']).toBe(undefined);
  });
});
