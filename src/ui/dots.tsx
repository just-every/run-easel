import { Children, type ElementType, type ReactNode } from 'react'

// A metadata line ("Mar 2027 · Forecast rev 43 · Tue Oct 20, 7:11 pm CT"): its items wrap whole, and the drawn "·"
// belongs to the item after it. The line is shifted left by one separator and clipped there, so an item that starts a
// wrapped line hides its separator: no line ever starts or ends with "·", at any width. The text keeps its " · " in a
// zero-size span, so the line reads, copies and matches as before (style.ts .dots).
export function Dots({ as: Tag = 'span', className, itemClass, children, ...rest }: { as?: ElementType; className?: string; itemClass?: (index: number) => string | undefined; children: ReactNode; [attribute: string]: unknown }) {
 const items = Children.toArray(children).filter(item => item !== '')
 return <Tag {...rest} className={className ? `dots ${className}` : 'dots'}>{items.map((item, i) => <span key={i} className={itemClass?.(i)}>{i > 0 && <span className="dot"> · </span>}{item}</span>)}</Tag>
}

/** Text that already joins its parts with " · " (labels, change notes, task names), as a Dots line. */
export const DotText = ({ text, ...rest }: { text: string; as?: ElementType; className?: string; itemClass?: (index: number) => string | undefined; [attribute: string]: unknown }) => <Dots {...rest}>{text.split(' · ')}</Dots>

/** A name that carries " · " inside a sentence or a narrow table cell: the separator is glued to both neighbours. */
export const glue = (text: string) => text.replaceAll(' · ', '\u00a0·\u00a0')
