// Minimal type declarations for bun:test to satisfy tsc.
// Only the subset used by our test files is declared.

declare module "bun:test" {
  export type TestBody = (...args: never[]) => void | Promise<void>;
  export interface EachCase {
    (name: string, fn: TestBody, timeoutMs?: number): void;
    /** A row spreads into the callback's parameters, as the runtime does. */
    each<T extends Readonly<[unknown, ...unknown[]]>>(cases: readonly T[]): (name: string, fn: (...row: T) => void | Promise<void>, timeoutMs?: number) => void;
    /** A flat row (`test.each(values)` of scalars) reaches the callback as one argument. */
    each<T>(cases: readonly T[]): (name: string, fn: (row: T) => void | Promise<void>, timeoutMs?: number) => void;
  }
  export const describe: EachCase;
  export const test: EachCase;
  export interface ExpectResult {
    toEqual(expected: unknown): void;
    toStrictEqual(expected: unknown): void;
    toBe(expected: unknown): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeNull(): void;
    toBeDefined(): void;
    toBeUndefined(): void;
    toBeNaN(): void;
    toThrow(expected?: string | RegExp | (new (...args: never[]) => unknown)): void;
    toContain(expected: unknown): void;
    toContainEqual(expected: unknown): void;
    toMatch(expected: string | RegExp): void;
    toMatchObject(expected: unknown): void;
    toHaveLength(expected: number): void;
    toHaveProperty(path: string): void;
    toBeInstanceOf(expected: unknown): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toBeCloseTo(expected: number, precision?: number): void;
    toHaveBeenCalled(): void;
    toHaveBeenCalledTimes(count: number): void;
    toHaveBeenCalledWith(...args: unknown[]): void;
    toHaveBeenLastCalledWith(...args: unknown[]): void;
    toHaveReturned(): void;
    toHaveReturnedWith(value: unknown): void;
    resolves: {
      toEqual(expected: unknown): Promise<void>;
      toStrictEqual(expected: unknown): Promise<void>;
      toBe(expected: unknown): Promise<void>;
      toBeNull(): Promise<void>;
      toBeUndefined(): Promise<void>;
      toBeTruthy(): Promise<void>;
      toBeDefined(): Promise<void>;
      toContain(expected: unknown): Promise<void>;
      toMatchObject(expected: unknown): Promise<void>;
      toHaveLength(expected: number): Promise<void>;
      toThrow(expected?: string | RegExp | (new (...args: never[]) => unknown)): Promise<void>;
      toBeInstanceOf(expected: new (...args: never[]) => object): Promise<void>;
      toBeGreaterThan(expected: number): Promise<void>;
    };
    rejects: {
      toThrow(expected?: string | RegExp | (new (...args: never[]) => unknown)): Promise<void>;
      toEqual(expected: unknown): Promise<void>;
      toMatchObject(expected: unknown): Promise<void>;
      toBeInstanceOf(expected: new (...args: never[]) => object): Promise<void>;
    };
    not: Omit<ExpectResult, 'not' | 'resolves' | 'rejects'>;
  }
  export interface AsymmetricMatcher {
    readonly __asymmetric: true;
  }
  export function expect(value: unknown): ExpectResult;
  export namespace expect {
    function objectContaining(expected: Record<string, unknown>): AsymmetricMatcher;
    function arrayContaining(expected: readonly unknown[]): AsymmetricMatcher;
    function stringContaining(expected: string): AsymmetricMatcher;
    function stringMatching(expected: string | RegExp): AsymmetricMatcher;
    function any(constructor: unknown): AsymmetricMatcher;
    function anything(): AsymmetricMatcher;
    function closeTo(expected: number, precision?: number): AsymmetricMatcher;
  }
  export function beforeAll(fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
  export function afterAll(fn: () => void | Promise<void>): void;
  export function setDefaultTimeout(timeoutMs: number): void;
  // Mock<T> matches the bun:test runtime mock: T (callable) plus spy methods.
  export interface Mock<T extends (...args: never[]) => unknown = (...args: never[]) => unknown> {
    (...args: Parameters<T>): ReturnType<T>;
    mock: { calls: Parameters<T>[]; results: { type: string; value: unknown }[] };
    mockImplementation(fn: T): Mock<T>;
    mockImplementationOnce(fn: T): Mock<T>;
    mockReturnValue(value: ReturnType<T>): Mock<T>;
    mockReturnValueOnce(value: ReturnType<T>): Mock<T>;
    mockResolvedValue(value: Awaited<ReturnType<T>>): Mock<T>;
    mockResolvedValueOnce(value: Awaited<ReturnType<T>>): Mock<T>;
    mockRejectedValue(value: unknown): Mock<T>;
    mockRejectedValueOnce(value: unknown): Mock<T>;
    mockClear(): Mock<T>;
    mockReset(): Mock<T>;
    mockRestore(): void;
  }
  export type Spy<T extends (...args: never[]) => unknown> = Mock<T>;
  export function spyOn<T, K extends keyof T>(target: T, method: K): Mock<Extract<T[K], (...args: never[]) => unknown>>;
  export function mock<T extends (...args: never[]) => unknown>(fn?: T): Mock<T>;
  export namespace mock {
    function module(moduleName: string, factory: () => Record<string, unknown>): void;
    function restore(): void;
  }
  export namespace jest {
    function useFakeTimers(): void;
    function useRealTimers(): void;
    function advanceTimersByTime(ms: number): void;
    function setSystemTime(now: number | Date): void;
    function spyOn<T, K extends keyof T>(target: T, method: K): Mock<Extract<T[K], (...args: never[]) => unknown>>;
  }
}

// Vite asset-query imports need a URL loader when real UI modules run in Bun.
declare module "bun" {
  export function gc(force?: boolean): void;
  export function plugin(options: {
    name: string;
    setup(build: {
      onResolve(options: { filter: RegExp; namespace?: string }, callback: (args: { path: string }) => {
        path: string;
        namespace?: string;
      }): void;
      onLoad(options: { filter: RegExp; namespace?: string }, callback: (args: { path: string }) => {
        contents: string;
        loader: "js" | "ts";
      }): void;
    }): void;
  }): void;
}
