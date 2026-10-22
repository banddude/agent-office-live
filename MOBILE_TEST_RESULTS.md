# Mobile and Tailscale test results (2026-10-21)

The earlier custom HTTPS endpoint was reachable from Oracle but was not resolvable on the laptop because the `.ts.net` hostname was not found by laptop DNS. A temporary Tailscale Serve HTTP proxy on port 3213 also returned 404 from other machines and was removed.

**Replacement URL (tailnet-only):** http://100.109.117.48:3214/

This now uses Tailscale Serve TCP forwarding directly to the loopback-only read-only Node server (`127.0.0.1:3212`); it does not require MagicDNS or a custom HTTPS port. The tailnet tunnel encrypts traffic even though the site uses HTTP within the tunnel.

Tests from separate machines:

- Oracle (TCP forward): GET `/` HTTP 200 with complete HTML.
- Mike's laptop (remote peer): GET `/` HTTP 200; GET `/api/state` returned 7 agents and 40 recent log files.
- mac-server (remote peer): GET `/` HTTP 200; GET `/api/state` returned 7 agents and 40 recent log files.
- macOS `WKWebView` on Mike's laptop, set to 390×844, loaded **the new Tailscale IP URL** and evaluated DOM after 5 seconds. Document ready = complete; 7 `.desk` elements; computed background rgb(18,27,48); no JavaScript error. The real WebKit rendering screenshot is `evidence/macos-webkit-tailnet-mobile.png` (780×1688 Retina image).
- Tailscale peer ping to Mike's iPhone succeeded (direct tunnel; 145ms at test time).

Limitations: WebKit on macOS is not identical to Mobile Safari on the physical iPhone. This is independent cross-machine evidence of Tailscale routing and Apple WebKit rendering; an actual iPhone Safari screen has not been remotely captured or verified. Current live telemetry is prototype-level: tmux roster + recent Codex/Claude JSONL file activity, not full tool-to-animation mapping.

Security: Node stays loopback-only; the IP port is tailnet-only. The original service and OfficeAdmin production were not changed. No messages were sent to AIVA.
