import { SiteFooter } from '../shell/SiteFooter'
import { SiteHeader } from '../shell/SiteHeader'
import { Closing } from './Closing'
import { Details } from './Details'
import { Hero } from './Hero'
import { MoveIn, Sections } from './Sections'
import './landing.css'

/** The run site's homepage (run-easel.com): the plotted year, ink on paper, claret only inside the drawings. */
export function Landing() {
 return <>
  <a className="site-skip" href="#main">Skip to content</a>
  <SiteHeader />
  <main id="main">
   <Hero />
   <Sections />
   <div className="pair site-wrap"><MoveIn /><Details /></div>
   <Closing />
  </main>
  <SiteFooter />
 </>
}
