import type { HostNotification } from "@/lib/openchamberEvents"
import { toast } from "@/components/ui"
import { getRuntimeKey } from "@/lib/runtime-switch"
import { getRegisteredRuntimeAPIs } from "@/contexts/runtimeAPIRegistry"

const trimmedOrUndefined = (value: string | undefined): string | undefined => value?.trim() || undefined

const isUiFocused = (): boolean => (
  typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus()
)


export const handleUiNotificationEvent = (notification: HostNotification): void => {
  const kind = trimmedOrUndefined(notification.kind)
  const sessionId = trimmedOrUndefined(notification.sessionId)
  const directory = trimmedOrUndefined(notification.directory)
  const title = trimmedOrUndefined(notification.title)
  const body = trimmedOrUndefined(notification.body)
  const tag = trimmedOrUndefined(notification.tag)

  if ((!title && !body) || (kind === "share-answer" && notification.toastOnly === true)) return

  if (kind === "plugin" && title && notification.showWhenFocused === true && isUiFocused()) {
    toast.info(title, { id: tag ?? [kind, title, body].filter(Boolean).join("|"), description: body })
  }

  if (
    (notification.desktopNotificationDelivered === true || notification.desktopStdoutActive === true)
    && getRuntimeKey() === "local"
  ) return

  const notifications = getRegisteredRuntimeAPIs()?.notifications
  if (!notifications?.notifyAgentCompletion) return

  void notifications.notifyAgentCompletion({
    title,
    body,
    tag,
    kind,
    sessionId,
    directory: directory || undefined,
    runtimeKey: getRuntimeKey(),
    requireHidden: kind === "plugin" ? true : notification.requireHidden === true,
  }).catch((error) => {
    console.warn("[notifications] failed to dispatch UI notification", error)
  })
}
