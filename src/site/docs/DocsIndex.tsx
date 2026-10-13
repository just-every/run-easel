import { DocsFrame } from './DocsFrame'
import { docsLead, docsPath, docsSections } from './pages'

/** /docs: the title, a lead and each section's pages as cards in reading order. */
export function DocsIndex() {
 return <DocsFrame>
  <header className="docs-page-head"><p className="eyebrow">Easel</p><h1 className="docs-title">Docs</h1></header>
  <p className="docs-lead">{docsLead}</p>
  {docsSections.map((section, index) => <section className="docs-index-section" key={section.title} aria-labelledby={`docs-section-${index}`}>
   <h2 className="eyebrow" id={`docs-section-${index}`}>{section.title}</h2>
   <ul className="docs-index-grid">{section.pages.map(page => <li key={page.slug}><a className="docs-index-card" href={docsPath(page.slug)}><h3>{page.title}</h3><p>{page.summary}</p></a></li>)}</ul>
  </section>)}
 </DocsFrame>
}
