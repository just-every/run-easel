import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { contractPageHtml } from '../base/contract-page'
import { runPageHtml, siteNotFoundHtml, type SiteBuild, type SiteContext } from '../base/run-site'
import { identity } from '../identity'
import { chartStyle } from '../ui/chart'
import { tokens } from '../ui/tokens'
import { DocsArticle } from './docs/DocsArticle'
import { DocsIndex } from './docs/DocsIndex'
import { docsLead, docsPages } from './docs/pages'
import { Landing } from './landing/Landing'
import { run } from './run'
import './shell/site.css'

const description = 'Free, open-source financial planning: a twelve-month plan built from your actuals, downside scenarios side by side, and a monthly review where every number shows its arithmetic.'

/**
 * The run site (run-easel.com), written by `rer build --site`: the landing at /, whose Run Easel opens the Run page at
 * /run; the docs at /docs and /docs/<slug>, rendered from docs/site.json and docs/*.md; and the not-found page. Every page
 * is static, needs no script and links to no instance-only route.
 */
export function sitePages({ styles, contract }: SiteContext): SiteBuild {
 const document = (title: string, summary: string, body: ReactElement) => '<!doctype html>' + renderToStaticMarkup(
  <html lang="en">
   <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={summary} />
    <meta name="theme-color" content="#fbfaf5" />
    <link rel="icon" type="image/svg+xml" href="/brand/mark.svg" />
    <link rel="stylesheet" href="/fonts/fonts.css" />
    <link rel="stylesheet" href="/rer-theme.css" />
    {styles.map(href => <link key={href} rel="stylesheet" href={href} />)}
    <style dangerouslySetInnerHTML={{ __html: tokens + chartStyle }} />
   </head>
   <body>{body}</body>
  </html>,
 )
 return {
  pages: [
   { path: '/', html: document('Easel · Know what you can afford', description, <Landing />) },
   { path: '/run', html: runPageHtml(identity, run, contract) },
   ...(contract ? [{ path: '/contract', html: contractPageHtml(identity, run, contract) }] : []),
   { path: '/docs', html: document('Docs · Easel', docsLead, <DocsIndex />) },
   ...docsPages.map(page => ({ path: `/docs/${page.slug}`, html: document(`${page.title} · Easel docs`, page.summary, <DocsArticle slug={page.slug} />) })),
   { path: '/404', html: siteNotFoundHtml(identity, run, contract) },
  ],
  assets: ['rer-theme.css', 'fonts', 'brand'],
 }
}
