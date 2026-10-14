import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import type { Spy } from "bun:test"
import type { GitAPI, GitStatus } from "./api/types"
import { generateCommitMessage, generatePullRequestDescription, getGitStatus, stageGitFile, stageGitFiles, unstageGitFile, unstageGitFiles } from "./gitApi"
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

  beforeEach(() => {
    activeDiffRequests = 0
    peakDiffRequests = 0
    diffRequestCount = 0
    invalidateSettingsCache()
    useConfigStore.setState({ currentProviderId: 'git-provider', currentModelId: 'haiku' })
    request = spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes("/api/git/diff")) {
        diffRequestCount += 1
        activeDiffRequests += 1
        peakDiffRequests = Math.max(peakDiffRequests, activeDiffRequests)
        await new Promise((resolve) => setTimeout(resolve, 1))
        activeDiffRequests -= 1
        return jsonResponse(JSON.stringify({
          path: "src/file.ts",
          diff: "--- a/src/file.ts\n+++ b/src/file.ts\n",
          submodule: null,
        }))
      }
      if (url.includes("/api/git/log")) {
        return jsonResponse(JSON.stringify({ all: [{ hash: 'abcdef0123', date: '2026-10-14T00:00:00Z', message: 'Keep scoped completion', refs: '', body: '', author_name: 'Test Author', author_email: 'author@example.test', filesChanged: 1, insertions: 1, deletions: 0, parents: [] }], latest: null, total: 1 }))
      }
      if (url.includes('/api/git/commit-files')) {
        return jsonResponse(JSON.stringify({ files: [{ path: 'src/file.ts', changeType: 'M', insertions: 1, deletions: 0, isBinary: false }] }))
      }
      if (url.includes("/api/magic-prompts")) {
        return jsonResponse(JSON.stringify({ version: 1, overrides: {} }))
      }
      if (url.includes('/api/agent/v1/workspaces/resolve')) {
        return jsonResponse(JSON.stringify({ workspaceId: 'workspace-git', projectId: 'project-git', name: 'Git' }))
      }
      if (url.includes('/api/agent/v1/workspaces/workspace-git/models')) {
        return jsonResponse(JSON.stringify({ workspaceId: 'workspace-git', revision: '0', models: [{ provider: 'git-provider', modelId: 'haiku', name: 'Haiku', modalities: ['text'], contextWindow: 8000, maxOutputTokens: 2000, reasoningEffortSupported: false, reasoningOptions: [], variants: [], pricing: null }] }))
      }
      if (url.includes('/api/agent/v1/workspaces/workspace-git/completions')) {
        const body = JSON.parse(String(init?.body))
        expect(body.format.kind).toBe('json')
        return jsonResponse(JSON.stringify({ completionId: body.completionId, selection: body.selection, status: 'completed', output: { kind: 'json', value: { subject: 'chore: bound diff collection', highlights: [] } }, finishReason: 'complete', usage: null }))
      }
      if (url.includes("/auth/url-token")) {
        return jsonResponse(JSON.stringify({ token: "test-url-token", expiresAt: Date.now() + 60_000 }))
      }
      return jsonResponse("{}")
    })
    switchRuntimeEndpoint({ apiBaseUrl: "https://git.test", runtimeKey: "git-api-commit-diff" })
  })

  afterEach(() => {
    request.mockRestore()
    invalidateSettingsCache()
  })

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
