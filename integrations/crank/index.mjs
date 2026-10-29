// Versioned, inert Crank app templates. Connection IDs point at native Crank
// custody; no bearer or signing secret is ever embedded in the workflow graph.
export const manifest = { id: 'easel', name: 'Easel', version: 1, triggers: ['approval','close','publish','refresh-failure','alert','task'], actions: ['create-proposal','create-comment'] }
const originOf = origin => {
 const u = new URL(origin)
 if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw new Error('Use the HTTPS Easel origin')
 return u.origin
}
export function trigger(signingConnection) {
 return { type: 'webhook', signature: { preset: 'hmac', header: 'x-easel-signature', algorithm: 'sha256', encoding: 'hex', prefix: 'v1=', timestamp_header: 'x-easel-timestamp', tolerance_seconds: 300 }, signing_connection_id: signingConnection, dedup: { key: 'body.id', window_minutes: 43200 } }
}
export function createProposal(origin, connection, input) {
 return { id: 'proposal', type: 'http', connection_id: connection, input: { method: 'POST', url: originOf(origin) + '/api/easel/automation/proposals', body: input } }
}
export function createComment(origin, connection, input) {
 return { id: 'comment', type: 'http', connection_id: connection, input: { method: 'POST', url: originOf(origin) + '/api/easel/command/comment', body: input } }
}
export function workflow({ origin, signingConnection, apiConnection, event = 'approval', proposal, comment }) {
 if (!manifest.triggers.includes(event)) throw new Error('Choose a supported Easel event')
 return { trigger: trigger(signingConnection), steps: [
  { id: 'event', type: 'filter', when: [[{ field: 'trigger.body.type', op: 'text.equals', value: event }]] },
  ...(proposal ? [createProposal(origin, apiConnection, proposal)] : []),
  ...(comment ? [createComment(origin, apiConnection, comment)] : []),
 ] }
}
