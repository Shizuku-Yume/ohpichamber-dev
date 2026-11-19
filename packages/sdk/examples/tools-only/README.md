# Tool Gallery

A page-less extension that makes structured tool results readable in the conversation. Two exact rules turn sample review findings and project checks into tables. The `mcp__*` fallback keeps other matching results in the JSON viewer.

## Try the complete example

1. Install this folder in Settings → Extensions. It adds no panel and asks for no extension capabilities.
2. Add the optional fixture server to the project's `.omp/mcp.json` file (create it if needed), replacing the absolute path below:

```json
{
  "mcpServers": {
    "example": {
      "command": "node",
      "args": ["/absolute/path/to/ohpichamber/packages/sdk/examples/tools-only/mcp.js"]
    }
  }
}
```

3. Start a new session in that project, then ask the agent: `Call the example findings tool with scope "Authentication", then the example checks tool with project "My project".`
4. Expand the results in chat. Disable Tool Gallery in Settings → Extensions to compare the normal rendering.

The manifest matches the tool names `mcp__example_findings` and `mcp__example_checks`. If your MCP configuration uses another server name, update those exact matches to the names OMP reports. The `mcp__*` fallback keeps other matching results in the JSON viewer.

## Make it yours

Replace the sample server with your own tool. Keep its data structured, choose the columns that answer the reader's question, and use the subtitle for a concise outcome. The extension needs no iframe or JavaScript to render those results.

`mcp.ts` is only the optional fixture server. Rebuild its checked-in Node bundle from the repository root:

```bash
bun packages/sdk/scripts/bundle-guest.ts --node packages/sdk/examples/tools-only/mcp.ts packages/sdk/examples/tools-only/mcp.js
```
