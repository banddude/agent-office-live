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

## Mobile refinement (2026-10-21)

- Browser responsive shell with live CAO agent/model cards around the original
  Pixel Agents animated canvas (no substitute office scene)
- Fit to occupied room, auto-refit on rotation and Safari viewport changes
- Pinch zoom, drag to pan, tap agent selection and one-tap Fit
- Read-only mobile settings and full, unfiltered JSONL activity drawer
- Safari/WebKit auto-fit no longer depends on requestAnimationFrame
- Tested in Chromium phone/tablet viewports and macOS WebKit over Tailscale
- Physical iPhone Safari remains separately unverified from automation

## Agent desk close-up

A selectable, pixel-art over-the-shoulder view was added using the original
Pixel Agents character sprite atlas. Desktop agent click and mobile agent-card
selection enter the close-up. The monitor shows actual recorded tool arguments
and output without truncating them. Thinking bubbles are sourced only from
available reasoning summaries/status events; encrypted reasoning is labeled
unreadable. Messages and full raw JSONL remain accessible.

The detail view does not control or change AIVA, Dev, CAO, or OfficeAdmin and
is not a literal VNC or screen capture of the agent's applications.
