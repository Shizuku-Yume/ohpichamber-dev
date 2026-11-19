/**
 * Wire envelope `v` for Guest postMessage and host pushes.
 *
 * `1` was the pre-M3 direct parent-window transport. The private MessagePort
 * bootstrap is a breaking transport change, so the envelope and bootstrap
 * handshake are `2`; a `v1` guest is refused explicitly.
 */
export const OPENCHAMBER_SDK_CHANNEL = 'openchamber.sdk';
export const OPENCHAMBER_SDK_API_VERSION = 2;
/**
 * Manifest `apiVersion` values this host accepts. This is the
 * manifest/`contributes` schema version, not the transport: the schema is
 * unchanged, so it stays `1` while the wire envelope moves to `2`. Service and
 * sockets ship on manifest `1`.
 */
export const OPENCHAMBER_SDK_MANIFEST_API_VERSIONS = [1] as const;
export type OpenChamberManifestApiVersion = (typeof OPENCHAMBER_SDK_MANIFEST_API_VERSIONS)[number];
