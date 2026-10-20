import { SiteFooter } from '../shell/SiteFooter'
import { SiteHeader } from '../shell/SiteHeader'
import './styles/page.css'
import { Actuals } from './sections/Actuals'
import { BoardPack } from './sections/BoardPack'
import { Budget } from './sections/Budget'
import { Close } from './sections/Close'
import { Closing } from './sections/Closing'
import { Excel } from './sections/Excel'
import { Headcount } from './sections/Headcount'
import { Hero } from './sections/Hero'
import { Interlude } from './sections/Interlude'
import { MoveIn } from './sections/MoveIn'
import { Responses } from './sections/Responses'
import { Slip } from './sections/Slip'
import { WeekCash } from './sections/WeekCash'

/** The run site's homepage (run-easel.com): Tallgrass Software's first seven weeks on Easel, one stage per section,
 * from September's actuals to board day. */
export function Landing() {
 return <div className="landing">
  <a className="site-skip" href="#main">Skip to content</a>
  <SiteHeader />
  <main id="main">
   <Hero />
   <Actuals />
   <Slip />
   <Responses />
   <Excel />
   <BoardPack />
   <Interlude />
   <Budget />
   <WeekCash />
   <Headcount />
   <Close />
   <MoveIn />
   <Closing />
  </main>
  <SiteFooter />
 </div>
}
