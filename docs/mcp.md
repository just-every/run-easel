# MCP for your own agent (`API-003`)

`/api/easel/mcp` is a stateless MCP Streamable HTTP endpoint. Sign in as the
person the agent represents and send that native session cookie on every
request. POST JSON-RPC 2.0 with `Content-Type: application/json`,
`Accept: application/json, text/event-stream` and an `Origin` equal to the
installation's origin. Normal HTTP authentication, origin, membership and
department rules apply. This endpoint does not mint credentials.

Initialize with `initialize` and `{protocolVersion, capabilities: {},
clientInfo: {name, version}}`, then send `notifications/initialized` without an
ID. Supported protocol versions are `2025-11-25`, `2025-06-18` and
`2025-03-26`; an unsupported requested initialization version negotiates the
latest supported version. Send the negotiated `MCP-Protocol-Version` header
on subsequent requests. Unsupported header versions receive HTTP 400.
Responses are JSON; notifications receive HTTP 202 with no body. There is no
server session ID or SSE stream; GET and DELETE receive HTTP 405.

`ping`, `tools/list` and `tools/call` are supported. Call tools with
`{name, arguments: {...}}`; `tools/list` supplies each input schema. Results
include both `structuredContent` and a JSON text content block. Business-rule
refusals have `isError: true` and an error/status in `structuredContent`.
Unknown tools and invalid argument shapes receive JSON-RPC error `-32602`.

The available reads are `scenarios`, `scenario` {scenario}, `compare` {a, b},
`variance` {month}, and `metrics` {scenario}. They use the same server-side
filtering as the HTTP views. Metrics include monthly profit, cash and
department headcount.

The available commands are `proposal-create`, `proposal-submit`, `revenue`,
`position`, `expense`, `schedule`, `formula`, `allocation`, `input-delete`, `comment` and
`explanation`, with the command arguments documented in [the HTTP API](../API.md).
Input edits and
submission are limited to the caller's own working draft proposals, including
when the caller is finance. Department restrictions still apply. Allocation
edits require finance. Comments require a visible scenario; explanations stay
drafts. Every write uses the existing atomic revision and live-session fence
and records the signed-in person in the activity trail.

Agents cannot approve budgets, close months, publish packs or promote
proposals through MCP, even under a finance session. Those tool names are
absent and calls to them are refused. Agents leave submitted proposals and
draft explanations for the people responsible for reviewing them.

Protocol references: [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
and [tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).
