import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { contractPageHtml } from '../base/contract-page'
import { hostingPageHtml } from '../base/hosting-page'
import { runPageHtml, siteNotFoundHtml, type SiteBuild, type SiteContext } from '../base/run-site'
import { identity } from '../identity'
import { tokens } from '../ui/tokens'
import { DocsArticle } from './docs/DocsArticle'
import { DocsIndex } from './docs/DocsIndex'
import { docsLead, docsPages } from './docs/pages'
import { Landing } from './landing/Landing'
import { tie } from './landing/tie'
import { run } from './run'
import { breaks } from './shell/breaks'
import { SiteHeader } from './shell/SiteHeader'
import './shell/site.css'
import './shared-pages.css'

const description = 'Free, open source FP&A: Easel connects your ledger, payroll and CRM, forecasts P&L, balance sheet and cash, keeps Excel live and flags any month below your cash floor.'

/**
 * The run site (run-easel.com), written by `rer build --site`: the landing at /, whose Run Easel opens the Run page at
 * /run; the docs at /docs and /docs/<slug>, rendered from docs/site.json and docs/*.md; and the not-found page. Every page
 * is static, needs no script and links to no instance-only route.
 */
export function sitePages({ styles, contract, hosting }: SiteContext): SiteBuild {
 const document = (title: string, summary: string, body: ReactElement, bodyClass?: string) => '<!doctype html>' + renderToStaticMarkup(
  <html lang="en">
   <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={summary} />
    <meta name="theme-color" content="#ffffff" />
    <link rel="icon" href="/favicon.ico" sizes="32x32" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="preload" href="/fonts/inter/inter-latin-opsz-normal.woff2" as="font" type="font/woff2" crossOrigin="" />
    <link rel="stylesheet" href="/fonts/fonts.css" />
    <link rel="stylesheet" href="/rer-theme.css" />
    {styles.map(href => <link key={href} rel="stylesheet" href={href} />)}
    <style dangerouslySetInnerHTML={{ __html: tokens }} />
   </head>
   <body className={bodyClass}>{body}</body>
  </html>,
 )
 const homepageHeader = { html: renderToStaticMarkup(<SiteHeader />), styles }
 return {
  pages: [
   { path: '/', html: tie(document('Easel · Plan the year. Protect the cash.', description, <Landing />, 'landing-body')) },
   { path: '/run', html: runPageHtml(identity, run, contract, homepageHeader).replace('<body>', '<body class="run-page">') },
   { path: '/docs/hosting', html: hostingPageHtml(identity, run, hosting ?? null, contract, homepageHeader).replace('<body>', '<body class="hosting-page">') },
   ...(contract ? [{ path: '/contract', html: contractPageHtml(identity, run, contract) }] : []),
   { path: '/docs', html: breaks(tie(document('Docs · Easel', docsLead, <DocsIndex />))) },
   ...docsPages.map(page => ({ path: `/docs/${page.slug}`, html: breaks(tie(document(`${page.title} · Easel docs`, page.summary, <DocsArticle slug={page.slug} />))) })),
   { path: '/404', html: siteNotFoundHtml(identity, run, contract) },
  ],
  assets: ['rer-theme.css', 'fonts', 'brand'],
 }
}
