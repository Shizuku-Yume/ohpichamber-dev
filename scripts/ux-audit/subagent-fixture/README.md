# Check-8 Live Subagent Fixture Recipe

Deterministic, isolated end-to-end recipe that spawns a real `home-disk-usage-2` subagent (`sonic` role) inside a live Agent Service + Web Host using a local OpenAI-compatible mock provider (`mock-provider.mjs`), lighting up:

- Right rail `ai-agent` (`subagents`) icon automatically when the parent session is opened
- Right rail `chat-4` (`chat`) icon when clicking `home-disk-usage-2` in `WorkStatusSubagentsSection` or `SubagentsPanel`
- `SubagentsPanel` + `WorkStatusPanel` side-by-side (`besidePanel`) at `1600×1000`
- Sidebar/tab titles showing `home-disk-usage-2` (never `sonic`)

## Isolation

All files stay inside `/tmp/uxfix-04-check8` (override with `--tmp <dir>` or `UXFIX_CHECK8_DIR`). Maintainer directories (`~/.omp`, `~/.config/ohpichamber`, `~/.config/OhPiChamber`) are never touched.

## Prerequisites

Ensure workspace build artifacts are current:

```sh
bun run build
```

## One-shot verification (prints parent session ID, URL, and live subagents JSON, then exits)

```sh
node scripts/ux-audit/subagent-fixture/run-check8.mjs
```

## Live server mode for Playwright screenshots (Gate 07)

Start the isolated mock provider (`127.0.0.1:18477`), OpenChamber server (`127.0.0.1:18478`), and trigger the live subagent in `--keep-alive` mode:

```sh
node scripts/ux-audit/subagent-fixture/run-check8.mjs --keep-alive --tmp /tmp/uxfix-07-check8
```

Once JSON is printed to stdout:
1. Open `summary.webUrl` (`http://127.0.0.1:18478/?session=<parentSessionId>`) at `1600×1000`.
2. Confirm the right activity rail automatically displays the `ai-agent` (`subagents`) icon.
3. Click the `ai-agent` rail icon to open `SubagentsPanel` beside `WorkStatusPanel` (`besidePanel`).
4. Click `home-disk-usage-2` in `SubagentsPanel` or `WorkStatusSubagentsSection` to open the child chat tab and verify the `chat-4` rail icon and `home-disk-usage-2` title (never `sonic`).
5. Send `SIGINT` (`Ctrl-C` / `kill -INT`) to stop both processes cleanly.
