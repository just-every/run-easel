import { run } from '../run'

export function SiteFooter() {
 return <footer className="site-footer site-wrap">
  <p className="site-footer-brand"><a className="site-brand" href="/"><img src="/brand/mark.svg" alt="" width="28" height="28" /><span>Easel</span></a><span className="site-footer-line">Financial planning for one company.</span></p>
  <nav aria-label="Footer"><a href="/docs">Docs</a><a href={run.repository}>Source</a><a href={`${run.repository}/blob/main/LICENSE`}>MIT licensed</a></nav>
 </footer>
}
