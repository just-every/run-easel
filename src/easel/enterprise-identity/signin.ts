// Reuse the installation's existing Base auth frame and its exact style hash.
import { themeFrame } from '../../base/theme-frame'
import branding from '../../branding.json'
export async function samlSignInPage(id: string, idpSsoUrl: string) {
 const frame = await themeFrame({ href: '/rer-theme.css', productName: branding.name, accentColor: branding.primaryColor })
 return new Response(`<!doctype html><html lang="en"${frame.htmlClass}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Company sign-in · Easel</title>${frame.head}</head><body><main>${frame.brand}<h1>Company sign-in</h1><p>Continue to your company’s identity provider. Your existing Easel access applies when you return.</p><form method="post" action="/auth/saml/${id}/start"><input type="hidden" name="returnTo" value="/app"><button type="submit">Continue with SAML</button></form><p><a href="/signin">Other sign-in options</a></p></main></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'content-security-policy': `default-src 'none'; script-src 'none'; ${frame.policy}; form-action 'self' ${new URL(idpSsoUrl).origin}; base-uri 'none'; frame-ancestors 'none'` } })
}
