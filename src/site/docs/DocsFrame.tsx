import type { ReactNode } from 'react'
import { SiteFooter } from '../shell/SiteFooter'
import { SiteHeader } from '../shell/SiteHeader'
import { DocsSidebar } from './DocsNav'
import './docs.css'

/** Every docs page: the site header, the section sidebar, the page and the footer. */
export function DocsFrame({ current, children, aside }: { current?: string; children: ReactNode; aside?: ReactNode }) {
 return <>
  <a className="site-skip" href="#main">Skip to content</a>
  <SiteHeader current="docs" />
  <div className={`docs-shell site-wrap${aside ? '' : ' docs-shell-wide'}`}>
   <DocsSidebar current={current} />
   <main id="main" className="docs-main">{children}</main>
   {aside}
  </div>
  <SiteFooter />
 </>
}
