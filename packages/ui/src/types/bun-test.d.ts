// Minimal type declarations for bun:test to satisfy tsc.
// Only the subset used by our test files is declared.

declare module "bun:test" {
  /** `describe`/`test` with the parameterized variants the runtime provides. */
  interface Parameterized {
    (name: string, fn: () => void | Promise<void>, timeoutMs?: number): void;
    each<T>(table: readonly T[]): (name: string, fn: (row: T) => void | Promise<void>, timeoutMs?: number) => void;
    skip(name: string, fn?: () => void | Promise<void>): void;
    only(name: string, fn: () => void | Promise<void>): void;
    todo(name: string): void;
    if(condition: boolean): (name: string, fn: () => void | Promise<void>, timeoutMs?: number) => void;
  }
  export const describe: Parameterized;
  export const test: Parameterized;
  export interface ExpectResult {
    toEqual(expected: unknown): void;
    toBe(expected: unknown): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeNull(): void;
    toThrow(expected?: string | RegExp | (new (...args: never[]) => unknown)): void;
    toContain(expected: unknown): void;
    toBeDefined(): void;
    toBeUndefined(): void;
    toMatchObject(expected: unknown): void;
    resolves: { toEqual(expected: unknown): Promise<void>; toMatchObject(expected: unknown): Promise<void> };
    rejects: {
      toThrow(expected?: string | RegExp | (new (...args: never[]) => unknown)): Promise<void>;
      toBeInstanceOf(expected: new (...args: never[]) => object): Promise<void>;
      toMatchObject(expected: unknown): Promise<void>;
    };
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toBeCloseTo(expected: number, numDigits?: number): void;
    toHaveLength(expected: number): void;
    toHaveBeenCalled(): void;
    toHaveBeenCalledTimes(expected: number): void;
    toBeInstanceOf(expected: unknown): void;
    toHaveProperty(path: string): void;
    toHaveBeenCalledWith(...expected: unknown[]): void;
    toHaveBeenLastCalledWith(...expected: unknown[]): void;
    toMatch(expected: string | RegExp): void;
    toContainEqual(expected: unknown): void;
    toThrowError(expected?: string | RegExp): void;
    not: {
      toHaveBeenCalled(): void;
      toEqual(expected: unknown): void;
      toBe(expected: unknown): void;
      toContain(expected: unknown): void;
      toBeNull(): void;
      toHaveProperty(path: string): void;
      toHaveBeenCalled(): void;
      toHaveBeenCalledWith(...expected: unknown[]): void;
      toMatch(expected: string | RegExp): void;
      toThrow(expected?: string | RegExp): void;
      toBeGreaterThan(expected: number): void;
      toBeLessThan(expected: number): void;
    };
    toMatchObject(expected: unknown): void;
    toSatisfy(predicate: (value: unknown) => boolean): void;
  }
  // Asymmetric matchers the runtime provides on `expect`.
  namespace expect {
    function any(constructor: unknown): unknown;
    function anything(): unknown;
    function stringContaining(value: string): unknown;
    function objectContaining(value: Record<string, unknown>): unknown;
    function arrayContaining(values: readonly unknown[]): unknown;
  }
  export function expect(value: unknown): ExpectResult;
  export function beforeAll(fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
  export function afterAll(fn: () => void | Promise<void>): void;
  export function setDefaultTimeout(timeoutMs: number): void;
  export function testIf(condition: boolean): typeof test;
  export function testSkip(name: string, fn?: () => void | Promise<void>): void;
  export function testTodo(name: string): void;
  // Mock<T> matches the bun:test runtime mock: T (callable) plus spy methods.
  // Tests that need to swap implementations at runtime cast through `Mock<T>`.
  export interface Mock<T extends (...args: never[]) => unknown> {
    (...args: Parameters<T>): ReturnType<T>;
    mockImplementation(fn: T): Mock<T>;
    mockReturnValue(value: ReturnType<T>): Mock<T>;
    mockReset(): Mock<T>;
  }
  export interface Spy<T extends (...args: never[]) => void> extends Mock<T> {
    mock: { calls: Parameters<T>[] };
    mockImplementation(fn: T): Spy<T>;
    mockImplementationOnce(fn: T): Spy<T>;
    mockResolvedValue(value: Awaited<ReturnType<T>>): Spy<T>;
    mockResolvedValueOnce(value: Awaited<ReturnType<T>>): Spy<T>;
    mockRejectedValue(value: Error): Spy<T>;
    mockRejectedValueOnce(value: Error): Spy<T>;
    mockRestore(): void;
  }
  export function spyOn<T, K extends keyof T>(target: T, method: K): Spy<Extract<T[K], (...args: never[]) => void>>;
  export function mock<T extends (...args: never[]) => unknown>(fn?: T): Mock<T>;
  export namespace mock {
    function module(moduleName: string, factory: () => Record<string, unknown>): void;
    function restore(): void;
  }
  export namespace jest {
    function useFakeTimers(): void;
    function useRealTimers(): void;
    function advanceTimersByTime(ms: number): void;
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
