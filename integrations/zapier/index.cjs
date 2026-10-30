const core = require('zapier-platform-core')
const origin = bundle => {
 const url = new URL(bundle.authData.origin)
 if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || (url.protocol === 'http:' && !['127.0.0.1','localhost'].includes(url.hostname))) throw new Error('Use the HTTPS Easel origin (HTTP loopback is supported for local testing).')
 return url.origin
}
const request = async (z, bundle, path, body) => {
 const response = await z.request({ url: origin(bundle) + '/api/easel' + path, method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${bundle.authData.token}`, 'Content-Type': 'application/json' }, ...(body ? { body } : {}), redirect: 'manual' })
 response.throwForStatus()
 return response.json
}
const sample = { id: 'example-event', type: 'approval', version: 1, createdAt: '2026-10-28T12:00:00.000Z', data: { action: 'approve-budget', record: 'budget', scenario: 'budget', revision: 2 } }
const triggers = Object.fromEntries(['approval','close','publish','refresh-failure','alert','task'].map(type => [type.replaceAll('-','_'), {
 key: type.replaceAll('-','_'), noun: 'Event', display: { label: `New ${type.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(' ')} Event`, description: `Triggers when an Easel ${type} event occurs. Event IDs support deduplication.` },
 operation: { cleanInputData: false, perform: async (z,bundle) => (await request(z,bundle,`/automation/events?type=${type}&recent=true`)).events, sample: { ...sample, type }, outputFields: [{ key: 'id' }, { key: 'type' }, { key: 'data__scenario' }, { key: 'data__revision', type: 'integer' }] }
}]))
module.exports = {
 version: require('./package.json').version, platformVersion: core.version,
 authentication: { type: 'custom', fields: [{ key: 'origin', required: true, label: 'Easel origin', helpText: 'HTTPS origin of your Easel installation. [Setup instructions](https://github.com/just-every/run-easel/blob/main/integrations/README.md).'  }, { key: 'token', required: true, type: 'password', label: 'Scoped API token', helpText: 'Use a company-wide finance token. Actions require write scope. [Token instructions](https://github.com/just-every/run-easel/blob/main/API.md).'  }], test: (z,bundle) => request(z,bundle,'/automation/events?recent=true'), connectionLabel: '{{bundle.authData.origin}}' },
 triggers,
 creates: {
  create_proposal: { key: 'create_proposal', noun: 'Proposal', display: { label: 'Create Proposal', description: 'Creates a draft bound to the exact reviewed source revision; never promotes it.' }, operation: { cleanInputData: false,
   inputFields: [{ key: 'from', required: true, label: 'Working scenario ID' }, { key: 'revision', required: true, type: 'integer', label: 'Reviewed source revision' }, { key: 'name', required: true }, { key: 'request', required: true }],
   perform: (z,bundle) => request(z,bundle,'/automation/proposals',bundle.inputData), sample: { id: 'proposal', kind: 'proposal', revision: 1, parent: 'forecast', branchedFrom: { scenario: 'forecast', revision: 2 } }
  } },
  create_comment: { key: 'create_comment', noun: 'Comment', display: { label: 'Create Comment', description: 'Adds a comment to a scenario within your live department authority.' }, operation: { cleanInputData: false,
   inputFields: [{ key: 'scenario', required: true }, { key: 'department', required: true }, { key: 'text', required: true }], perform: (z,bundle) => request(z,bundle,'/command/comment',bundle.inputData), sample: { id: 'comment', text: 'Ready for review' }
  } }
 }
}
