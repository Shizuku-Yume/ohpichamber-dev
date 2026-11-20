
type SessionOpener = (sessionID: string, directory: string) => void

let _sessionOpener: SessionOpener | null = null

export const setSessionOpener = (opener: SessionOpener | null) => {
  _sessionOpener = opener
}

let sessionOpener: SessionOpener | null = null

export const openSessionFromToast = (sessionID: string, directory: string) => {
  sessionOpener?.(sessionID, directory)
}
