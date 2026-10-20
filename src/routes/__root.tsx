import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { fontLinks } from '../base/font-head'
import { introGuardScript, introCss } from '../base/hydration/intro-guard'
import { HydrationUnit } from '../base/hydration/unit'
import { appStyle } from '../ui/style'

export const Route = createRootRoute({
  head: () => ({ meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'Easel' }] }),
  notFoundComponent: () => <HydrationUnit><main className="shell"><h1>Not found</h1></main></HydrationUnit>,
  component: () => <html lang="en-US"><head>
    <script dangerouslySetInnerHTML={{ __html: introGuardScript }} />
    <style>{introCss}</style>
    {fontLinks.map(link => <link key={link.href} {...link} />)}
    <link rel="stylesheet" href="/rer-theme.css" />
    <link rel="preload" href="/fonts/inter/inter-latin-opsz-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
    <link rel="icon" href="/favicon.ico" sizes="32x32" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <HeadContent />
    <style>{appStyle}</style>
  </head><body><Outlet /><Scripts /></body></html>,
})
