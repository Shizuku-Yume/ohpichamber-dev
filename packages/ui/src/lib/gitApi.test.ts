import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import type { Spy } from "bun:test"
import { GitNetworkOperationRequestError } from "./api/types"
import type { GitAPI, GitStatus } from "./api/types"
import { generateCommitMessage, generatePullRequestDescription, getGitStatus, resolveGitRepositoryPrefix, stageGitFile, stageGitFiles, unstageGitFile, unstageGitFiles } from "./gitApi"
import { switchRuntimeEndpoint } from "./runtime-switch"
import { canonicalClient } from '@/api/canonicalClient'
import { useConfigStore } from '@/stores/useConfigStore'
import { invalidateSettingsCache } from './persistence'

const status: GitStatus = {
  current: "main",
  tracking: null,
  ahead: 0,
  behind: 0,
  files: [],
  isClean: true,
}

const withRuntimeGit = async (git: Partial<GitAPI>, callback: () => Promise<void>) => {
  const previousWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window")
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      __OPENCHAMBER_RUNTIME_APIS__: { git },
    },
  })

  try {
    await callback()
  } finally {
    if (previousWindowDescriptor) {
      Object.defineProperty(globalThis, "window", previousWindowDescriptor)
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
  }
}

describe("resolveGitRepositoryPrefix", () => {
  test("asks the runtime git API when one is registered", async () => {
    let asked = ""
    await withRuntimeGit({
      resolveRepositoryPrefix: async (directory: string) => {
        asked = directory
        return "ai"
      },
    }, async () => {
      expect(await resolveGitRepositoryPrefix("/repo/ai")).toBe("ai")
    })
    expect(asked).toBe("/repo/ai")
  })

  // The web runtime registers a git object that predates this operation, so a
  // registered runtime without it has to reach the server instead of failing.
  describe("when the registered runtime git object lacks the operation", () => {
    let request: Spy<typeof fetch>
    const answer = (body: string): Response =>
      new Response(body, { status: 200, headers: { "Content-Type": "application/json" } })

    afterEach(() => {
      request.mockRestore()
    })

    test("asks the server's toplevel route", async () => {
      request = spyOn(globalThis, "fetch").mockImplementation(async () => answer('{"root":"/repo","prefix":"ai"}'))
      switchRuntimeEndpoint({ apiBaseUrl: "https://git.test", runtimeKey: "git-api-repository-prefix" })

      await withRuntimeGit({}, async () => {
        expect(await resolveGitRepositoryPrefix("/repo/ai")).toBe("ai")
      })
      expect(request.mock.calls.map(([input]) => String(input)).filter((url) => url.includes("/git/toplevel"))).toEqual([
        `https://git.test/api/git/toplevel?directory=${encodeURIComponent("/repo/ai")}`,
      ])
    })

    test("rejects when an older server does not report the folder, instead of answering the repository root", async () => {
      request = spyOn(globalThis, "fetch").mockImplementation(async () => answer('{"root":"/repo"}'))
      switchRuntimeEndpoint({ apiBaseUrl: "https://git.test", runtimeKey: "git-api-repository-prefix-old" })

      await withRuntimeGit({}, async () => {
        await expect(resolveGitRepositoryPrefix("/repo/ai")).rejects.toThrow("did not report")
      })
    })

    test("rejects a null prefix", async () => {
      request = spyOn(globalThis, "fetch").mockImplementation(async () => answer('{"root":"/repo","prefix":null}'))
      switchRuntimeEndpoint({ apiBaseUrl: "https://git.test", runtimeKey: "git-api-repository-prefix-null" })

      await withRuntimeGit({}, async () => {
        await expect(resolveGitRepositoryPrefix("/repo/ai")).rejects.toThrow("did not report")
      })
    })
  })
})

describe("getGitStatus", () => {
  test("forwards light-mode options to runtime git APIs", async () => {
    let received: { directory: string; options?: { mode?: "light" } } | null = null
    const runtimeGit = {
      getGitStatus: async (directory: string, options?: { mode?: "light" }) => {
        received = { directory, options }
        return status
      },
    }

    await withRuntimeGit(runtimeGit, async () => {
      await getGitStatus("/repo", { mode: "light" })
    })

    expect(received).toEqual({ directory: "/repo", options: { mode: "light" } })
  })
})

describe("git index mutations", () => {
  test("forwards bulk stage requests to runtime git APIs", async () => {
    let received: { directory: string; paths: string[] } | null = null
    const runtimeGit = {
      stageGitFiles: async (directory: string, paths: string[]) => {
        received = { directory, paths }
      },
    }

    await withRuntimeGit(runtimeGit, async () => {
      await stageGitFiles("/repo", ["a.ts", "b.ts"])
    })

    expect(received).toEqual({ directory: "/repo", paths: ["a.ts", "b.ts"] })
  })

  test("forwards bulk unstage requests to runtime git APIs", async () => {
    let received: { directory: string; paths: string[] } | null = null
    const runtimeGit = {
      unstageGitFiles: async (directory: string, paths: string[]) => {
        received = { directory, paths }
      },
    }

    await withRuntimeGit(runtimeGit, async () => {
      await unstageGitFiles("/repo", ["a.ts", "b.ts"])
    })

    expect(received).toEqual({ directory: "/repo", paths: ["a.ts", "b.ts"] })
  })

  test("keeps single-file stage wrapper routed to runtime single-file API", async () => {
    let received: { directory: string; path: string } | null = null
    const runtimeGit = {
      stageGitFile: async (directory: string, path: string) => {
        received = { directory, path }
      },
    }

    await withRuntimeGit(runtimeGit, async () => {
      await stageGitFile("/repo", "a.ts")
    })

    expect(received).toEqual({ directory: "/repo", path: "a.ts" })
  })

  test("keeps single-file unstage wrapper routed to runtime single-file API", async () => {
    let received: { directory: string; path: string } | null = null
    const runtimeGit = {
      unstageGitFile: async (directory: string, path: string) => {
        received = { directory, path }
      },
    }

    await withRuntimeGit(runtimeGit, async () => {
      await unstageGitFile("/repo", "a.ts")
    })

    expect(received).toEqual({ directory: "/repo", path: "a.ts" })
  })
})

// Commit-message generation collects diffs for up to 30 selected files. Without
// a bound it issued two requests per file at once, saturating the browser
// connection pool. These tests count real transport calls and the peak number
// in flight at the exported `generateCommitMessage` boundary.
describe("generateCommitMessage diff collection", () => {
  const files = Array.from({ length: 8 }, (_, index) => `src/file-${index}.ts`)

  let request: Spy<typeof fetch>
  let activeDiffRequests = 0
  let peakDiffRequests = 0
  let diffRequestCount = 0

  const jsonResponse = (body: string): Response =>
    new Response(body, { status: 200, headers: { "Content-Type": "application/json" } })
  const fixtureFetch = async (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
    const url = String(input)
    if (url.includes('/git/diff')) {
      diffRequestCount++; activeDiffRequests++; peakDiffRequests = Math.max(peakDiffRequests, activeDiffRequests)
      await Promise.resolve(); activeDiffRequests--
      return jsonResponse(JSON.stringify({ path: 'src/file.ts', diff: '--- a/src/file.ts\n+++ b/src/file.ts\n', submodule: null }))
    }
    if (url.includes('/api/git/log')) return jsonResponse(JSON.stringify({ all: [{ hash: 'abcdef0123', date: '2026-10-14T00:00:00Z', message: 'Keep scoped completion', refs: '', body: '', author_name: 'Test Author', author_email: 'author@example.test', filesChanged: 1, insertions: 1, deletions: 0, parents: [] }], latest: null, total: 1 }))
    if (url.includes('/api/git/commit-files')) return jsonResponse(JSON.stringify({ files: [{ path: 'src/file.ts', changeType: 'M', insertions: 1, deletions: 0, isBinary: false }] }))
    if (url.includes('/api/magic-prompts')) return jsonResponse(JSON.stringify({ version: 1, overrides: {} }))
    if (url.includes('/api/agent/v1/workspaces/resolve')) return jsonResponse(JSON.stringify({ workspaceId: 'workspace-git', projectId: 'project-git', name: 'Git' }))
    if (url.includes('/api/agent/v1/workspaces/workspace-git/models')) return jsonResponse(JSON.stringify({ workspaceId: 'workspace-git', revision: '0', models: [{ provider: 'git-provider', modelId: 'haiku', name: 'Haiku', modalities: ['text'], contextWindow: 8000, maxOutputTokens: 2000, reasoningEffortSupported: false, reasoningOptions: [], variants: [], pricing: null }], defaults: { model: { providerId: 'git-provider', modelId: 'haiku' }, thinkingLevel: 'auto' }, imageModels: [], planRoleAvailable: true }))
    if (url.includes('/api/agent/v1/workspaces/workspace-git/completions')) {
      const body = JSON.parse(String(init?.body)); expect(body.format.kind).toBe('json')
      return jsonResponse(JSON.stringify({ completionId: body.completionId, selection: body.selection, status: 'completed', output: { kind: 'json', value: { subject: 'chore: bound diff collection', highlights: [] } }, finishReason: 'complete', usage: null }))
    }
    if (url.includes('/auth/url-token')) return jsonResponse(JSON.stringify({ token: 'test-url-token', expiresAt: Date.now() + 60_000 }))
    return jsonResponse('{}')
  }

  beforeEach(() => {
    activeDiffRequests = 0
    peakDiffRequests = 0
    diffRequestCount = 0
    invalidateSettingsCache()
    useConfigStore.setState({ currentProviderId: 'git-provider', currentModelId: 'haiku' })
    request = spyOn(globalThis, "fetch").mockImplementation(fixtureFetch)
    switchRuntimeEndpoint({ apiBaseUrl: "https://git.test", runtimeKey: "git-api-commit-diff" })
  })

  afterEach(() => {
    request.mockRestore()
    invalidateSettingsCache()
  })

  test.each(['commit', 'pr'] as const)('%s does not read prompts or files after its log returns on another runtime', async (kind) => {
    let release!: (response: Response) => void; let started!: () => void;
    const gate = new Promise<Response>((resolve) => { release = resolve })
    const reached = new Promise<void>((resolve) => { started = resolve })
    const paths: string[] = []
    request.mockImplementation(async (input) => {
      const url = String(input); paths.push(url)
      if (url.includes('/api/git/log')) { started(); return gate }
      return jsonResponse('{}')
    })
    const pending = kind === 'commit' ? generateCommitMessage('/repo', files) : generatePullRequestDescription('/repo', { base: 'main', head: 'topic' })
    await reached
    switchRuntimeEndpoint({ apiBaseUrl: 'https://other.test', runtimeKey: 'git-other' })
    release(jsonResponse(JSON.stringify({ all: [{ hash: 'abc', date: '2026-10-14', message: 'subject', refs: '', body: '', author_name: 'Test', author_email: 'test@example.test', filesChanged: 1, insertions: 1, deletions: 0, parents: [] }], latest: null, total: 1 })))
    await expect(pending).rejects.toThrow('Runtime changed')
    expect(paths.some((url) => url.includes('/api/magic-prompts') || url.includes('/git/commit-files') || url.includes('/git/diff'))).toBe(false)
  })

  test('commit stops launching queued file diffs after a switch', async () => {
    let release!: () => void; let started!: () => void; const gate = new Promise<void>(r => { release = r }); const reached = new Promise<void>(r => { started = r });
    let count = 0;
    request.mockImplementation(async (input, init) => {
      if (String(input).includes('/git/diff')) { count++; started(); await gate; return jsonResponse(JSON.stringify({ path: 'file', diff: 'diff', submodule: null })); }
      return fixtureFetch(input, init);
    });
    const pending = generateCommitMessage('/repo', files); await reached;
    switchRuntimeEndpoint({ apiBaseUrl: 'https://other.test', runtimeKey: 'git-other' }); release();
    await expect(pending).rejects.toThrow('Runtime changed'); expect(count).toBeLessThanOrEqual(4);
  });

  test('PR stops before prompt reads when commit-file collection switches runtime', async () => {
    let release!: () => void; let started!: () => void; const gate = new Promise<void>(r => { release = r }); const reached = new Promise<void>(r => { started = r });
    const paths: string[] = [];
    request.mockImplementation(async (input, init) => {
      const url = String(input); paths.push(url);
      if (url.includes('/api/git/commit-files')) { started(); await gate; return jsonResponse('{"files":[]}'); }
      return fixtureFetch(input, init);
    });
    const pending = generatePullRequestDescription('/repo', { base: 'main', head: 'topic' }); await reached;
    switchRuntimeEndpoint({ apiBaseUrl: 'https://other.test', runtimeKey: 'git-other' }); release();
    await expect(pending).rejects.toThrow('Runtime changed'); expect(paths.some(url => url.includes('/api/magic-prompts') || url.includes('/api/fs/read'))).toBe(false);
  });

  test("caps diff collection at two selected files in flight", async () => {
    const result = await generateCommitMessage("/repo", files)

    expect(result.message.subject).toBe("chore: bound diff collection")
    expect(diffRequestCount).toBe(files.length * 2)
    // Two files in flight, each issuing a staged + unstaged pair.
    expect(peakDiffRequests).toBeLessThanOrEqual(4)
  })

  test('explicit commit model survives discovery and provider failure does not run a session fallback', async () => {
    const complete = spyOn(canonicalClient, 'complete').mockImplementation(async (_workspace, input) => {
      expect(input.selection).toEqual({ providerId: 'explicit-provider', modelId: 'explicit-model' })
      return { completionId: input.completionId, selection: input.selection, status: 'failed', error: { code: 'MODEL_UNAVAILABLE', detail: 'Selected model unavailable', retryable: false } }
    })
    try {
      await expect(generateCommitMessage('/repo', files, { providerId: 'explicit-provider', modelId: 'explicit-model' })).rejects.toThrow('Selected model unavailable')
      expect(complete).toHaveBeenCalledTimes(1)
    } finally { complete.mockRestore() }
  })

  test('PR uses native JSON completion and isolates a structured provider failure', async () => {
    const complete = spyOn(canonicalClient, 'complete').mockImplementationOnce(async (_workspace, input) => {
      expect(input.format).toMatchObject({ kind: 'json', schema: { required: ['title', 'body'] } })
      return { completionId: input.completionId, selection: input.selection, status: 'failed', error: { code: 'STRUCTURED_OUTPUT_INVALID', detail: 'Provider output invalid', retryable: false } }
    }).mockImplementation(async (_workspace, input) => ({ completionId: input.completionId, selection: input.selection, status: 'completed', output: { kind: 'json', value: { title: 'Canonical PR', body: 'Provider scoped' } }, finishReason: 'complete', usage: null }))
    try {
      await expect(generatePullRequestDescription('/repo', { base: 'main', head: 'topic' })).rejects.toThrow('Provider output invalid')
      expect(await generatePullRequestDescription('/repo', { base: 'main', head: 'topic' })).toEqual({ title: 'Canonical PR', body: 'Provider scoped' })
    } finally { complete.mockRestore() }
  })

  test('native JSON output is required instead of repairing legacy prose or fences', async () => {
    const complete = spyOn(canonicalClient, 'complete').mockImplementation(async (_workspace, input) => ({ completionId: input.completionId, selection: input.selection, status: 'completed', output: { kind: 'text', text: '```json\n{"subject":"Legacy output","highlights":[]}\n```' }, finishReason: 'complete', usage: null }))
    try {
      await expect(generateCommitMessage('/repo', files)).rejects.toThrow('Structured completion did not return a JSON object')
    } finally { complete.mockRestore() }
  })
})

// The reasoning toggle is the whole difference between the two commit
// completions. These assert the canonical request body, not a mock echo.
describe('generateCommitMessage reasoning request', () => {
  const files = ['src/a.ts']
  let request: Spy<typeof fetch>

  const respond = (captured: { body?: string }[]) => async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/git/diff')) return Response.json({ path: 'src/a.ts', diff: '--- a\n+++ b\n', submodule: null })
    if (url.includes('/api/git/log')) return Response.json({ all: [{ hash: 'abc', date: '2026-11-07', message: 'chore: prior', refs: '', body: '', author_name: 'T', author_email: 't@e.test', filesChanged: 1, insertions: 1, deletions: 0, parents: [] }], latest: null, total: 1 })
    if (url.includes('/api/magic-prompts')) return Response.json({ version: 1, overrides: {} })
    if (url.includes('/api/agent/v1/workspaces/resolve')) return Response.json({ workspaceId: 'workspace-git', projectId: 'project-git', name: 'Git' })
    if (url.includes('/models')) return Response.json({
      workspaceId: 'workspace-git', revision: '0', defaults: { model: null, thinkingLevel: null }, imageModels: [], planRoleAvailable: false,
      models: [{
        provider: 'git-provider', modelId: 'thinker', name: 'Thinker', modalities: ['text'], contextWindow: 8000, maxOutputTokens: 2000,
        reasoningEffortSupported: true, reasoningOptions: [{ reasoningEffort: 'low', label: 'Low', budgetTokens: null }, { reasoningEffort: 'medium', label: 'Medium', budgetTokens: null }],
        variants: [], pricing: null,
      }],
    })
    if (url.includes('/completions')) {
      captured.push({ body: String(init?.body) })
      const body = JSON.parse(String(init?.body))
      return Response.json({ completionId: body.completionId, selection: body.selection, status: 'completed', output: { kind: 'json', value: { subject: 'feat: reasoned', highlights: [] } }, finishReason: 'complete', usage: null })
    }
    return Response.json({})
  }

  beforeEach(() => {
    switchRuntimeEndpoint({ apiBaseUrl: 'https://reasoning.test', runtimeKey: `reasoning-${crypto.randomUUID()}` })
    invalidateSettingsCache()
    useConfigStore.setState({ currentProviderId: 'git-provider', currentModelId: 'thinker' })
  })
  afterEach(() => {
    request?.mockRestore()
    // Leave the default endpoint behind: this suite switches to a stand-in
    // origin, and a later file that shares this process must not inherit it.
    switchRuntimeEndpoint({ apiBaseUrl: '', clientToken: null, runtimeKey: 'test-default' })
    invalidateSettingsCache()
  })

  test('the toggle is what puts a reasoning effort on the canonical completion', async () => {
    const captured: { body?: string }[] = []
    request = spyOn(globalThis, 'fetch').mockImplementation(respond(captured) as typeof fetch)

    await generateCommitMessage('/repo', files)
    expect(JSON.parse(captured[0].body ?? '{}').reasoningEffort).toBeNull()

    await generateCommitMessage('/repo', files, { reasoning: true })
    expect(JSON.parse(captured[1].body ?? '{}').reasoningEffort).toBe('medium')
  })
})

describe("operations a registered runtime omits", () => {
  test("reject as unsupported instead of falling back to HTTP", async () => {
    const { getGitLog } = await import("./gitApi")
    await withRuntimeGit({}, async () => {
      const error = await getGitLog("/repo").catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(GitNetworkOperationRequestError)
      expect(error).toMatchObject({ code: "RUNTIME_UNSUPPORTED", status: 501 })
    })
  })
})
