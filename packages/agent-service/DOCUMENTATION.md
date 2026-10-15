# MCP backend integration

The Agent Service owns workspace MCP configuration and routes sessionless workspace MCP operations through stateless workers. Workspace configuration is persisted by the catalog coordinator; worker operations remain authorized against the workspace root session.

## Native session archives

`SessionRegistry.archiveManifest()` is the host-authorized, read-only inventory of native chats. `exportArchive()` emits a bounded uncompressed ustar bundle containing the selected transcript, descendants, tool artifacts, subagent outputs, and referenced blobs; it never parses transcripts in Node. `importArchive()` validates the complete manifest before staging and installs immutable deleted-space references. Imported roots and descendants remain cold until explicitly reopened, and deleted-space mutations return `SESSION_READ_ONLY` (HTTP 409). Archive transfers are bounded to 256 MiB and five minutes per operation; save/restore uses a thirty-minute host window.
