import { demoEffect } from './modules/demo/index.mjs'
import { createMailSender } from './modules/mail/index.mjs'
import { isLoopbackHost } from './modules/operator-auth/loopback.mjs'

function localDevelopment(env) {
 if (env.AUTH_LOCAL !== 'true') return false
 try { return isLoopbackHost(new URL(env.AUTH_ORIGIN).hostname) } catch { return false }
}

export function operatorMail(env) {
 if (env.RER_DEMO === '1') return { send: message => demoEffect(() => productionMail(env)?.send(message), () => ({ status: 'accepted', provider: 'resend', providerMessageId: crypto.randomUUID() })) }
 if (localDevelopment(env)) return createMailSender({ provider: 'development', mode: 'development' })
 return productionMail(env)
}

function productionMail(env) {
 if (!env.MAIL_PROVIDER || env.MAIL_PROVIDER === 'development') return undefined
 return {
  async send(message) {
   return createMailSender({ provider: env.MAIL_PROVIDER, mode: 'production', apiKey: env.MAIL_API_KEY, ...(env.MAIL_PROVIDER === 'cloudflare' ? { accountId: env.MAIL_ACCOUNT_ID } : {}) }).send(message)
  },
 }
}
