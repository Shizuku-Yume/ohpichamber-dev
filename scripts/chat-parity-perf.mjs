#!/usr/bin/env bun
/**
 * Before/after streaming & long-transcript scroll performance baseline for
 * the ChatViewport port.
 *
 * Uses the isolated server + deterministic `perf/stream-300cps` fixture
 * provider + headless Chromium CDP tracing (`scripts/perf/*`) without touching
 * user config directories.
 *
 * Usage:
 *   bun scripts/chat-parity-perf.mjs --out <dir>
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import process from "node:process"

import {
  CdpClient,
  createPageTarget,
  launchChrome,
  resolveProfileDir,
  wait,
} from "./perf/cdp.mjs"
import { REPO_ROOT, startFixture, startIsolatedServer } from "./perf/isolated-server.mjs"
import {
  metricMap,
  percentile,
  round,
  summarizeFrameBudget,
  summarizeLongTasks,
  summarizeTraceEvents,
} from "./perf/metrics.mjs"
import { buildPageSignalsSource, startPageSignals } from "./perf/page-signals.mjs"
import {
  createHttpClient,
  ParityPage,
  populateLongTranscript,
  prepareProject,
  reserveHighPort,
  resolveChromeBinary,
  writeParitySettings,
} from "./chat-parity-capture.mjs"

const DEFAULT_STATE_DIR = "/tmp/relh-10/perf-state"
const DEFAULT_PROJECT_DIR = "/tmp/relh-10/perf-project"
const TRACE_CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "blink.user_timing",
  "viz",
].join(",")

const parseArgs = (argv) => {
  const options = {
    out: null,
    stateDir: DEFAULT_STATE_DIR,
    projectDir: DEFAULT_PROJECT_DIR,
    dist: join(REPO_ROOT, "packages/web/dist"),
    chrome: null,
    keepState: false,
    turns: 45,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--out") options.out = resolve(argv[++i])
    else if (arg === "--state-dir") options.stateDir = resolve(argv[++i])
    else if (arg === "--project-dir") options.projectDir = resolve(argv[++i])
    else if (arg === "--dist") options.dist = resolve(argv[++i])
    else if (arg === "--chrome") options.chrome = resolve(argv[++i])
    else if (arg === "--turns") options.turns = Number(argv[++i])
    else if (arg === "--keep-state") options.keepState = true
    else throw new Error(`Unknown option: ${arg}`)
  }
  if (!options.out) throw new Error("--out <dir> is required")
  return options
}

const log = (msg) => console.log(`[chat-perf] ${msg}`)

const collectTrace = async (client, fn) => {
  const traceEvents = []
  let vizFrames = 0
  const unsubscribe = client.on("Tracing.dataCollected", ({ value }) => {
    for (const ev of value ?? []) {
      traceEvents.push(ev)
      if (ev.name === "Display::DrawAndSwap" && (ev.ph === "X" || ev.ph === "B")) {
        vizFrames += 1
      }
    }
  })
  await client.send("Tracing.start", {
    transferMode: "ReportEvents",
    categories: TRACE_CATEGORIES,
  })
  const startedAt = Date.now()
  const beforeMetrics = metricMap((await client.send("Performance.getMetrics")).metrics)
  const signals = await startPageSignals(client)

  const payload = await fn()

  const pageSignals = await signals.stop()
  const afterMetrics = metricMap((await client.send("Performance.getMetrics")).metrics)
  const elapsedSeconds = (Date.now() - startedAt) / 1000
  const complete = client.once("Tracing.tracingComplete", 60_000)
  await client.send("Tracing.end")
  await complete
  unsubscribe()

  const longTasks = summarizeLongTasks(traceEvents, 50)
  const frameBudget = summarizeFrameBudget(traceEvents)
  const taskTotalMs = round(((afterMetrics.TaskDuration ?? 0) - (beforeMetrics.TaskDuration ?? 0)) * 1000)
  const scriptTotalMs = round(((afterMetrics.ScriptDuration ?? 0) - (beforeMetrics.ScriptDuration ?? 0)) * 1000)
  const layoutTotalMs = round(((afterMetrics.LayoutDuration ?? 0) - (beforeMetrics.LayoutDuration ?? 0)) * 1000)
  const recalcTotalMs = round(((afterMetrics.RecalcStyleDuration ?? 0) - (beforeMetrics.RecalcStyleDuration ?? 0)) * 1000)

  return {
    payload,
    elapsedSeconds: round(elapsedSeconds),
    vizFrames,
    vizFps: elapsedSeconds > 0 ? round(vizFrames / elapsedSeconds, 1) : null,
    longTasks,
    frameBudget,
    pageSignals,
    metrics: {
      taskTotalMs,
      busyPercent: elapsedSeconds > 0 ? round((taskTotalMs / (elapsedSeconds * 1000)) * 100, 1) : null,
      scriptTotalMs,
      layoutCount: Math.max(0, Math.round((afterMetrics.LayoutCount ?? 0) - (beforeMetrics.LayoutCount ?? 0))),
      layoutTotalMs,
      recalcStyleCount: Math.max(0, Math.round((afterMetrics.RecalcStyleCount ?? 0) - (beforeMetrics.RecalcStyleCount ?? 0))),
      recalcTotalMs,
      jsHeapUsedMb: round((afterMetrics.JSHeapUsedSize ?? 0) / (1024 * 1024), 1),
      domNodes: Math.round(afterMetrics.Nodes ?? 0),
    },
    topTraceEvents: summarizeTraceEvents(traceEvents, 12),
  }
}

const STREAM_SAMPLER_SOURCE = `(() => {
  globalThis.__chatPerfStream = {
    start() {
      const target = document.querySelector('[data-scrollbar="chat"]') || document.querySelector('main') || document.body;
      const frameTimes = [];
      let lastTs = performance.now();
      let active = true;
      let mutCount = 0;
      let mutFlushScheduled = false;
      let mutFlushes = 0;
      const obs = new MutationObserver(() => {
        mutCount += 1;
        if (!mutFlushScheduled) {
          mutFlushScheduled = true;
          requestAnimationFrame(() => {
            mutFlushes += 1;
            mutFlushScheduled = false;
          });
        }
      });
      obs.observe(target, { childList: true, subtree: true, characterData: true });
      const tick = (now) => {
        if (!active) return;
        frameTimes.push(now - lastTs);
        lastTs = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      globalThis.__chatPerfStream._stop = () => {
        active = false;
        obs.disconnect();
        return { frameTimes, mutCount, mutFlushes };
      };
    },
    stop() {
      return globalThis.__chatPerfStream._stop ? globalThis.__chatPerfStream._stop() : { frameTimes: [], mutCount: 0, mutFlushes: 0 };
    },
  };
})()`

const summarizeRafGaps = (frameTimes) => {
  // Skip first frame delta right after start
  const deltas = frameTimes.slice(1)
  if (deltas.length === 0) {
    return { rafFrames: 0, effectiveFps: null, p50FrameMs: null, p95FrameMs: null, worstFrameMs: null, droppedFramesOver16ms: 0, droppedFramesOver33ms: 0 }
  }
  const totalMs = deltas.reduce((acc, d) => acc + d, 0)
  return {
    rafFrames: deltas.length,
    effectiveFps: totalMs > 0 ? round((deltas.length / totalMs) * 1000, 1) : null,
    p50FrameMs: percentile(deltas, 0.5),
    p95FrameMs: percentile(deltas, 0.95),
    worstFrameMs: round(deltas.reduce((m, v) => Math.max(m, v), 0)),
    droppedFramesOver16ms: deltas.filter((d) => d > 17.5).length,
    droppedFramesOver33ms: deltas.filter((d) => d > 34).length,
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
  const serverPort = await reserveHighPort()
  const fixturePort = await reserveHighPort()
  const chromePort = await reserveHighPort()

  const cleanups = []
  let stopping = false
  const cleanupAll = async () => {
    if (stopping) return
    stopping = true
    while (cleanups.length > 0) {
      const fn = cleanups.pop()
      try { await fn() } catch { }
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

    const seedClient = await createHttpClient(server.url, join(options.stateDir, "server-seed.log"))
    const projects = await seedClient.json("/api/agent/v1/projects")
    const project = projects.items?.[0]
    if (!project) throw new Error("No project registered on isolated server")
    const workspaces = await seedClient.json(`/api/agent/v1/workspaces?projectId=${encodeURIComponent(project.projectId)}`)
    const workspace = workspaces.items?.[0]
    if (!workspace) throw new Error("No workspace registered on isolated server")

    const createSession = async (title) => {
      const res = await seedClient.json("/api/agent/v1/sessions", {
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

    const longSessionId = await createSession(`05 Long Transcript (${options.turns} Turns)`)
    const streamSessionId = await createSession("Perf Stream 300cps")

    await server.stop()
    cleanups.pop()

    const refsPath = join(options.stateDir, "oc-data/agent-state/session-references.json")
    const refsJson = JSON.parse(readFileSync(refsPath, "utf8"))
    const refLong = refsJson.references[longSessionId]
    await populateLongTranscript({
      sessionFile: refLong.sessionFile,
      sessionsDir: refLong.sessionsDirectory,
      projectDir: options.projectDir,
      turns: options.turns,
    })
    const refStream = refsJson.references[streamSessionId]
    await populateLongTranscript({
      sessionFile: refStream.sessionFile,
      sessionsDir: refStream.sessionsDirectory,
      projectDir: options.projectDir,
      turns: 1,
    })

    log("Restarting isolated server with seeded long transcript")
    server = await startIsolatedServer({
      repo: REPO_ROOT,
      dist: options.dist,
      state: options.stateDir,
      project: options.projectDir,
      port: serverPort,
      fixturePort,
      logFile: join(options.stateDir, "server-perf.log"),
    })
    cleanups.push(() => server.stop())

    const liveClient = await createHttpClient(server.url, join(options.stateDir, "server-perf.log"))
    const profile = resolveProfileDir(null, "chat-perf")
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
    await cdp.send("Network.enable")
    await cdp.send("Performance.enable")
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1600,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: buildPageSignalsSource() })

    const page = new ParityPage(cdp, [], [])

    // 1. Streaming baseline (perf/stream-300cps)
    log("Measuring streaming baseline on perf/stream-300cps...")
    await page.navigate(`${server.url}/?session=${encodeURIComponent(streamSessionId)}`)
    await page.waitFor("document.body.innerText.includes('Turn 1/1') && Boolean(document.querySelector('[data-scrollbar=\"chat\"]'))", 30_000, "stream session shell")
    await page.settle()
    await wait(800)
    const initialStreamChars = await page.evaluate(`(() => [...document.querySelectorAll('[data-message-id]')].reduce((n, el) => n + el.innerText.length, 0))()`)

    await page.evaluate(STREAM_SAMPLER_SOURCE)
    const streamRun = await collectTrace(cdp, async () => {
      await page.evaluate("globalThis.__chatPerfStream.start()")
      const focused = await page.evaluate(`(() => {
        const el = document.querySelector('[contenteditable="true"]') || document.querySelector('textarea');
        if (!el) return false;
        el.focus();
        return true;
      })()`)
      if (!focused) throw new Error("Could not find chat composer input")
      await cdp.send("Input.insertText", {
        text: "Explain bytecode VM function calls with code examples and a table.",
      })
      await wait(120)
      const clickedSend = await page.evaluate(`(() => {
        const btn = document.querySelector('button[aria-label="Send message"]');
        if (btn && !btn.disabled) { btn.click(); return true; }
        return false;
      })()`)
      if (!clickedSend) {
        await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 })
        await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 })
      }

      // Wait until streaming starts (at least one new message/turn appears) and then returns to idle
      const deadline = Date.now() + 120_000
      let sawWorking = false
      let sawNewTurn = false
      let lastSnap = null
      while (Date.now() < deadline) {
        const snap = await liveClient.json(`/api/agent/v1/sessions/${encodeURIComponent(streamSessionId)}/snapshot`)
        lastSnap = snap
        const status = snap.session?.runtimeStatus
        if (status === "running" || status === "busy" || status === "starting") sawWorking = true
        if ((snap.messages?.length ?? 0) >= 4 || (snap.turns?.length ?? 0) >= 2) sawNewTurn = true
        if (sawNewTurn && (sawWorking || (snap.turns?.length ?? 0) >= 2) && status === "idle") {
          break
        }
        await wait(250)
      }
      await wait(1500)
      const rafAndMut = await page.evaluate("globalThis.__chatPerfStream.stop()")
      const renderedChars = await page.evaluate(`(() => {
        const els = [...document.querySelectorAll('[data-message-id]')];
        return els.reduce((n, el) => n + el.innerText.length, 0);
      })()`)
      const newChars = Math.max(0, renderedChars - initialStreamChars)
      if (newChars < 1000) {
        const bodyTail = await page.evaluate("document.body.innerText.slice(-400)")
        throw new Error(`Expected live streamed response in DOM (>= 1000 new chars), saw ${newChars} (before=${initialStreamChars}, after=${renderedChars}), lastTurn=${JSON.stringify(lastSnap?.turns?.at(-1))}, bodyTail=${JSON.stringify(bodyTail)}`)
      }
      return { rafAndMut, renderedChars: newChars }
    })

    const streamRaf = summarizeRafGaps(streamRun.payload.rafAndMut.frameTimes)
    const streamSummary = {
      model: "perf/stream-300cps",
      elapsedSeconds: streamRun.elapsedSeconds,
      renderedCharacters: streamRun.payload.renderedChars,
      vizFrames: streamRun.vizFrames,
      vizFps: streamRun.vizFps,
      raf: streamRaf,
      mutationEvents: streamRun.payload.rafAndMut.mutCount,
      domMutationFlushes: streamRun.payload.rafAndMut.mutFlushes,
      flushesPerSecond: streamRun.elapsedSeconds > 0 ? round(streamRun.payload.rafAndMut.mutFlushes / streamRun.elapsedSeconds, 1) : null,
      longTasks: streamRun.longTasks,
      frameBudget: streamRun.frameBudget,
      pageSignals: streamRun.pageSignals,
      metrics: streamRun.metrics,
      topTraceEvents: streamRun.topTraceEvents,
    }
    log(`Streaming done: ${streamSummary.elapsedSeconds}s, ${streamSummary.renderedCharacters} chars, vizFps=${streamSummary.vizFps}, longTasks=${streamSummary.longTasks.longTaskCount}, longest=${streamSummary.longTasks.longestTaskMs}ms, busy=${streamSummary.metrics.busyPercent}%`)

    // 2. Scroll baseline on the 45-turn long transcript
    log(`Measuring scroll baseline on ${options.turns}-turn transcript...`)
    await page.navigate(`${server.url}/?session=${encodeURIComponent(longSessionId)}`)
    await page.waitFor(`document.body.innerText.includes('Turn ${options.turns}/${options.turns}')`, 45_000, "long transcript loaded")
    await page.settle()
    await wait(800)

    const initialDomSnapshot = await page.evaluate(`(() => ({
      domNodes: document.querySelectorAll('*').length,
      mountedMessages: document.querySelectorAll('[data-message-id]').length,
      scrollHeight: document.querySelector('[data-scrollbar="chat"]')?.scrollHeight ?? 0,
      clientHeight: document.querySelector('[data-scrollbar="chat"]')?.clientHeight ?? 0,
    }))()`)

    const scrollRun = await collectTrace(cdp, async () => {
      return page.evaluate(`(async () => {
      const scroller = document.querySelector('[data-scrollbar="chat"]');
      if (!scroller) throw new Error('Missing chat scroller');
      const frameTimes = [];
      let last = performance.now();
      let active = true;
      let domNodesPeak = document.querySelectorAll('*').length;
      let mountedMessagesPeak = document.querySelectorAll('[data-message-id]').length;
      let sampleTick = 0;

      const measureStep = () => {
        sampleTick += 1;
        if (sampleTick % 5 === 0) {
          const nodes = document.querySelectorAll('*').length;
          const msgs = document.querySelectorAll('[data-message-id]').length;
          if (nodes > domNodesPeak) domNodesPeak = nodes;
          if (msgs > mountedMessagesPeak) mountedMessagesPeak = msgs;
        }
      };

      const sweep = (from, to, steps) => new Promise((resolveSweep) => {
        let step = 0;
        const next = (now) => {
          if (!active) return resolveSweep();
          frameTimes.push(now - last);
          last = now;
          step += 1;
          const progress = Math.min(1, step / steps);
          scroller.scrollTop = Math.round(from + (to - from) * progress);
          measureStep();
          if (step < steps) {
            requestAnimationFrame(next);
          } else {
            resolveSweep();
          }
        };
        requestAnimationFrame(next);
      });

      const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      scroller.scrollTop = maxScroll;
      await new Promise((r) => setTimeout(r, 200));
      last = performance.now();
      await sweep(maxScroll, 0, 120);
      await new Promise((r) => setTimeout(r, 250));
      last = performance.now();
      await sweep(0, scroller.scrollHeight - scroller.clientHeight, 120);
      await new Promise((r) => setTimeout(r, 250));
      active = false;

      return {
        frameTimes,
        domNodesPeak,
        mountedMessagesPeak,
        domNodesAfter: document.querySelectorAll('*').length,
        mountedMessagesAfter: document.querySelectorAll('[data-message-id]').length,
      };
    })()`)
    })

    const scrollRaf = summarizeRafGaps(scrollRun.payload.frameTimes)
    const scrollSummary = {
      turns: options.turns,
      scrollHeight: initialDomSnapshot.scrollHeight,
      clientHeight: initialDomSnapshot.clientHeight,
      elapsedSeconds: scrollRun.elapsedSeconds,
      vizFrames: scrollRun.vizFrames,
      vizFps: scrollRun.vizFps,
      raf: scrollRaf,
      domNodesBefore: initialDomSnapshot.domNodes,
      domNodesPeak: scrollRun.payload.domNodesPeak,
      domNodesAfter: scrollRun.payload.domNodesAfter,
      mountedMessagesBefore: initialDomSnapshot.mountedMessages,
      mountedMessagesPeak: scrollRun.payload.mountedMessagesPeak,
      mountedMessagesAfter: scrollRun.payload.mountedMessagesAfter,
      longTasks: scrollRun.longTasks,
      frameBudget: scrollRun.frameBudget,
      pageSignals: scrollRun.pageSignals,
      metrics: scrollRun.metrics,
      topTraceEvents: scrollRun.topTraceEvents,
    }
    log(`Scroll done: ${scrollSummary.elapsedSeconds}s, rAF fps=${scrollSummary.raf.effectiveFps}, worstFrame=${scrollSummary.raf.worstFrameMs}ms, dropped>16ms=${scrollSummary.raf.droppedFramesOver16ms}, domPeak=${scrollSummary.domNodesPeak}, mountedMsgsPeak=${scrollSummary.mountedMessagesPeak}`)

    mkdirSync(options.out, { recursive: true })
    const summary = {
      capturedAt: new Date().toISOString(),
      dist: options.dist,
      viewport: { width: 1600, height: 1000 },
      streaming: streamSummary,
      scroll: scrollSummary,
    }
    writeFileSync(join(options.out, "summary.json"), JSON.stringify(summary, null, 2))

    const md = [
      "# Chat Transcript Performance Baseline",
      "",
      `- Captured: ${summary.capturedAt}`,
      `- Viewport: 1600x1000 (headless Chromium CDP)`,
      "",
      "## Streaming (`perf/stream-300cps`)",
      "",
      `| Metric | Value |`,
      `|---|---|`,
      `| Elapsed | ${streamSummary.elapsedSeconds} s |`,
      `| Rendered chars | ${streamSummary.renderedCharacters} |`,
      `| Compositor FPS (viz) | ${streamSummary.vizFps} (${streamSummary.vizFrames} frames) |`,
      `| rAF effective FPS | ${streamSummary.raf.effectiveFps} (p95 ${streamSummary.raf.p95FrameMs} ms, worst ${streamSummary.raf.worstFrameMs} ms) |`,
      `| Dropped rAF frames (>16.7ms / >33ms) | ${streamSummary.raf.droppedFramesOver16ms} / ${streamSummary.raf.droppedFramesOver33ms} |`,
      `| DOM mutation flushes | ${streamSummary.domMutationFlushes} (${streamSummary.flushesPerSecond}/s) |`,
      `| Long tasks (>=50ms) | ${streamSummary.longTasks.longTaskCount} (total ${streamSummary.longTasks.longTaskTotalMs} ms, longest ${streamSummary.longTasks.longestTaskMs} ms) |`,
      `| Main-thread tasks >8ms / >16ms | ${streamSummary.frameBudget.tasksOver8msCount} / ${streamSummary.frameBudget.tasksOver16msCount} |`,
      `| Main-thread busy time | ${streamSummary.metrics.taskTotalMs} ms (${streamSummary.metrics.busyPercent}%) |`,
      `| Layouts / Style recalcs | ${streamSummary.metrics.layoutCount} (${streamSummary.metrics.layoutTotalMs} ms) / ${streamSummary.metrics.recalcStyleCount} (${streamSummary.metrics.recalcTotalMs} ms) |`,
      `| JS Heap / DOM nodes end | ${streamSummary.metrics.jsHeapUsedMb} MB / ${streamSummary.metrics.domNodes} |`,
      "",
      `## Long-Transcript Scroll (${options.turns} turns, bottom -> top -> bottom)`,
      "",
      `| Metric | Value |`,
      `|---|---|`,
      `| Scroll height / viewport | ${scrollSummary.scrollHeight} px / ${scrollSummary.clientHeight} px |`,
      `| Elapsed | ${scrollSummary.elapsedSeconds} s |`,
      `| Compositor FPS (viz) | ${scrollSummary.vizFps} (${scrollSummary.vizFrames} frames) |`,
      `| rAF effective FPS | ${scrollSummary.raf.effectiveFps} (p50 ${scrollSummary.raf.p50FrameMs} ms, p95 ${scrollSummary.raf.p95FrameMs} ms, worst ${scrollSummary.raf.worstFrameMs} ms) |`,
      `| Dropped rAF frames (>16.7ms / >33ms) | ${scrollSummary.raf.droppedFramesOver16ms} / ${scrollSummary.raf.droppedFramesOver33ms} |`,
      `| Long tasks (>=50ms) | ${scrollSummary.longTasks.longTaskCount} (total ${scrollSummary.longTasks.longTaskTotalMs} ms, longest ${scrollSummary.longTasks.longestTaskMs} ms) |`,
      `| Main-thread tasks >8ms / >16ms | ${scrollSummary.frameBudget.tasksOver8msCount} / ${scrollSummary.frameBudget.tasksOver16msCount} |`,
      `| Main-thread busy time | ${scrollSummary.metrics.taskTotalMs} ms (${scrollSummary.metrics.busyPercent}%) |`,
      `| Layouts / Style recalcs | ${scrollSummary.metrics.layoutCount} (${scrollSummary.metrics.layoutTotalMs} ms) / ${scrollSummary.metrics.recalcStyleCount} (${scrollSummary.metrics.recalcTotalMs} ms) |`,
      `| CLS (layout shift) | ${scrollSummary.pageSignals.layoutShift} |`,
      `| DOM nodes (before / peak / after) | ${scrollSummary.domNodesBefore} / ${scrollSummary.domNodesPeak} / ${scrollSummary.domNodesAfter} |`,
      `| Mounted \`[data-message-id]\` (before / peak / after) | ${scrollSummary.mountedMessagesBefore} / ${scrollSummary.mountedMessagesPeak} / ${scrollSummary.mountedMessagesAfter} |`,
      "",
    ].join("\n")
    writeFileSync(join(options.out, "SUMMARY.md"), md)
    log(`Wrote ${join(options.out, "summary.json")} and SUMMARY.md`)
  } finally {
    await cleanupAll()
    if (!options.keepState) {
      rmSync(options.stateDir, { recursive: true, force: true })
      rmSync(options.projectDir, { recursive: true, force: true })
    }
  }
}

main().catch((error) => {
  console.error(`[chat-perf] ERROR: ${error instanceof Error ? error.stack || error.message : String(error)}`)
  process.exit(1)
})
