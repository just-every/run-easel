import { docsPath, docsSections } from './pages'

/** The sections and their pages, the current one marked. `idPrefix` keeps the sidebar's and the phone menu's ids apart. */
function DocsNavList({ current, idPrefix }: { current?: string; idPrefix: string }) {
 return <>{docsSections.map((section, index) => <div className="docs-nav-group" key={section.title}>
  <p className="docs-nav-section eyebrow" id={`${idPrefix}-${index}`}>{section.title}</p>
  <ul aria-labelledby={`${idPrefix}-${index}`}>{section.pages.map(page => <li key={page.slug}><a href={docsPath(page.slug)} aria-current={page.slug === current ? 'page' : undefined}>{page.title}</a></li>)}</ul>
 </div>)}</>
}

/** Beside the page on wide screens; it stays in view while the page scrolls. */
export function DocsSidebar({ current }: { current?: string }) {
 return <nav className="docs-sidebar" aria-label="Docs">
  <a className="docs-sidebar-home" href="/docs" aria-current={current ? undefined : 'page'}>All docs</a>
  <DocsNavList current={current} idPrefix="docs-sidebar" />
 </nav>
}

/** The same list on phones: one disclosure that opens it, no script needed. */
export function DocsMenu({ current, label }: { current: string; label: string }) {
 return <nav className="docs-menu" aria-label="Docs menu">
  <details><summary><span>Docs</span><span className="docs-menu-current">{label}</span></summary><div className="docs-menu-list"><DocsNavList current={current} idPrefix="docs-menu" /></div></details>
 </nav>
}
