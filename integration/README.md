# OfficeAdmin / AIVA live-event bridge (experimental)

This repo is an independent, MIT-licensed fork of Pixel Agents. The original renderer remains intact. A safe bridge converts normalized agent telemetry into Pixel Agents hook events. No OfficeAdmin credentials, customer records, private prompts, or internal reasoning are required.

Use `node integration/bridge.mjs` and POST a normalized event to localhost port 3211 `/events` with JSON `{ "agentId":"demo", "type":"working", "tool":"gmail", "label":"Composing email" }`. The bridge requires `PIXEL_AGENTS_TOKEN` to forward data to an explicitly configured local Pixel Agents server. Otherwise the bridge works in dry-run mode. Set `PIXEL_AGENTS_URL` to the localhost server and `PIXEL_AGENTS_TOKEN` to its bearer token. Bind to loopback only; do not expose untrusted telemetry publicly.

Types: `start`, `thinking`, `working`, `waiting`, `idle`, `stop`. User-facing labels are sanitized and never forwarded as agent reasoning. Tool activity is shown through existing Pixel Agents animations; richer Gmail and code-editor scenes are future enhancements. Integration is opt-in and no production services are changed.

Run `node --test integration/bridge.test.mjs` for local validation.
