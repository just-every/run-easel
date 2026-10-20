import { Children, Fragment, type CSSProperties, type ReactNode } from 'react'

// The page's shared pieces, the hero's family: the two-line heading (black, then the magenta-to-gold gradient), the
// cursors, stickies, sparks, checks and padlocks. Decorations are hidden from assistive technology; every word is text.

export function Heading({ id, eyebrow, lines, level = 2, className }: { id: string; eyebrow?: string; lines: [string, string]; level?: 1 | 2; className?: string }) {
 const Tag = level === 1 ? 'h1' : 'h2'
 return <div className={`heading${className ? ` ${className}` : ''}`}>
  {eyebrow ? <p className="kicker"><Dots>{eyebrow}</Dots></p> : null}
  <Tag id={id}><span className="h-ink">{lines[0]}</span> <span className="h-glow">{lines[1]}</span></Tag>
 </div>
}

/** A run of facts joined by " · ". Each fact keeps its own line break; a "·" that would start a line is clipped, so
 * no line starts or ends on a separator at any width. String children are split at " · "; `aside` (a floated tag)
 * sits inside the run so only the lines beside it make room for it. */
export function Dots({ children, className, aside }: { children: ReactNode; className?: string; aside?: ReactNode }) {
 const facts: ReactNode[][] = [[]]
 Children.toArray(children).forEach(child => {
  if (typeof child !== 'string') { facts[facts.length - 1].push(child); return }
  child.split(' · ').forEach((part, i) => { if (i) facts.push([]); if (part) facts[facts.length - 1].push(part) })
 })
 // A fact that wraps never leaves its last word alone on a line.
 for (const fact of facts) {
  const last = fact.findLastIndex(node => typeof node === 'string' && node.trim().includes(' '))
  if (last >= 0) fact[last] = (fact[last] as string).replace(/ (?=\S+\s*$)/, '\u00a0')
 }
 return <span className={`dots${className ? ` ${className}` : ''}`}><span className="dots-in">
  {aside}{facts.map((fact, i) => <Fragment key={i}>{i ? <wbr /> : null}<span className="fact"><span>{fact}</span></span></Fragment>)}
 </span></span>
}

/** A named cursor: the arrow and its pill ("Rachel" and "Owen" in magenta, "Priya" in gold). */
export function Cursor({ name, tone = 'magenta', className, style }: { name: string; tone?: 'magenta' | 'gold'; className?: string; style?: CSSProperties }) {
 return <span className={`cursor cursor-${tone}${className ? ` ${className}` : ''}`} style={style} aria-hidden="true">
  <svg viewBox="0 0 24 24"><path d="M3 2 21 10.5 12.6 12.8 8.6 21Z" /></svg>
  <span>{name}</span>
 </span>
}

/** A pale yellow handwritten sticky note. */
export function Sticky({ children, className }: { children: ReactNode; className?: string }) {
 return <p className={`sticky${className ? ` ${className}` : ''}`}>{children}</p>
}

/** Three magenta strokes, the hero's spark. */
export function Spark({ className }: { className?: string }) {
 return <svg className={`spark${className ? ` ${className}` : ''}`} viewBox="0 0 40 40" aria-hidden="true"><path d="M8 25 18 31M15 11 21 22M30 6 27 19" /></svg>
}

/** A filled green tick; `label` gives it a name when it stands alone. */
export function Check({ label, tone = 'green' }: { label?: string; tone?: 'green' | 'red' }) {
 return <svg className={`check check-${tone}`} viewBox="0 0 24 24" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
  <circle cx="12" cy="12" r="12" />{tone === 'green' ? <path d="m6.8 12.4 3.4 3.3 7-7.2" /> : <path d="M12 6.5v7M12 17.2v.3" />}
 </svg>
}

export function Lock({ label = 'restricted' }: { label?: string }) {
 return <svg className="lock" viewBox="0 0 24 24" role="img" aria-label={label}><rect x="4.5" y="10.5" width="15" height="11" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>
}

/** The agent's avatar: the approved mark's canvas alone. */
export function Avatar() {
 return <img className="avatar" src="/brand/avatar.svg" alt="" width="40" height="32" />
}

/** The full approved mark (the mascot): the smiling canvas on its gold easel. */
export function Mascot({ className, label }: { className?: string; label?: string }) {
 return <img className={className} src="/brand/mark.svg" alt={label ?? ''} width="684" height="828" />
}
