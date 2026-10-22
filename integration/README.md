# Oracle observer for Pixel Agents (read-only)

This repository uses the **unmodified original Pixel Agents office renderer**: its React canvas, character sprites, furniture, layout, animations, and WebSocket event protocol. We do **not** substitute another drawing application or office scene. The only UI source change is a Safari/WebKit rAF watchdog in the existing upstream game loop; see `webview-ui/src/office/engine/gameLoop.ts`.

The independent Oracle adapter is `integration/oraclePixelOffice.ts`. It reads CAO (CLI Agent Orchestrator) `GET /sessions`, `GET /sessions/:id` and `GET /terminals/:id`: the same source used by OfficeAdmin's agent dropdown. AIVA and Dev use their exact CAO terminals, the current worker agents appear dynamically, and the adapter pairs the terminal tmux pane creation time with the Codex/Claude session JSONL creation time. It tails those files and converts tool calls, turn activity, and completion into the **existing Pixel Agents messages** (`agentCreated`, `agentToolStart`, `agentToolDone`, `agentStatus`, `agentToolsClear`). The original office renders the animations.

The adapter does not launch, control, message, or install hooks into AIVA/Dev or their workers. It does not modify OfficeAdmin files, services, or databases. It only reads the current CAO registry and JSONL sessions. Unlike upstream's default CLI, this entry point **never installs Claude hooks**.

### Running on Oracle

After `npm ci` and `npm run build:webview` (already done on Oracle):

```
TZ=America/Los_Angeles node_modules/.bin/tsx integration/oraclePixelOffice.ts
```

Default local HTTP port: `3215`. Bind: `127.0.0.1` only. Your running Oracle Tailscale Serve TCP adapter maps tailnet port `3214` to local port `3215`: `http://100.109.117.48:3214/`. No public internet exposure is intended.

### Full, unfiltered agent data

All tool arguments, prompts, session messages, reasoning records that actually appear in the JSONL, tool output, and other records are preserved. The observer reads full append records without redaction, and also passes every new record unchanged as a `rawAgentEvent` WebSocket event. **The original animation engine does not yet have an animation for every raw JSONL type**, but you can retrieve the original, complete transcript bytes for any currently linked agent via `GET /api/transcript/<numeric-id>` (e.g. `/api/transcript/1` for AIVA, `/api/transcript/2` for Dev). No raw transcript data or keys are committed to the public repository.

`GET /api/oracle/agents` shows the actual read-only agent roster/status and numeric IDs. `GET /api/oracle/health` reports current sync, assets, and errors. Statuses use the CAO API plus turn lifecycle of the correctly paired JSONL file, not a hardcoded 'idle'. Inactive/waiting displays are accurate only to those signals; a background job outside their session may not be represented until CAO lists it.

### Testing

The observer served all six original character sheets, 38 original furniture assets, the upstream default layout, and displayed three characters corresponding to AIVA, Dev, and their current CAO worker. Chromium viewport capture and real macOS WebKit browser capture both verified the original pixel-art office rendering. The WebKit test exposed that `requestAnimationFrame` can be suspended in some contexts; the watchdog corrects that without replacing the renderer.

See `evidence/original-pixel-webkit-watchdog.png`, `evidence/original-pixel-desktop.png` and `evidence/original-pixel-mobile.png`. Mac WebKit verification is not the same as verifying an actual physical iPhone; that still requires the iPhone to open the new tailnet link.

### Adaptive phone and tablet layout (2026-10-21)

The browser UI continues to use the original Pixel Agents canvas, animations,
characters and assets, with a mobile-responsive header, a live CAO-backed agent
carousel, fit-to-scene, touch pan, pinch zoom, and a full raw-activity drawer.

The mobile camera computes bounds from occupied tiles, ignoring reserved VOID
rows, and uses direct viewport measurement (not requestAnimationFrame) to fit
the scene reliably on WebKit/Safari. The original rAF watchdog stays in place.

GET /api/oracle/agents returns real CAO names, statuses, active tool activities,
and session model/effort. GET /api/oracle/events/:id?count=8&before=<byte-cursor>
returns exact full original JSONL records, with backward paging. No fields are
redacted or abbreviated. GET /api/transcript/:id remains the complete raw
JSONL transcript. The public repo contains code, never live transcripts.

Build from the project root by running these commands:

  cd webview-ui
  npm run build -- --outDir ../dist/webview-mobile
  cd ..

Then start an isolated read-only observer:

  TZ=America/Los_Angeles PIXEL_ORACLE_PORT=3217 PIXEL_ORACLE_STATIC_DIR=/home/ubuntu/mikeshaffer/work/agent-office-lab/repo/dist/webview-mobile node_modules/.bin/tsx integration/oraclePixelOffice.ts

Mobile tests: run vitest against test/mobileViewport.test.ts from webview-ui.
Raw record tests: node --test integration/readRawEvents.test.mjs.
The existing live Tailscale URL remains http://100.109.117.48:3214/ after
the final candidate is promoted. No changes to OfficeAdmin or AIVA.
