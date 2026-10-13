import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { fontLinks } from '../base/font-head'
import { introGuardScript, introCss } from '../base/hydration/intro-guard'
import { HydrationUnit } from '../base/hydration/unit'
import { appStyle } from '../ui/style'

export const Route = createRootRoute({
  head: () => ({ meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }], title: 'Easel' }),
  notFoundComponent: () => <HydrationUnit><main className="shell"><h1>Not found</h1></main></HydrationUnit>,
  component: () => <html lang="en"><head>
    <script dangerouslySetInnerHTML={{ __html: introGuardScript }} />
    <style>{introCss}</style>
    {fontLinks.map(link => <link key={link.href} {...link} />)}
    <link rel="stylesheet" href="/rer-theme.css" />
    <link rel="icon" href="/brand/mark.svg" type="image/svg+xml" />
    <HeadContent />
    <style>{appStyle}</style>
  </head><body><Outlet /><Scripts /></body></html>,
})
