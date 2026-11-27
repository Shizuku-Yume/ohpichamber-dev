#!/usr/bin/env bun
/**
 * Deterministic parity fixture and headless Chromium capture for the chat
 * transcript surface.
 *
 * Stands up an isolated OpenChamber server under a scratch directory, seeds
 * deterministic OMP `.jsonl` transcripts, subagent links, `changes.jsonl`
 * turn-diff blobs, and a live background shell, then captures screenshots at
 * 1600x1000 (desktop) and 390x844 (mobile) while verifying zero console errors
 * and non-empty DOM rendering for every card/surface.
 *
 * Usage:
 *   bun scripts/chat-parity-capture.mjs --out <dir> [options]
 */

import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { deflateSync } from "node:zlib"

import { SessionManager } from "../packages/agent-service/node_modules/@oh-my-pi/pi-coding-agent/src/session/session-manager.ts"
import { contentSum } from "../packages/agent-service/src/sessions/turn-diff-core.ts"
import { WorkerProjection } from "../packages/agent-service/src/worker/projection.ts"
import { openApprovalPolicyStore } from "../packages/web/server/lib/host/approval-policy-store.js"
import {
  CdpClient,
  createPageTarget,
  evaluateValue,
  launchChrome,
  reservePort,
  resolveChrome as resolvePerfChrome,
  resolveProfileDir,
  wait,
} from "./perf/cdp.mjs"
import { REPO_ROOT, startFixture, startIsolatedServer } from "./perf/isolated-server.mjs"

const HELP = `Usage: bun scripts/chat-parity-capture.mjs --out <dir> [options]

Options:
  --out <dir>          Output directory for screenshots and manifest.json (required)
  --state-dir <dir>    Isolated Host/OMP state dir (default: /tmp/relh-10/parity-state)
  --project-dir <dir>  Isolated git project dir (default: /tmp/relh-10/parity-project)
  --dist <dir>         Built web dist directory (default: packages/web/dist)
  --port <n>           Server port > 20000 (default: random free port > 20000)
  --fixture-port <n>   Fixture provider port > 20000 (default: random free port > 20000)
  --chrome <path>      Chrome/Chromium binary path
  --keep-state         Do not delete scratch state/project dirs on exit
  --help               Show this help`

const createDiagramPngBase64 = () => {
  const width = 64
  const height = 64
  const crcTable = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c >>> 0
  }
  const crc32 = (buf) => {
    let c = 0xffffffff
    for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length, 0)
    const typeBuf = Buffer.from(type, "ascii")
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
    return Buffer.concat([len, typeBuf, data, crcBuf])
  }
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1)
    raw[rowStart] = 0
    for (let x = 0; x < width; x += 1) {
      const px = rowStart + 1 + x * 4
      const border = x < 3 || y < 3 || x >= width - 3 || y >= height - 3
      const boxA = x >= 10 && x <= 26 && y >= 12 && y <= 28
      const boxB = x >= 38 && x <= 54 && y >= 36 && y <= 52
      const diag = Math.abs(x - y) <= 2 && x >= 24 && x <= 40
      if (border) {
        raw[px] = 37; raw[px + 1] = 99; raw[px + 2] = 235; raw[px + 3] = 255
      } else if (boxA) {
        raw[px] = 16; raw[px + 1] = 185; raw[px + 2] = 129; raw[px + 3] = 255
      } else if (boxB) {
        raw[px] = 245; raw[px + 1] = 158; raw[px + 2] = 11; raw[px + 3] = 255
      } else if (diag) {
        raw[px] = 99; raw[px + 1] = 102; raw[px + 2] = 241; raw[px + 3] = 255
      } else {
        raw[px] = 241; raw[px + 1] = 245; raw[px + 2] = 249; raw[px + 3] = 255
      }
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
  return png.toString("base64")
}
const TINY_PNG_BASE64 = createDiagramPngBase64()

const VIEWPORTS = [
  { name: "desktop-1600", width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false },
  { name: "mobile-390", width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
]

const GIT_ENV = {
  GIT_AUTHOR_NAME: "OpenChamber Parity",
  GIT_AUTHOR_EMAIL: "parity@openchamber.local",
  GIT_COMMITTER_NAME: "OpenChamber Parity",
  GIT_COMMITTER_EMAIL: "parity@openchamber.local",
}

const parseArgs = (argv) => {
  const options = {
    out: null,
    stateDir: "/tmp/relh-10/parity-state",
    projectDir: "/tmp/relh-10/parity-project",
    dist: join(REPO_ROOT, "packages/web/dist"),
    port: null,
    fixturePort: null,
    chrome: null,
    keepState: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--help") {
      console.log(HELP)
      process.exit(0)
    } else if (arg === "--out") {
      options.out = resolve(argv[++i])
    } else if (arg === "--state-dir") {
      options.stateDir = resolve(argv[++i])
    } else if (arg === "--project-dir") {
      options.projectDir = resolve(argv[++i])
    } else if (arg === "--dist") {
      options.dist = resolve(argv[++i])
    } else if (arg === "--port") {
      options.port = Number(argv[++i])
    } else if (arg === "--fixture-port") {
      options.fixturePort = Number(argv[++i])
    } else if (arg === "--chrome") {
      options.chrome = resolve(argv[++i])
    } else if (arg === "--keep-state") {
      options.keepState = true
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }
  if (!options.out) throw new Error("--out <dir> is required")
  return options
}

export const resolveChromeBinary = (explicit) => {
  if (explicit) return resolvePerfChrome(explicit)
  try {
    return resolvePerfChrome(undefined)
  } catch {
    const cacheRoot = join(process.env.HOME ?? "", ".cache/ms-playwright")
    if (existsSync(cacheRoot)) {
      for (const entry of readdirSync(cacheRoot)) {
        if (!entry.startsWith("chromium-")) continue
        const candidate = join(cacheRoot, entry, "chrome-linux64/chrome")
        if (existsSync(candidate)) return candidate
      }
    }
    throw new Error("No Chromium/Chrome binary found. Pass --chrome <path>.")
  }
}

export const reserveHighPort = async (preferred = null) => {
  if (preferred) {
    if (preferred <= 20_000 || (preferred >= 3000 && preferred <= 3999)) {
      throw new Error(`Port ${preferred} must be > 20000`)
    }
    return preferred
  }
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = await reservePort()
    if (candidate > 20_000) return candidate
  }
  throw new Error("Could not reserve a port > 20000")
}

const log = (message) => console.log(`[chat-parity] ${message}`)

const usageStub = {
  input: 1200,
  output: 420,
  cacheRead: 300,
  cacheWrite: 0,
  totalTokens: 1920,
  cost: { input: 0.0012, output: 0.0021, cacheRead: 0.0001, cacheWrite: 0, total: 0.0034 },
}

const assistantMsg = (content, timestamp, extras = {}) => {
  const msg = {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "perf",
    model: "stream-300cps",
    usage: usageStub,
    stopReason: extras.stopReason ?? "stop",
    timestamp,
  };
  if (extras.errorMessage) msg.errorMessage = extras.errorMessage;
  return msg;
};

const toolResultMsg = (toolCallId, toolName, text, details, timestamp, options = {}) => {
  const content = [];
  if (text) content.push({ type: "text", text });
  if (options.images) content.push(...options.images);
  const msg = {
    role: "toolResult",
    toolCallId,
    toolName,
    isError: options.isError === true,
    content,
    timestamp,
  };
  if (details !== undefined) msg.details = details;
  return msg;
};

const appendToolPair = (manager, ts, { toolName, input, text, details, isError = false, images, thinking, preText }) => {
  const callId = `call_${randomUUID().slice(0, 8)}`
  const content = []
  if (thinking) content.push({ type: "thinking", thinking, thinkingSignature: "sig_parity" })
  if (preText) content.push({ type: "text", text: preText })
  content.push({ type: "toolCall", id: callId, name: toolName, arguments: input })
  manager.appendMessage(assistantMsg(content, ts, { stopReason: "toolUse" }))
  manager.appendMessage(toolResultMsg(callId, toolName, text, details, ts + 25, { isError, images }))
  return callId
}

const gzipText = (text) => Bun.gzipSync(new TextEncoder().encode(text))

export const prepareProject = (projectDir) => {
  rmSync(projectDir, { recursive: true, force: true })
  mkdirSync(join(projectDir, "src"), { recursive: true })
  mkdirSync(join(projectDir, "assets"), { recursive: true })

  writeFileSync(
    join(projectDir, "README.md"),
    "# Parity Fixture Project\n\nDeterministic workspace for ChatViewport parity captures.\n",
  )
  writeFileSync(
    join(projectDir, "src/app.ts"),
    [
      "export interface Config {",
      "  readonly port: number;",
      "  readonly mode: 'strict' | 'lenient';",
      "}",
      "",
      "export function bootServer(config: Config): string {",
      "  return `listening:${config.port}:${config.mode}`;",
      "}",
      "",
    ].join("\n"),
  )
  writeFileSync(
    join(projectDir, "src/utils.ts"),
    [
      "export function clamp(value: number, min: number, max: number): number {",
      "  return Math.min(max, Math.max(min, value));",
      "}",
      "",
      "export function formatDuration(ms: number): string {",
      "  return `${Math.round(ms)}ms`;",
      "}",
      "",
    ].join("\n"),
  )
  writeFileSync(join(projectDir, "assets/diagram.png"), Buffer.from(TINY_PNG_BASE64, "base64"))

  execFileSync("git", ["init", "-q"], { cwd: projectDir, env: { ...process.env, ...GIT_ENV } })
  execFileSync("git", ["add", "."], { cwd: projectDir, env: { ...process.env, ...GIT_ENV } })
  execFileSync("git", ["commit", "-q", "-m", "Initial parity fixture"], {
    cwd: projectDir,
    env: { ...process.env, ...GIT_ENV },
  })
}

export const writeParitySettings = (stateDir, projectDir) => {
  const ocData = join(stateDir, "oc-data")
  mkdirSync(ocData, { recursive: true })
  const id = `path_${Buffer.from(projectDir).toString("base64url")}`
  const fixedTs = Date.parse("2026-11-26T10:00:00Z")
  writeFileSync(
    join(ocData, "settings.json"),
    JSON.stringify(
      {
        homeDirectory: join(stateDir, "home"),
        projects: [
          {
            id,
            path: projectDir,
            label: "parity-fixture",
            addedAt: fixedTs,
            lastOpenedAt: fixedTs,
            sidebarCollapsed: false,
          },
        ],
        activeProjectId: id,
        lastDirectory: projectDir,
        defaultModel: "perf/stream-300cps",
        showReasoningTraces: true,
        collapsibleThinkingBlocks: false,
        activityRenderMode: "summary",
        showTurnChangedFiles: true,
        showToolFileIcons: true,
        showTextJustificationActivity: true,
        chatRenderMode: "live",
      },
      null,
      2,
    ),
  )
}

const waitForAgentReady = async (baseUrl, { timeoutMs = 20_000, logFile = null } = {}) => {
  const deadline = Date.now() + timeoutMs
  let lastStatus = 0
  while (Date.now() < deadline) {
    try {
      const res = await fetch(new URL("/api/agent/v1/ready", baseUrl))
      lastStatus = res.status
      if (res.ok) return
    } catch {
      // keep polling
    }
    await wait(250)
  }
  const logTail = logFile && existsSync(logFile) ? `\n--- ${logFile} ---\n${readFileSync(logFile, "utf8").slice(-2000)}` : ""
  throw new Error(`Agent Service did not become ready at ${baseUrl}/api/agent/v1/ready (last status ${lastStatus})${logTail}`)
}

export const createHttpClient = async (baseUrl, logFile = null) => {
  await waitForAgentReady(baseUrl, { logFile })
  const auth = await fetch(new URL("/auth/session", baseUrl))
  if (!auth.ok) throw new Error(`Auth handshake failed with HTTP ${auth.status}`)
  const cookie = auth.headers.getSetCookie().map((entry) => entry.split(";")[0]).join("; ")
  const json = async (pathname, init = {}) => {
    const response = await fetch(new URL(pathname, baseUrl), {
      ...init,
      headers: {
        cookie,
        origin: baseUrl,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`${pathname} failed (${response.status}): ${text.slice(0, 400)}`)
    return text ? JSON.parse(text) : null
  }
  return { json }
}

const populateMarkdownReasoningErrors = async ({ sessionFile, sessionsDir, projectDir, sessionId }) => {
  const baseTs = Date.parse("2026-11-26T10:10:00Z")
  const manager = await SessionManager.open(sessionFile, sessionsDir, undefined, { initialCwd: projectDir, throwIfMissing: true })
  await manager.setSessionName("01 Markdown, Reasoning, Compaction & Errors", "user")

  // Turn 1: User context + rich Markdown + thinking + compaction + async_job_result + openchamber_secret + image
  const firstUserText = [
    "Review the **bootServer** path and summarize what needs hardening.",
    "",
    "<terminal_context>",
    "- build-log lines 12-14:",
    "  12 | WARN server bound to ephemeral port",
    "  13 | INFO agent-service ready",
    "  14 | OK smoke check passed",
    "</terminal_context>",
  ].join("\n")
  const firstEntryId = manager.appendMessage({ role: "user", content: firstUserText, timestamp: baseTs })

  manager.appendMessage(
    assistantMsg(
      [
        {
          type: "thinking",
          thinking:
            "Inspecting bootServer signature in src/app.ts. Need to verify strict mode handling, fenced code output, markdown table formatting, and secret execution cards.",
          thinkingSignature: "sig_parity_1",
        },
        {
          type: "text",
          text: [
            "### Hardening Review",
            "",
            "Checked `bootServer` in `src/app.ts`. Here is the structured comparison:",
            "",
            "| Surface | Mode | Status | Reference |",
            "|---|---|---|---|",
            "| Host Gateway | `strict` | Ready | [Architecture](https://example.com/arch) |",
            "| Agent Worker | `isolated` | Ready | [Contracts](https://example.com/contracts) |",
            "",
            "```typescript",
            "export function verifyStrictConfig(config: Config): boolean {",
            "  return config.port > 20_000 && config.mode === 'strict';",
            "}",
            "```",
            "",
            "```python",
            "def validate_port(port: int) -> bool:",
            "    return port > 20000",
            "```",
          ].join("\n"),
        },
      ],
      baseTs + 200,
    ),
  )

  // Compaction divider
  manager.appendCompaction(
    "Compacted earlier diagnostic checks while preserving config schema and strict port invariants.",
    "Compacted diagnostics",
    firstEntryId,
    42_800,
    {
      method: "soft-compacted",
      tokensAfter: 11_400,
    },
  )

  // Async job result delivery notice
  manager.appendCustomMessageEntry(
    "async-result",
    "<system-notice><task-result id=\"job-async-1\"><output>Indexed 14 modules cleanly without lint regressions.</output></task-result></system-notice>",
    true,
    {
      jobs: [
        {
          jobId: "job-async-1",
          type: "task",
          status: "completed",
          agentId: "scout-index",
          label: "scout-index",
          durationMs: 2400,
        },
      ],
    },
    "agent",
    baseTs + 500,
  )

  // Turn 2: openchamber_secret (secret.run) + openchamber_image + image attachment + failed tool + provider error
  manager.appendMessage({
    role: "user",
    content: "Run the authenticated status probe, render the architecture diagram, and check missing-file handling.",
    timestamp: baseTs + 1000,
  })

  appendToolPair(manager, baseTs + 1100, {
    toolName: "openchamber_secret",
    input: {
      action: "secret.run",
      program: "gh",
      args: ["auth", "status"],
      reason: "Verify token scope without persisting secret",
      inputs: [{ env: "GH_TOKEN", label: "GitHub Token" }],
    },
    text: JSON.stringify({
      ok: true,
      action: "secret.run",
      data: { answer: { status: "ran", outcome: "exited", exitCode: 0 }, stdout: "Logged in to github.com", notSaved: ["GH_TOKEN"] },
    }),
    details: {
      openchamber: {
        ok: true,
        action: "secret.run",
        data: { answer: { status: "ran", outcome: "exited", exitCode: 0 }, stdout: "Logged in to github.com", notSaved: ["GH_TOKEN"] },
      },
    },
  })

  appendToolPair(manager, baseTs + 1200, {
    toolName: "generate_image",
    input: { prompt: "Minimal geometric topology diagram", size: "64x64" },
    text: "Generated diagram at assets/diagram.png",
    details: { imagePaths: ["assets/diagram.png"] },
    images: [{ type: "image", data: TINY_PNG_BASE64, mimeType: "image/png" }],
  })

  appendToolPair(manager, baseTs + 1300, {
    toolName: "read",
    input: { path: "src/nonexistent.ts" },
    text: "ENOENT: no such file or directory, open 'src/nonexistent.ts'",
    details: { errorKind: "tool_error" },
    isError: true,
  })

  manager.appendMessage(assistantMsg([{ type: "text", text: "Verified secret run prompt, image preview, and failed file read." }], baseTs + 1400))

  // Turn 3: Standalone upstream provider error so SessionErrorNotice renders
  manager.appendMessage({
    role: "user",
    content: "Retry upstream provider check.",
    timestamp: baseTs + 1450,
  })

  manager.appendMessage(
    assistantMsg(
      [{ type: "text", text: "Partial response before upstream failure." }],
      baseTs + 1500,
      { stopReason: "error", errorMessage: "Upstream provider returned 503 Service Unavailable" },
    ),
  )
  await manager.ensureOnDisk()
  await manager.flush()
  const seed = new WorkerProjection(manager, sessionId).seed()
  const lastTurn = seed.turns.at(-1)
  if (lastTurn) {
    manager.appendCustomEntry("ohpichamber.turn.v1", {
      turnId: lastTurn.turnId,
      runId: lastTurn.runId,
      status: "failed",
      startedAt: lastTurn.startedAt,
      finishedAt: baseTs + 1600,
      error: "Upstream provider returned 503 Service Unavailable (simulated parity error)",
    })
  }
  await manager.flush()
  await manager.close()
}

const populateCoreToolsAndDiff = async ({ sessionFile, sessionsDir, projectDir, sessionId }) => {
  const baseTs = Date.parse("2026-11-26T10:20:00Z")
  const manager = await SessionManager.open(sessionFile, sessionsDir, undefined, { initialCwd: projectDir, throwIfMissing: true })
  await manager.setSessionName("02 Core Tools & Last-Turn Diff", "user")

  // Turn 1: ReadToolGroup, grep, find, ast_grep, glob, web_search, todo, eval, memory
  manager.appendMessage({
    role: "user",
    content: "Inspect the codebase with read, grep, find, ast_grep, glob, web_search, todo, eval, and retain memory.",
    timestamp: baseTs,
  })

  // Consecutive read calls -> ReadToolGroup
  const callRead1 = `call_${randomUUID().slice(0, 8)}`
  const callRead2 = `call_${randomUUID().slice(0, 8)}`
  manager.appendMessage(
    assistantMsg(
      [
        { type: "thinking", thinking: "Batching consecutive file reads to trigger ReadToolGroup.", thinkingSignature: "sig_read_group" },
        { type: "toolCall", id: callRead1, name: "read", arguments: { path: "src/app.ts" } },
        { type: "toolCall", id: callRead2, name: "read", arguments: { path: "src/utils.ts" } },
      ],
      baseTs + 100,
      { stopReason: "toolUse" },
    ),
  )
  manager.appendMessage(toolResultMsg(callRead1, "read", "1#AA|export interface Config {", { displayContent: "export interface Config {" }, baseTs + 120))
  manager.appendMessage(toolResultMsg(callRead2, "read", "1#BB|export function clamp(value: number) {", { displayContent: "export function clamp(value: number) {" }, baseTs + 130))

  appendToolPair(manager, baseTs + 200, {
    toolName: "grep",
    input: { pattern: "bootServer", path: "src" },
    text: "src/app.ts:6:export function bootServer(config: Config): string {",
    details: { displayContent: "src/app.ts:6:export function bootServer(config: Config): string {", matchCount: 1 },
  })

  appendToolPair(manager, baseTs + 260, {
    toolName: "find",
    input: { query: "server bootstrap configuration", grep_keywords: ["bootServer", "Config"] },
    text: [
      "1 hit(s) for \"server bootstrap configuration\" in src/ (tau 0.20), strongest first",
      "",
      "src/app.ts  0.94  9 lines judged",
      "  src/app.ts:1-9  0.94  export function bootServer(config: Config): string {",
    ].join("\n"),
    details: {},
  })

  appendToolPair(manager, baseTs + 320, {
    toolName: "ast_grep",
    input: { pattern: "export function $NAME($$$ARGS) { $$$BODY }", lang: "typescript", path: "src" },
    text: "src/app.ts:6: export function bootServer(config: Config): string",
    details: { displayContent: "src/app.ts:6: export function bootServer(config: Config): string" },
  })

  appendToolPair(manager, baseTs + 380, {
    toolName: "glob",
    input: { pattern: "src/**/*.ts" },
    text: "src/app.ts\nsrc/utils.ts",
    details: { files: ["src/app.ts", "src/utils.ts"] },
  })

  appendToolPair(manager, baseTs + 440, {
    toolName: "web_search",
    input: { query: "Bun 1.3 workspaces documentation" },
    text: "Sources",
    details: {
      response: {
        provider: "tavily",
        answer: "Bun workspaces support isolated **monorepo** installs and fast script execution.",
        sources: [
          {
            title: "Bun Workspaces Guide",
            url: "https://bun.sh/docs/install/workspaces",
            snippet: "Configure workspace dependencies cleanly in package.json.",
            publishedDate: "2026-10-12",
          },
        ],
      },
    },
  })

  appendToolPair(manager, baseTs + 500, {
    toolName: "todo",
    input: {
      phases: [
        {
          name: "Parity Verification",
          tasks: [
            { content: "Capture before screenshots", status: "completed" },
            { content: "Verify turn diff pills and DiffView", status: "in_progress" },
            { content: "Measure scroll and stream baseline", status: "pending" },
          ],
        },
      ],
    },
    text: "Updated todo checklist (1/3 closed).",
    details: {
      op: "write",
      phases: [
        {
          name: "Parity Verification",
          tasks: [
            { content: "Capture before screenshots", status: "completed" },
            { content: "Verify turn diff pills and DiffView", status: "in_progress" },
            { content: "Measure scroll and stream baseline", status: "pending" },
          ],
        },
      ],
    },
  })

  appendToolPair(manager, baseTs + 560, {
    toolName: "eval",
    input: { language: "js", title: "Compute token totals", code: "return { total: 42, ok: true };" },
    text: "eval completed",
    details: {
      cells: [
        {
          index: 0,
          title: "Compute token totals",
          code: "return { total: 42, ok: true };",
          language: "js",
          output: "{ total: 42, ok: true }",
          status: "complete",
          durationMs: 14,
          exitCode: 0,
        },
      ],
      replies: ["Evaluated 1 cell cleanly."],
      totalDurationMs: 14,
      toolCallCount: 1,
    },
  })

  appendToolPair(manager, baseTs + 620, {
    toolName: "retain",
    input: {
      items: [
        {
          content: "Use port > 20000 in parity fixtures to avoid colliding with dev ports.",
          context: "scripts/chat-parity-capture.mjs",
          scope: "project",
        },
      ],
    },
    text: "Retained 1 memory item.",
    details: { retained: 1 },
  })

  manager.appendMessage(assistantMsg([{ type: "text", text: "Completed initial inspection across all read/search/eval/memory tools." }], baseTs + 700))

  // Turn 2 (Last turn): bash (regular + async + service), edit (diff), write (diff) + changes.jsonl journal!
  const turn2Start = baseTs + 2000
  manager.appendMessage({
    role: "user",
    content: "Apply the strict config update in src/app.ts, add src/health.ts, and verify with bash.",
    timestamp: turn2Start,
  })

  const beforeApp = readFileSync(join(projectDir, "src/app.ts"), "utf8")
  const afterApp = beforeApp.replace("readonly mode: 'strict' | 'lenient';", "readonly mode: 'strict' | 'lenient';\n  readonly strictTls: boolean;")
  const appPatch = [
    "--- a/src/app.ts",
    "+++ b/src/app.ts",
    "@@ -1,4 +1,5 @@",
    " export interface Config {",
    "   readonly port: number;",
    "   readonly mode: 'strict' | 'lenient';",
    "+  readonly strictTls: boolean;",
    " }",
  ].join("\n")

  appendToolPair(manager, turn2Start + 100, {
    toolName: "edit",
    input: { path: "src/app.ts", edits: [{ oldText: "readonly mode: 'strict' | 'lenient';", newText: "readonly mode: 'strict' | 'lenient';\n  readonly strictTls: boolean;" }] },
    text: "Updated src/app.ts",
    details: { diff: appPatch, firstChangedLine: 4 },
  })

  const healthContent = "export function healthCheck(): { ok: true } {\n  return { ok: true };\n}\n"
  appendToolPair(manager, turn2Start + 200, {
    toolName: "write",
    input: { path: "src/health.ts", content: healthContent },
    text: "Created src/health.ts",
    details: {
      diff: [
        "--- /dev/null",
        "+++ b/src/health.ts",
        "@@ -0,0 +1,3 @@",
        "+export function healthCheck(): { ok: true } {",
        "+  return { ok: true };",
        "+}",
      ].join("\n"),
      firstChangedLine: 1,
    },
  })

  appendToolPair(manager, turn2Start + 300, {
    toolName: "bash",
    input: { command: "bun --version && echo 'checks green'", timeout: 10 },
    text: "1.4.5\nchecks green",
    details: { exitCode: 0 },
  })

  appendToolPair(manager, turn2Start + 400, {
    toolName: "bash",
    input: { command: "bun run dev:server", name: "parity-bg-svc", async: true },
    text: "Background service started.",
    details: {
      async: { jobId: "bg_parity_1", state: "running" },
      service: { name: "parity-bg-svc", state: "running", ready: true, pid: 41234 },
    },
  })

  const turn2End = turn2Start + 600
  manager.appendMessage(
    assistantMsg(
      [{ type: "text", text: "Updated `src/app.ts`, added `src/health.ts`, and verified the service checks." }],
      turn2End,
    ),
  )

  await manager.ensureOnDisk()
  await manager.flush()

  // Write changes.jsonl + blobs/ for Turn 2 last-turn diff!
  const artifactsDir = sessionFile.slice(0, -".jsonl".length)
  mkdirSync(join(artifactsDir, "blobs"), { recursive: true })
  writeFileSync(join(artifactsDir, "blobs", "app-before"), gzipText(beforeApp))
  const changeRecords = [
    {
      type: "change",
      at: turn2Start + 150,
      agent: "Main",
      tool: "edit",
      path: join(projectDir, "src/app.ts"),
      base: "app-before",
      edit: [[3, 0, ["  readonly strictTls: boolean;"]]],
      sum: contentSum(afterApp),
    },
    {
      type: "change",
      at: turn2Start + 250,
      agent: "Main",
      tool: "write",
      path: join(projectDir, "src/health.ts"),
      base: null,
      edit: [[0, 0, ["export function healthCheck(): { ok: true } {", "  return { ok: true };", "}", ""]]],
      sum: contentSum(healthContent),
    },
  ]
  writeFileSync(join(artifactsDir, "changes.jsonl"), changeRecords.map((r) => JSON.stringify(r)).join("\n") + "\n")

  await manager.close()
}

const populateSubagentsVibeWaitShells = async ({
  sessionFile,
  sessionsDir,
  projectDir,
  childTaskFile,
  childVibeFile,
  childTaskId,
  childVibeId,
}) => {
  const baseTs = Date.parse("2026-11-26T10:30:00Z")

  // Populate child sessions first
  const taskChildMgr = await SessionManager.open(childTaskFile, sessionsDir, undefined, { initialCwd: projectDir, throwIfMissing: true })
  await taskChildMgr.setSessionName("Subagent: audit-types", "user")
  taskChildMgr.appendMessage({ role: "user", content: "Audit exported types in src/", timestamp: baseTs + 50 })
  taskChildMgr.appendMessage(assistantMsg([{ type: "text", text: "Audited 2 files: all exports strictly typed." }], baseTs + 150))
  await taskChildMgr.ensureOnDisk()
  await taskChildMgr.flush()
  await taskChildMgr.close()

  const vibeChildMgr = await SessionManager.open(childVibeFile, sessionsDir, undefined, { initialCwd: projectDir, throwIfMissing: true })
  await vibeChildMgr.setSessionName("Vibe: inspect-ports", "user")
  vibeChildMgr.appendMessage({ role: "user", content: "Verify port reservation logic", timestamp: baseTs + 60 })
  vibeChildMgr.appendMessage(assistantMsg([{ type: "text", text: "Verified port reservation picks ports > 20000." }], baseTs + 180))
  await vibeChildMgr.ensureOnDisk()
  await vibeChildMgr.flush()
  await vibeChildMgr.close()

  // Populate parent session
  const manager = await SessionManager.open(sessionFile, sessionsDir, undefined, { initialCwd: projectDir, throwIfMissing: true })
  await manager.setSessionName("03 Subagents, Vibe, Wait & Shells", "user")
  manager.appendMessage({
    role: "user",
    content: "Delegate type audit via task, spawn a vibe worker, wait on background jobs, and keep a shell running.",
    timestamp: baseTs,
  })

  const taskCallId = appendToolPair(manager, baseTs + 100, {
    toolName: "task",
    input: {
      context: "Shared parity workspace",
      tasks: [{ name: "audit-types", agent: "scout", task: "Audit exported types in src/", solutionSpace: "read-only audit" }],
    },
    text: "Subagent audit-types completed.",
    details: {
      progress: [
        {
          id: "audit-types",
          agent: "scout",
          status: "completed",
          lastIntent: "Audited src/app.ts and src/utils.ts",
          stage: "completed",
        },
      ],
    },
  })

  const vibeSpawnCallId = appendToolPair(manager, baseTs + 220, {
    toolName: "vibe_spawn",
    input: { cli: "fast", name: "inspect-ports", prompt: "Verify port reservation logic" },
    text: "Spawned fast session `inspect-ports` (turn job `job-vibe-1`).",
    details: {
      op: "spawn",
      screens: [
        {
          id: "inspect-ports",
          cli: "fast",
          state: "idle",
          turns: 1,
          queued: 0,
          lastIntent: "Verified port reservation",
          trace: ["Read src/app.ts", "Verified >20000 port invariant"],
          outputTail: ["Verified port reservation picks ports > 20000."],
        },
      ],
      spawned: { id: "inspect-ports", cli: "fast", jobId: "job-vibe-1" },
    },
  })

  appendToolPair(manager, baseTs + 320, {
    toolName: "vibe_send",
    input: { session: "inspect-ports", message: "Summarize port bounds" },
    text: "Steered inspect-ports",
    details: { op: "send", screens: [], send: { id: "inspect-ports", mode: "steered", jobId: "job-vibe-2" } },
  })

  appendToolPair(manager, baseTs + 400, {
    toolName: "vibe_wait",
    input: { sessions: ["inspect-ports"], timeout: 30 },
    text: "Settled 1 vibe worker",
    details: {
      op: "wait",
      screens: [],
      wait: { settled: [{ id: "inspect-ports", jobId: "job-vibe-2", status: "completed" }], stillRunning: [], timedOut: false },
    },
  })

  appendToolPair(manager, baseTs + 460, {
    toolName: "vibe_list",
    input: {},
    text: "1 vibe session listed",
    details: {
      op: "list",
      screens: [
        {
          id: "inspect-ports",
          cli: "fast",
          state: "idle",
          turns: 2,
          queued: 0,
          lastIntent: "Completed summary",
          trace: [],
          outputTail: ["Port bounds verified."],
        },
      ],
    },
  })

  appendToolPair(manager, baseTs + 520, {
    toolName: "wait",
    input: {},
    text: "1 job settled.",
    details: {
      op: "wait",
      jobs: [{ id: "job-shell-1", type: "bash", status: "completed", label: "bun test", durationMs: 1250, exitCode: 0 }],
      agents: [{ id: "audit-types", activity: "Audited src/app.ts", ageMs: 400, live: false }],
    },
  })

  manager.appendMessage(assistantMsg([{ type: "text", text: "Subagents, vibe workers, and wait coordination settled cleanly." }], baseTs + 650))

  await manager.ensureOnDisk()
  await manager.flush()
  await manager.close()

  return {
    subagents: [
      {
        subagentId: "audit-types",
        parentSessionId: null, // filled by caller
        childSessionId: childTaskId,
        toolCallId: taskCallId,
        name: "audit-types",
        role: "scout",
        status: "completed",
        sessionFile: childTaskFile,
      },
      {
        subagentId: "inspect-ports",
        parentSessionId: null,
        childSessionId: childVibeId,
        toolCallId: vibeSpawnCallId,
        name: "inspect-ports",
        role: "sonic",
        status: "completed",
        sessionFile: childVibeFile,
      },
    ],
  }
}

const populateStructuredCards = async ({ sessionFile, sessionsDir, projectDir }) => {
  const baseTs = Date.parse("2026-11-26T10:40:00Z")
  const manager = await SessionManager.open(sessionFile, sessionsDir, undefined, { initialCwd: projectDir, throwIfMissing: true })
  await manager.setSessionName("04 Structured OMP Cards (All 12)", "user")

  manager.appendMessage({
    role: "user",
    content: "Exercise all 12 structured OMP tool cards: debug, github, goal, security_scan, checkpoint, rewind, yield, think, report_issue, resolve, reject, propose.",
    timestamp: baseTs,
  })

  const cards = [
    {
      toolName: "debug",
      input: { action: "stack_trace" },
      text: "at bootServer (src/app.ts:6:3)",
      details: {
        action: "stack_trace",
        success: true,
        snapshot: {
          id: "dbg-1",
          adapter: "bun-dap",
          status: "stopped",
          stopReason: "breakpoint",
          frameName: "bootServer",
          source: { path: "src/app.ts" },
          line: 6,
          column: 3,
        },
      },
    },
    {
      toolName: "github",
      input: { repo: "openchamber/ohpichamber", branch: "release-hardening/10" },
      text: "CI workflow passed",
      details: {
        repo: "openchamber/ohpichamber",
        branch: "release-hardening/10",
        headSha: "30c70496a5deadbeef",
        status: "completed",
        conclusion: "success",
        watch: {
          mode: "run",
          state: "completed",
          run: {
            id: 4210,
            workflowName: "CI Verification",
            status: "completed",
            conclusion: "success",
            headSha: "30c70496a5deadbeef",
            jobs: [
              {
                id: 91,
                name: "typecheck-and-test",
                status: "completed",
                conclusion: "success",
                durationSeconds: 38,
                steps: [{ number: 1, name: "bun run type-check", status: "completed", conclusion: "success" }],
              },
            ],
          },
        },
      },
    },
    {
      toolName: "goal",
      input: { op: "get", objective: "Port transcript onto ChatViewport" },
      text: "Goal active",
      details: {
        op: "get",
        goal: {
          id: "goal-10",
          objective: "Port transcript onto ChatViewport",
          status: "active",
          tokenBudget: 200_000,
          tokensUsed: 42_500,
          timeUsedSeconds: 185,
        },
        remainingTokens: 157_500,
      },
    },
    {
      toolName: "security_scan",
      input: { action: "scan_status" },
      text: "Security scan completed with 0 findings",
      details: {
        action: "scan_status",
        plan: { id: "plan-sec-1", fingerprint: "a1b2c3d4e5f6" },
        operation: { operationId: "op-1", scanId: "scan-1", planId: "plan-sec-1", phase: "completed", findingCount: 0 },
      },
    },
    {
      toolName: "checkpoint",
      input: { goal: "Verify parity baseline before editing packages/ui" },
      text: "Checkpoint created",
      details: { goal: "Verify parity baseline before editing packages/ui", startedAt: "2026-11-26T10:40:00Z" },
    },
    {
      toolName: "rewind",
      input: { report: "Rewound scratch changes to pre-refactor checkpoint" },
      text: "Rewound",
      details: { report: "Rewound scratch changes to pre-refactor checkpoint", rewound: true },
    },
    {
      toolName: "yield",
      input: { type: "findings", data: { summary: "All 12 structured cards populated", verifiedCount: 12 } },
      text: "Yielded findings",
      details: { status: "success", type: "findings", complete: true, data: { summary: "All 12 structured cards populated", verifiedCount: 12 } },
    },
    {
      toolName: "think",
      input: { thoughts: "Keep structured card headers succinct and avoid raw JSON dumps." },
      text: "------",
      details: { recorded: true },
    },
    {
      toolName: "report_issue",
      input: { report: "Check sticky user header overlap at 390px mobile width." },
      text: "Recorded issue",
      details: {},
    },
    {
      toolName: "resolve",
      input: { reason: "Verified viewport pinning at scroll bottom" },
      text: "Applied",
      details: { action: "apply", reason: "Verified viewport pinning at scroll bottom", label: "scroll-pin" },
    },
    {
      toolName: "reject",
      input: { reason: "Discarded fallback adapter shim" },
      text: "Discarded",
      details: { action: "discard", reason: "Discarded fallback adapter shim", label: "no-shims" },
    },
    {
      toolName: "propose",
      input: { title: "Cutover timeline to ChatViewport" },
      text: "Proposed plan",
      details: { action: "propose", reason: "Cutover timeline to ChatViewport", label: "window-10" },
    },
  ]

  cards.forEach((card, index) => {
    appendToolPair(manager, baseTs + 100 + index * 50, card)
  })

  manager.appendMessage(assistantMsg([{ type: "text", text: "Rendered all 12 structured OMP tool cards." }], baseTs + 1000))
  await manager.ensureOnDisk()
  await manager.flush()
  await manager.close()
}

export const populateLongTranscript = async ({ sessionFile, sessionsDir, projectDir, turns = 45 }) => {
  const baseTs = Date.parse("2026-11-26T10:50:00Z")
  const manager = await SessionManager.open(sessionFile, sessionsDir, undefined, { initialCwd: projectDir, throwIfMissing: true })
  await manager.setSessionName(`05 Long Transcript (${turns} Turns)`, "user")

  for (let i = 1; i <= turns; i += 1) {
    const ts = baseTs + i * 2000
    manager.appendMessage({
      role: "user",
      content: `Turn ${i}/${turns}: Analyze virtualization segment ${i} and verify scroll anchoring stability.`,
      timestamp: ts,
    })

    if (i % 5 === 0) {
      appendToolPair(manager, ts + 200, {
        toolName: "bash",
        input: { command: `echo "turn-${i} verified"` },
        text: `turn-${i} verified`,
        details: { exitCode: 0 },
      })
    }

    manager.appendMessage(
      assistantMsg(
        [
          ...(i % 4 === 0
            ? [{ type: "thinking", thinking: `Checking scroll metric consistency for turn ${i}.`, thinkingSignature: `sig_long_${i}` }]
            : []),
          {
            type: "text",
            text: [
              `### Segment ${i} Analysis`,
              "",
              `Virtualization bucket **#${i}** keeps row height deterministic while preserving smooth scroll across ${turns} turns.`,
              "",
              "```ts",
              `export const segment${i} = { index: ${i}, anchored: true, virtualized: true };`,
              "```",
            ].join("\n"),
          },
        ],
        ts + 500,
      ),
    )
  }

  await manager.ensureOnDisk()
  await manager.flush()
  await manager.close()
}

export class ParityPage {
  constructor(client, consoleErrors, pageErrors) {
    this.client = client
    this.consoleErrors = consoleErrors
    this.pageErrors = pageErrors
  }

  async setViewport(vp) {
    await this.client.send("Emulation.setDeviceMetricsOverride", {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: vp.deviceScaleFactor,
      mobile: vp.mobile,
    })
  }

  async evaluate(expression) {
    const res = await this.client.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (res.exceptionDetails) {
      throw new Error(`Page eval error: ${res.exceptionDetails.text ?? JSON.stringify(res.exceptionDetails)}`)
    }
    return res.result?.value ?? null
  }

  async waitFor(predicateExpr, timeoutMs = 45_000, label = "condition") {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const ok = await this.evaluate(`Boolean(${predicateExpr})`).catch(() => false)
      if (ok) return
      await wait(150)
    }
    throw new Error(`Timed out waiting for ${label} (${timeoutMs}ms)`)
  }

  async navigate(url) {
    await this.client.send("Page.navigate", { url })
    await this.waitFor("document.readyState === 'complete' && !document.getElementById('initial-loading')", 45_000, "app load")
  }

  async settle() {
    await this.evaluate(`(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    })()`)
    await wait(500)
  }

  async expandAllExpandables() {
    await this.evaluate(`(() => {
      const chat = document.querySelector('[data-scrollbar="chat"]') || document.body;
      const buttons = chat.querySelectorAll('.group\\\\/tool[role="button"][aria-expanded="false"], [data-read-tool-group] [role="button"][aria-expanded="false"], [data-timeline-notice] button[aria-expanded="false"], [data-testid="todo-card"] button[aria-expanded="false"]');
      for (const btn of buttons) btn.click();
      return buttons.length;
    })()`)
    await this.settle()
  }

  async scrollChat(mode) {
    await this.evaluate(`(() => {
      const scroller = document.querySelector('[data-scrollbar="chat"]');
      if (!scroller) return null;
      if (${JSON.stringify(mode)} === 'top') scroller.scrollTop = 0;
      else if (${JSON.stringify(mode)} === 'middle') scroller.scrollTop = Math.floor(scroller.scrollHeight * 0.45);
      else if (${JSON.stringify(mode)} === 'bottom') scroller.scrollTop = scroller.scrollHeight;
      return { scrollTop: scroller.scrollTop, scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight };
    })()`)
    await this.settle()
  }

  async screenshot(outFile) {
    const { data } = await this.client.send("Page.captureScreenshot", { format: "png" })
    mkdirSync(dirname(outFile), { recursive: true })
    writeFileSync(outFile, Buffer.from(data, "base64"))
  }
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  const tmpDir = join(options.stateDir, "tmp")
  mkdirSync(tmpDir, { recursive: true })
  process.env.TMPDIR = tmpDir

  const builtIndex = join(options.dist, "index.html")
  if (!existsSync(builtIndex)) {
    throw new Error(`Missing built web UI at ${builtIndex}. Run: bun run build:web`)
  }

  const chromeBin = resolveChromeBinary(options.chrome)
  const serverPort = await reserveHighPort(options.port)
  const fixturePort = await reserveHighPort(options.fixturePort)
  const chromePort = await reserveHighPort()

  const cleanups = []
  let stopping = false
  const cleanupAll = async () => {
    if (stopping) return
    stopping = true
    while (cleanups.length > 0) {
      const fn = cleanups.pop()
      try {
        await fn()
      } catch {
        // best effort cleanup
      }
    }
  }
  const onSignal = async (code) => {
    await cleanupAll()
    process.exit(code)
  }
  process.once("SIGINT", () => void onSignal(130))
  process.once("SIGTERM", () => void onSignal(143))

  try {
    rmSync(options.stateDir, { recursive: true, force: true })
    mkdirSync(options.stateDir, { recursive: true })
    mkdirSync(tmpDir, { recursive: true })
    mkdirSync(join(options.stateDir, "home"), { recursive: true })
    mkdirSync(join(options.stateDir, "agent"), { recursive: true })
    mkdirSync(join(options.stateDir, "electron-userdata"), { recursive: true })
    prepareProject(options.projectDir)
    writeParitySettings(options.stateDir, options.projectDir)
    log(`Starting fixture provider on :${fixturePort} and isolated server on :${serverPort}`)
    const fixture = await startFixture({
      port: fixturePort,
      logFile: join(options.stateDir, "fixture.log"),
    })
    cleanups.push(() => fixture.stop())

    let server = await startIsolatedServer({
      repo: REPO_ROOT,
      dist: options.dist,
      state: options.stateDir,
      project: options.projectDir,
      port: serverPort,
      fixturePort,
      logFile: join(options.stateDir, "server-seed.log"),
    })
    cleanups.push(() => server.stop())

    const client = await createHttpClient(server.url, join(options.stateDir, "server-seed.log"))
    const projects = await client.json("/api/agent/v1/projects")
    const project = projects.items?.[0]
    if (!project) throw new Error("No project registered on isolated server")
    const workspaces = await client.json(`/api/agent/v1/workspaces?projectId=${encodeURIComponent(project.projectId)}`)
    const workspace = workspaces.items?.[0]
    if (!workspace) throw new Error("No workspace registered on isolated server")

    const createSession = async (title) => {
      const res = await client.json("/api/agent/v1/sessions", {
        method: "POST",
        body: JSON.stringify({
          projectId: workspace.projectId,
          workspaceId: workspace.workspaceId,
          title,
          options: { providerId: "perf", modelId: "stream-300cps", agentId: null, variant: null, reasoningEffort: null },
        }),
      })
      return res.session.sessionId
    }

    const s1 = await createSession("01 Markdown, Reasoning, Compaction & Errors")
    const s2 = await createSession("02 Core Tools & Last-Turn Diff")
    const s3 = await createSession("03 Subagents, Vibe, Wait & Shells")
    const s4 = await createSession("04 Structured OMP Cards (All 12)")
    const s5 = await createSession("05 Long Transcript (45 Turns)")

    // Stop server before mutating session-references.json and .jsonl transcripts
    await server.stop()
    cleanups.pop()

    const refsPath = join(options.stateDir, "oc-data/agent-state/session-references.json")
    const refsJson = JSON.parse(readFileSync(refsPath, "utf8"))
    const refFor = (id) => refsJson.references[id]
    const sessionsDir = refFor(s1).sessionsDirectory

    await populateMarkdownReasoningErrors({
      sessionFile: refFor(s1).sessionFile,
      sessionsDir,
      projectDir: options.projectDir,
      sessionId: s1,
    })
    await populateCoreToolsAndDiff({
      sessionFile: refFor(s2).sessionFile,
      sessionsDir,
      projectDir: options.projectDir,
      sessionId: s2,
    })

    // Create two native child session files for task & vibe_spawn
    const childTaskId = randomUUID()
    const childVibeId = randomUUID()
    const childTaskMgr = SessionManager.create(options.projectDir, sessionsDir)
    await childTaskMgr.ensureOnDisk()
    const childTaskFile = childTaskMgr.getSessionFile()
    await childTaskMgr.close()
    const childVibeMgr = SessionManager.create(options.projectDir, sessionsDir)
    await childVibeMgr.ensureOnDisk()
    const childVibeFile = childVibeMgr.getSessionFile()
    await childVibeMgr.close()

    const s3Sub = await populateSubagentsVibeWaitShells({
      sessionFile: refFor(s3).sessionFile,
      sessionsDir,
      projectDir: options.projectDir,
      childTaskFile,
      childVibeFile,
      childTaskId,
      childVibeId,
    })
    refsJson.subagents[s3] = s3Sub.subagents.map((row) => ({
      ...row,
      rootSessionId: s3,
      parentSessionId: s3,
      workspaceId: workspace.workspaceId,
      projectId: workspace.projectId,
    }))
    writeFileSync(refsPath, JSON.stringify(refsJson, null, 2), { mode: 0o600 })
    const policyStore = openApprovalPolicyStore({ dataDir: join(options.stateDir, "oc-data") })
    try {
      policyStore.commit({
        scope: "session",
        sessionId: s3,
        rootSessionId: s3,
        projectId: workspace.projectId,
        workspaceId: workspace.workspaceId,
        decision: "allow",
        target: { toolName: "bash", pattern: JSON.stringify({ command: "sleep 120", background: true }) },
      })
    } finally {
      policyStore.close()
    }

    await populateStructuredCards({
      sessionFile: refFor(s4).sessionFile,
      sessionsDir,
      projectDir: options.projectDir,
    })
    await populateLongTranscript({
      sessionFile: refFor(s5).sessionFile,
      sessionsDir,
      projectDir: options.projectDir,
      turns: 45,
    })

    log("Restarting isolated server with populated parity sessions")
    server = await startIsolatedServer({
      repo: REPO_ROOT,
      dist: options.dist,
      state: options.stateDir,
      project: options.projectDir,
      port: serverPort,
      fixturePort,
      logFile: join(options.stateDir, "server-capture.log"),
    })
    cleanups.push(() => server.stop())

    const liveClient = await createHttpClient(server.url, join(options.stateDir, "server-capture.log"))
    // Open s1's worker so runtimeStatus is 'idle' and SessionErrorNotice renders
    await liveClient.json(`/api/agent/v1/sessions/${encodeURIComponent(s1)}/control`, {
      method: "POST",
      body: JSON.stringify({ type: "mode.set", mode: "main" }),
    })
    const s1Snap = await liveClient.json(`/api/agent/v1/sessions/${encodeURIComponent(s1)}/snapshot`)
    log(`s1 snapshot status=${s1Snap.session?.runtimeStatus} lastTurn=${JSON.stringify(s1Snap.turns?.at(-1))}`)
    await liveClient.json(`/api/agent/v1/sessions/${encodeURIComponent(s3)}/shell/jobs`, {
      method: "POST",
      body: JSON.stringify({ command: "sleep 120", background: true }),
    })
    const profile = resolveProfileDir(null, "chat-parity")
    log(`Launching headless Chromium (${chromeBin}) on CDP port ${chromePort}`)
    const chromeProc = launchChrome({
      chrome: chromeBin,
      profileDir: profile.dir,
      port: chromePort,
      headless: true,
    })
    cleanups.push(async () => {
      try {
        chromeProc.kill("SIGKILL")
      } catch {
        // already exited
      }
      profile.removeAfter(chromeProc)
    })

    const target = await createPageTarget(chromePort)
    const cdp = new CdpClient(target.webSocketDebuggerUrl)
    await cdp.connect()
    cleanups.push(() => cdp.close())

    await cdp.send("Page.enable")
    await cdp.send("Runtime.enable")
    await cdp.send("Log.enable")
    await cdp.send("Emulation.setEmulatedMedia", {
      media: "screen",
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    })

    const consoleErrors = []
    const pageErrors = []
    cdp.on("Runtime.consoleAPICalled", (params) => {
      if (params.type === "error") {
        const msg = (params.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ")
        consoleErrors.push({ source: "console.error", message: msg })
      }
    })
    cdp.on("Runtime.exceptionThrown", (params) => {
      pageErrors.push({
        source: "exception",
        message: params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? "Uncaught exception",
      })
    })
    cdp.on("Log.entryAdded", (params) => {
      if (params.entry?.level === "error") {
        consoleErrors.push({ source: `log.${params.entry.source ?? "browser"}`, message: params.entry.text ?? "" })
      }
    })

    const page = new ParityPage(cdp, consoleErrors, pageErrors)
    mkdirSync(options.out, { recursive: true })
    const shots = []

    const sessionsToCapture = [
      {
        id: s1,
        slug: "01-markdown-reasoning-errors",
        waitText: "Hardening Review",
        assertions: [
          "document.body.innerText.includes('Hardening Review')",
          "document.body.innerText.includes('Inspecting bootServer signature')",
          "document.body.innerText.includes('scout-index')",
          "document.body.innerText.includes('ENOENT: no such file or directory')",
          "document.body.innerText.includes('Partial response before upstream failure.')",
        ],
        positions: ["top", "bottom"],
        expand: true,
      },
      {
        id: s2,
        slug: "02-core-tools-and-diff",
        waitText: "Updated `src/app.ts`",
        waitExpr: "document.body.innerText.includes('Updated src/app.ts') || document.body.innerText.includes('Compute token totals')",
        assertions: [
          "document.querySelectorAll('[data-read-tool-group]').length >= 1",
          "document.querySelectorAll('[data-testid=\"todo-card\"]').length >= 1",
          "document.querySelectorAll('[data-testid=\"eval-presenter\"]').length >= 1",
          "document.querySelectorAll('[data-testid=\"memory-tool-card\"]').length >= 1",
          "document.body.innerText.includes('Bun Workspaces Guide')",
          "document.body.innerText.includes('parity-bg-svc')",
        ],
        positions: ["top", "middle", "bottom"],
        expand: true,
        openTurnDiffOnDesktop: true,
      },
      {
        id: s3,
        slug: "03-subagents-vibe-wait-shells",
        waitExpr: "document.body.innerText.includes('Subagents, vibe workers')",
        assertions: [
          "document.querySelectorAll('[data-testid=\"vibe-tool-card\"]').length >= 1",
          "document.querySelectorAll('[data-testid=\"wait-tool-card\"]').length >= 1",
          "document.body.innerText.includes('sleep 120')",
          "document.body.innerText.includes('audit-types')",
        ],
        positions: ["bottom"],
        expand: true,
      },
      {
        id: s4,
        slug: "04-structured-cards",
        waitExpr: "document.body.innerText.includes('Rendered all 12 structured OMP tool cards')",
        assertions: [
          "document.querySelectorAll('[data-testid=\"structured-card-debug\"]').length >= 1",
          "document.querySelectorAll('[data-testid=\"structured-card-goal\"]').length >= 1",
          "document.querySelectorAll('[data-testid=\"structured-card-security-scan\"]').length >= 1",
          "document.querySelectorAll('[data-testid=\"structured-card-checkpoint\"]').length >= 1",
          "document.querySelectorAll('[data-testid=\"structured-card-rewind\"]').length >= 1",
          "document.querySelectorAll('[data-testid=\"structured-card-yield\"]').length >= 1",
          "document.querySelectorAll('[data-testid=\"structured-card-think\"]').length >= 1",
          "document.querySelectorAll('[data-testid=\"structured-card-report-issue\"]').length >= 1",
          "document.querySelectorAll('[data-testid=\"structured-card-resolve\"]').length >= 1",
          "document.querySelectorAll('[data-testid=\"structured-card-reject\"]').length >= 1",
          "document.querySelectorAll('[data-testid=\"structured-card-propose\"]').length >= 1",
        ],
        positions: ["top", "middle", "bottom"],
        expand: true,
      },
      {
        id: s5,
        slug: "05-long-transcript",
        waitExpr: "document.body.innerText.includes('Segment 45 Analysis') || document.body.innerText.includes('Turn 45/45')",
        assertions: [
          "document.querySelectorAll('[data-message-id]').length >= 4",
          "document.body.innerText.includes('Segment 45 Analysis')",
        ],
        positions: ["bottom", "middle"],
        expand: false,
      },
    ]

    for (const vp of VIEWPORTS) {
      log(`Capturing viewport ${vp.name} (${vp.width}x${vp.height})`)
      await page.setViewport(vp)
      const vpDir = join(options.out, vp.name)
      mkdirSync(vpDir, { recursive: true })

      for (const spec of sessionsToCapture) {
        await page.navigate(`${server.url}/?session=${encodeURIComponent(spec.id)}`)
        await page.waitFor(
          spec.waitExpr ?? `document.body.innerText.includes(${JSON.stringify(spec.waitText)})`,
          45_000,
          `${spec.slug} (${vp.name})`,
        )
        await page.settle()
        const assertionResults = Object.fromEntries(spec.assertions.map((expr) => [expr, false]))

        for (const pos of spec.positions) {
          await page.scrollChat(pos)
          if (spec.expand) {
            await page.expandAllExpandables()
          }
          for (const expr of spec.assertions) {
            if (!assertionResults[expr]) {
              assertionResults[expr] = await page.evaluate(`Boolean(${expr})`)
            }
          }
          const filename = `${spec.slug}--${pos}.png`
          await page.screenshot(join(vpDir, filename))
          shots.push({ viewport: vp.name, session: spec.slug, position: pos, file: join(vp.name, filename), assertions: { ...assertionResults } })
          log(`Captured ${vp.name}/${filename}`)
        }

        const failedAssertions = Object.entries(assertionResults).filter(([, ok]) => !ok).map(([expr]) => expr)
        if (failedAssertions.length > 0) {
          const diag = await page.evaluate(`(async () => {
            const snap = await fetch('/api/agent/v1/sessions/' + encodeURIComponent(${JSON.stringify(spec.id)}) + '/snapshot').then(r => r.json()).catch(e => ({ err: String(e) }));
            const evRes = await fetch('/api/agent/v1/sessions/' + encodeURIComponent(${JSON.stringify(spec.id)}) + '/events?cursor=' + encodeURIComponent(snap.cursor || ''), { headers: { accept: 'text/event-stream' } }).then(r => ({ status: r.status, ct: r.headers.get('content-type') })).catch(e => ({ err: String(e) }));
            return JSON.stringify({
              statuses: [...document.querySelectorAll('[role="status"]')].map(el => el.innerText),
              tail: document.body.innerText.slice(-500),
              snapStatus: snap.session?.runtimeStatus,
              snapLastTurn: snap.turns?.at(-1),
              snapLastMsg: snap.messages?.at(-1)?.createdAt,
              evRes,
            });
          })()`)
          throw new Error(`DOM assertions failed for ${spec.slug} (${vp.name}): ${failedAssertions.join(" ; ")}\nDiag: ${diag}`)
        }
        if (spec.openTurnDiffOnDesktop && !vp.mobile) {
          // Click the turn changed file pill button to verify Last-turn DiffView opens
          const clickedPill = await page.evaluate(`(() => {
            const btns = [...document.querySelectorAll('button[title^="Open "]')];
            const btn = btns.find((el) => el.innerText.includes('health.ts') && el.innerText.includes('+3'));
            if (btn) { btn.click(); return true; }
            return false;
          })()`)
          if (!clickedPill) {
            throw new Error(`Could not find TurnChangedFilePill button for ${spec.slug} (${vp.name})`)
          }
          await page.waitFor("(document.body.innerText.includes('Last turn') || document.body.innerText.includes('Earlier turn')) && Boolean(document.querySelector('diffs-container')?.shadowRoot?.textContent?.includes('healthCheck'))", 15_000, "Last-turn diff view")
          await page.settle()
          const diffFile = `${spec.slug}--turn-diff.png`
          await page.screenshot(join(vpDir, diffFile))
          shots.push({ viewport: vp.name, session: spec.slug, position: "turn-diff", file: join(vp.name, diffFile), clickedPill: true })
          log(`Captured ${vp.name}/${diffFile}`)
        }
      }
    }

    const manifest = {
      capturedAt: new Date().toISOString(),
      dist: options.dist,
      consoleErrorCount: consoleErrors.length,
      pageErrorCount: pageErrors.length,
      consoleErrors,
      pageErrors,
      sessions: { s1, s2, s3, s4, s5 },
      shots,
    }
    writeFileSync(join(options.out, "manifest.json"), JSON.stringify(manifest, null, 2))
    log(`Manifest written: ${join(options.out, "manifest.json")}`)
    log(`Console errors: ${consoleErrors.length}, Page errors: ${pageErrors.length}`)

    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      throw new Error(`Browser errors detected: console=${consoleErrors.length}, page=${pageErrors.length}`)
    }
  } finally {
    await cleanupAll()
    if (!options.keepState) {
      rmSync(options.stateDir, { recursive: true, force: true })
      rmSync(options.projectDir, { recursive: true, force: true })
    }
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`[chat-parity] ERROR: ${error instanceof Error ? error.stack || error.message : String(error)}`)
    process.exit(1)
  })
}
