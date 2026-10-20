import { run } from '../run'

/** The set-type footer: the mark, the name and line, then Docs, Contract, Source and the licence. */
export function SiteFooter() {
 return <footer className="site-footer site-wrap">
  <p className="site-footer-brand"><a className="site-brand" href="/"><img src="/brand/mark.svg" alt="" width="684" height="828" /><span>Easel</span></a><span className="site-footer-line">Free, open source FP&amp;A</span></p>
  <nav aria-label="Footer"><a href="/docs">Docs</a><a href="/contract">Contract</a><a href={run.repository}>Source</a><a href={`${run.repository}/blob/main/LICENSE`}>MIT licensed</a></nav>
 </footer>
}
