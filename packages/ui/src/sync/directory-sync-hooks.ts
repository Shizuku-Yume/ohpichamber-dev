import React, { useEffect } from "react"
import type { StoreApi } from "zustand"
import { useStore } from "zustand"
import { type DirectoryBootstrapReason, type DirectoryBootstrapPriority, type DirectoryStore } from "./child-store"
import type { State } from "./types"
import { useSyncRuntime } from "./sync-runtime-context"

export function useDirectoryStore(
  directory?: string,
  options?: {
    bootstrap?: boolean
    priority?: DirectoryBootstrapPriority
    reason?: DirectoryBootstrapReason
  },
): StoreApi<DirectoryStore> {
  const runtime = useSyncRuntime()
  const dir = React.useSyncExternalStore(
    runtime.currentDirectory.subscribe,
    () => directory ?? runtime.currentDirectory.get(),
  )
  const store = runtime.childStores.ensureChild(dir, options)

  useEffect(() => {
    runtime.childStores.pin(dir)
    return () => runtime.childStores.unpin(dir)
  }, [dir, runtime.childStores])

  return store
}


export function useDirectorySync<T>(selector: (state: State) => T, directory?: string): T {
  const store = useDirectoryStore(directory)
  return useStore(store, selector)
}

