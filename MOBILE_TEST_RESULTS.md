# Mobile verification (2026-10-21)

Tested on Oracle using Playwright mobile Chromium at 390x844, 375x812,
320x568, 844x390 landscape and 820x1180 tablet. The tests checked live
agent cards, fitted original animation canvas, fit/zoom controls, agent
selection, actual unmodified JSONL event inspection and backward paging.

Tested independently from Mike's laptop in an Apple macOS WKWebView over the
actual private Tailscale address. It rendered the original Pixel Agents office
and real characters, with the mobile controls and live agent strip. WebKit's
first test caught a suspended-rAF zoom bug, fixed and retested.

This does not constitute verification on the physical iPhone. The screenshots
in the public repository contain dashboard visuals only, not private
transcripts, prompts, tool arguments, outputs or credentials.
