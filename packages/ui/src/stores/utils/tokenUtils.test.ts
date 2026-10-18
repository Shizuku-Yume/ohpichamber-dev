import { describe, expect, test } from "bun:test"
import type { Message, Part } from '@openchamber/agent-contract'
import {
  buildSessionContextUsage,
  computeCacheHitRate,
  extractTokensFromMessage,
  findLatestContextFill,
  isSameContextUsage,
  type ContextFillMessage,
} from "./tokenUtils"

const assistantMessage = (usage?: Message['usage']): { info: Message; parts: Part[] } => ({
  info: { messageId: 'message', sessionId: 'session', turnId: 'turn', role: 'assistant', createdAt: 0, parts: [], usage },
  parts: [],
})

describe("computeCacheHitRate", () => {
  test("returns zero and hasInput=false for null input", () => {
    const result = computeCacheHitRate(null)
    expect(result).toEqual({ percent: 0, hasInput: false })
  })

  test("returns zero and hasInput=false for undefined input", () => {
    const result = computeCacheHitRate(undefined)
    expect(result).toEqual({ percent: 0, hasInput: false })
  })

  test("returns zero and hasInput=false when input is zero", () => {
    const result = computeCacheHitRate({ input: 0, cache: { read: 0, write: 0 } })
    expect(result).toEqual({ percent: 0, hasInput: false })
  })

  test("returns zero and hasInput=false when input is negative", () => {
    const result = computeCacheHitRate({ input: -5, cache: { read: 0, write: 0 } })
    expect(result).toEqual({ percent: 0, hasInput: false })
  })

  test("returns zero percent when no cache read tokens", () => {
    const result = computeCacheHitRate({ input: 1000, cache: { read: 0, write: 200 } })
    expect(result).toEqual({ percent: 0, hasInput: true })
  })

  test("computes correct percentage: 31.25% with cache read + cache write", () => {
    // total = 1000 + 500 + 100 = 1600, hit = 500 / 1600 = 31.25%
    const result = computeCacheHitRate({ input: 1000, cache: { read: 500, write: 100 } })
    expect(Math.abs(result.percent - 31.25) < 1e-2).toBe(true)
    expect(result.hasInput).toBe(true)
  })

  test("computes correct percentage: 50% when cache read equals non-cached input (no cache write)", () => {
    // total = 1000 + 1000 + 0 = 2000, hit = 1000 / 2000 = 50%
    const result = computeCacheHitRate({ input: 1000, cache: { read: 1000, write: 0 } })
    expect(result.percent).toBe(50)
    expect(result.hasInput).toBe(true)
  })

  test("handles missing cache object", () => {
    const result = computeCacheHitRate({ input: 500 })
    expect(result).toEqual({ percent: 0, hasInput: true })
  })

  test("handles missing cache.read", () => {
    const result = computeCacheHitRate({ input: 500, cache: { write: 100 } })
    expect(result).toEqual({ percent: 0, hasInput: true })
  })

  test("computes below 100% when cache.read is larger than non-cached input", () => {
    // total = 200 + 100 = 300, hit = 200 / 300 = 66.7% — not clamped
    const result = computeCacheHitRate({ input: 100, cache: { read: 200, write: 0 } })
    expect(Math.abs(result.percent - 66.67) < 1e-2).toBe(true)
    expect(result.hasInput).toBe(true)
  })

  test("clamps to 0% when cache.read is negative (defensive against bad data)", () => {
    const result = computeCacheHitRate({ input: 100, cache: { read: -50, write: 0 } })
    expect(result.percent).toBe(0)
    expect(result.hasInput).toBe(true)
  })

  test("handles real-world Anthropic example: 850 cached + 100 write + 1000 non-cached", () => {
    // total = 1000 + 850 + 100 = 1950, hit = 850 / 1950 ≈ 43.6%
    const result = computeCacheHitRate({ input: 1000, cache: { read: 850, write: 100 } })
    expect(Math.abs(result.percent - 43.59) < 1e-1).toBe(true)
    expect(result.hasInput).toBe(true)
  })

  test("handles real-world Anthropic example: zero cache on first turn", () => {
    // First turn always has 0 cache — should show 0% with hasInput=true
    const result = computeCacheHitRate({ input: 2000, cache: { read: 0, write: 2000 } })
    expect(result.percent).toBe(0)
    expect(result.hasInput).toBe(true)
  })
})


describe('extractTokensFromMessage', () => {
  test('uses canonical measured usage without re-summing accumulated cache counters', () => {
    const message = assistantMessage({
      totalTokens: 232_872, input: 0, output: 14_523, cacheRead: 3_291_956, cacheWrite: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    })
    expect(extractTokensFromMessage(message)).toBe(232_872)
  })

  test('returns zero when the message has not reported usage', () => {
    expect(extractTokensFromMessage(assistantMessage())).toBe(0)
  })

  test('does not derive token counts from tool output', () => {
    const message = assistantMessage()
    message.parts.push({ type: 'tool_result', partId: 'result', toolCallId: 'call', toolName: 'bash', isError: false, output: { totalTokens: 500 } })
    expect(extractTokensFromMessage(message)).toBe(0)
  })
})

const reply = (messageId: string, totalTokens: number): ContextFillMessage => ({
  messageId,
  role: 'assistant',
  usage: { input: totalTokens, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
})

describe("findLatestContextFill", () => {
  test("reads the newest response that reported tokens", () => {
    const messages: ContextFillMessage[] = [reply("old", 10), { messageId: "u", role: "user" }, reply("new", 20)]
    expect(findLatestContextFill(messages)).toEqual({ state: "measured", index: 2, totalTokens: 20 })
  })

  test("returns the latest measured response when later messages have no usage", () => {
    const messages: ContextFillMessage[] = [reply("before", 260_273), { messageId: "u", role: "user" }]
    expect(findLatestContextFill(messages)).toEqual({ state: "measured", index: 0, totalTokens: 260_273 })
  })

  test("returns null when nothing reported tokens", () => {
    expect(findLatestContextFill([])).toBeNull()
    expect(findLatestContextFill([{ messageId: "u", role: "user" }])).toBeNull()
  })
})

describe("findLatestContextFill", () => {
  test("reads the newest response that reported tokens", () => {
    const messages = [reply("old", 10), { messageId: "u", role: "user" as const }, reply("new", 20)]
    expect(findLatestContextFill(messages)).toEqual({ state: "measured", index: 2, totalTokens: 20 })
  })


  test("returns null when nothing reported tokens", () => {
    expect(findLatestContextFill([])).toBeNull()
    expect(findLatestContextFill([{ messageId: "u", role: "user" }])).toBeNull()
  })
})

describe("buildSessionContextUsage", () => {
  test("measures the latest response against the limits", () => {
    expect(buildSessionContextUsage([reply("r", 50_000)], 200_000, 32_000)).toEqual({
      state: "measured",
      totalTokens: 50_000,
      percentage: 25,
      contextLimit: 200_000,
      outputLimit: 32_000,
      normalizedOutput: 0,
      thresholdLimit: 200_000,
      lastMessageId: "r",
    })
  })

})

