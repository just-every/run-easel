import { run } from '../run'

/** Mark and wordmark home on the left; Docs, Contract and Source on the right; a hairline under it. */
export function SiteHeader({ current }: { current?: 'docs' }) {
 return <header className="site-header site-wrap">
  <a className="site-brand" href="/"><img src="/brand/mark.svg" alt="" width="32" height="32" /><span>Easel</span></a>
  <nav aria-label="Site"><a href="/docs" aria-current={current === 'docs' ? 'page' : undefined}>Docs</a><a href="/contract">Contract</a><a href={run.repository}>Source</a></nav>
 </header>
}
