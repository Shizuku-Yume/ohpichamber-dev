// Whether the user can currently see this UI surface. Session "viewed" state
// (unread markers, toasts) depends on it.
//
export function isSurfaceAttended(): boolean {
  return document.hasFocus?.() ?? false
}

