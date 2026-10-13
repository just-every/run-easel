import type { DevPersona } from './modules/operator-auth/dev/index.mjs'

// Local dev personas: real operators at <as>@dev.localhost, created only by
// local dev sign-in and suspended in exports. Only src/server.dev.ts uses them.
// finance plans everything (Base admin). The others need an Easel membership:
// finance adds sales@dev.localhost and engineering@dev.localhost as
// contributors for their departments and board@dev.localhost as a viewer.
export function devPersonas(): DevPersona[] {
 return [
  { as: 'finance', role: 'admin', displayName: 'Dev finance lead' },
  { as: 'sales', role: 'member', displayName: 'Dev sales lead' },
  { as: 'engineering', role: 'member', displayName: 'Dev engineering lead' },
  { as: 'board', role: 'member', displayName: 'Dev board member' },
 ]
}
