import type { DisposeCheck, EvictPlan, State } from "./types"

export function hasPendingBlockingRequests(state: State | undefined): boolean {
  if (!state) return false
  for (const requests of Object.values(state.form ?? {})) {
    if ((requests?.length ?? 0) > 0) return true
  }
  for (const requests of Object.values(state.permission ?? {})) {
    if ((requests?.length ?? 0) > 0) return true
  }
  return false
}

export function pickDirectoriesToEvict(input: EvictPlan): string[] {
  const overflow = Math.max(0, input.stores.length - input.max)
  let pendingOverflow = overflow
  const graceMs = input.graceMs ?? 0
  const sorted = input.stores
    .filter((directory) => !input.pins.has(directory))
    .filter((directory) => !input.hasPendingBlockingRequests?.(directory))
    .slice()
    .sort((left, right) => (input.state.get(left)?.lastAccessAt ?? 0) - (input.state.get(right)?.lastAccessAt ?? 0))
  const output: string[] = []
  for (const directory of sorted) {
    const lastAccessAt = input.state.get(directory)?.lastAccessAt ?? 0
    const age = input.now - lastAccessAt
    const idle = age >= input.ttl
    if (!idle && pendingOverflow <= 0) continue
    if (!idle && age < graceMs) continue
    output.push(directory)
    if (pendingOverflow > 0) pendingOverflow -= 1
  }
  return output
}

export function canDisposeDirectory(input: DisposeCheck): boolean {
  if (!input.directory || !input.hasStore) return false
  if (input.pinned || input.booting || input.loadingSessions || input.hasPendingBlockingRequests) return false
  return true
}
