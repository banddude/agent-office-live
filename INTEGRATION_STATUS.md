# Integration status (2026-10-21)

**Original Pixel Agents renderer is running on Oracle, connected to live AIVA/Dev/worker terminals and JSONL transcripts in read-only mode.**

- CAO terminal roster/status is the same source used by OfficeAdmin's Agents menu.
- Exact JSONL files are matched to Oracle tmux pane starts rather than picking arbitrary recent files.
- Raw transcripts are available without filtering at `/api/transcript/<agent-id>`.
- Original Pixel Agents React Canvas office uses its own sprites and animations.
- Tool/turn changes are converted into the original upstream WebSocket event schema.
- Chromium and macOS WebKit tests rendered the original office and three characters.
- Tailscale-only URL: `http://100.109.117.48:3214/`.
- The default upstream rendering project is preserved. A small watchdog fixes WebKit blank-canvas behavior when rAF stalls.
- Still experimental: exact display of full prompts within the on-screen animation is not implemented by upstream; full original JSONL remains available via the transcript endpoint. Physical iPhone Safari not yet independently verified.

No OfficeAdmin writes, no CAO actions, no agent messages, no production restarts. Source and read-only observer only.
