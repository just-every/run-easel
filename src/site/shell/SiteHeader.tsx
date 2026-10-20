import { run } from '../run'

/** The approved mark and the wordmark home on the left; Docs, Contract and Source on the right. */
export function SiteHeader({ current }: { current?: 'docs' }) {
 return <header className="site-header site-wrap">
  <a className="site-brand" href="/"><img src="/brand/mark.svg" alt="" width="684" height="828" /><span>Easel</span></a>
  <nav aria-label="Site"><a href="/docs" aria-current={current === 'docs' ? 'page' : undefined}>Docs</a><a href="/contract">Contract</a><a href={run.repository}>Source</a></nav>
 </header>
}
