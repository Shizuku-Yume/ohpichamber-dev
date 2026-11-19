
import { create } from "zustand"
import { clearDesktopSessionNotifications } from "@/lib/desktop"
import { runtimeFetch } from "@/lib/runtime-fetch"
import { isSessionUnread, markSessionUnreadSeen } from "./session-unread"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"

export type ErrorNotification = {
  directory?: string
  session?: string
  time: number
  error?: { name: string | null; message: string | null; responseBody?: string | null }
}

const MAX_NOTIFICATIONS = 500
const NOTIFICATION_TTL_MS = 1000 * 60 * 60 * 24 * 30

function pruneNotifications(list: ErrorNotification[]): ErrorNotification[] {
  const cutoff = Date.now() - NOTIFICATION_TTL_MS
  const pruned = list.filter((n) => n.time >= cutoff)
  if (pruned.length <= MAX_NOTIFICATIONS) return pruned
  return pruned.slice(pruned.length - MAX_NOTIFICATIONS)
}

interface NotificationStore {
  list: ErrorNotification[]
  append: (notification: ErrorNotification) => void
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  list: [],
  append: (notification) => {
    set({ list: pruneNotifications([...get().list, notification]) })
  },
}))

export function appendErrorNotification(notification: ErrorNotification) {
  useNotificationStore.getState().append(notification)
}

function closeWebPushSessionNotifications(sessionId: string) {
  void navigator.serviceWorker?.getRegistration()
    .then((registration) => registration?.getNotifications())
    .then((shown) => {
      for (const notification of shown ?? []) {
        if (notification.data?.sessionId === sessionId) notification.close()
      }
    })
    .catch(() => { /* a browser without push notifications has nothing to close */ })
}

function clearSessionNotifications(sessionId: string) {
  clearDesktopSessionNotifications(sessionId)
  closeWebPushSessionNotifications(sessionId)
  runtimeFetch(`/api/sessions/${encodeURIComponent(sessionId)}/view`, { method: "POST" })
    .catch(() => { /* the phones drop them with the next push */ })
}

export function markSessionViewed(sessionId: string) {
  markSessionUnreadSeen(sessionId)
  clearSessionNotifications(sessionId)
}

export function markSessionRead(sessionId: string) {
  markSessionUnreadSeen(sessionId, { explicit: true })
  clearSessionNotifications(sessionId)
}

export function markAllSessionsViewed() {
<<<<<<< HEAD
  const { activeSessions, archivedSessions } = useGlobalSessionsStore.getState()
  const marked: string[] = []
  for (const session of [...activeSessions, ...archivedSessions]) {
    if (!isSessionUnread(session)) continue
    markSessionUnreadSeen(session.sessionId)
    marked.push(session.sessionId)
  }
  if (marked.length === 0) return
  for (const sessionId of marked) clearDesktopSessionNotifications(sessionId)
  // The route only resets the push badge, so one call covers them all.
  runtimeFetch(`/api/sessions/${encodeURIComponent(marked[0])}/view`, { method: "POST" })
    .catch(() => { /* the badge resets on the next engagement signal */ })
||||||| bc50ba56aa
  const marked = markSessionsUnreadSeen(getUnreadSessionIds())
  if (marked.length === 0) return
  for (const sessionId of marked) clearDesktopSessionNotifications(sessionId)
  // The route only resets the push badge, so one call covers them all.
  runtimeFetch(`/api/sessions/${encodeURIComponent(marked[0])}/view`, { method: "POST" })
    .catch(() => { /* the badge resets on the next engagement signal */ })
=======
  for (const sessionId of markSessionsUnreadSeen(getUnreadSessionIds(), { explicit: true })) clearSessionNotifications(sessionId)
>>>>>>> upstream/main
}

export function useLatestSessionError(sessionId: string): ErrorNotification | null {
  return useNotificationStore((s) => {
    if (!sessionId) return null
    for (let index = s.list.length - 1; index >= 0; index -= 1) {
      const notification = s.list[index]
      if (notification.session === sessionId) return notification
    }
    return null
  })
}
