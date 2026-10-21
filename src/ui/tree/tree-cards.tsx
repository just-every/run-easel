import type { ReactNode } from 'react'
import { Dots, DotText } from '../dots'
import { monthLabel, type D } from '../shared'
import { Sparkline } from './sparkline'
import { driverLabel, type DriverNode, type Leaf, type Tree } from './tree-model'

/** Whole dollars when the cents are zero, cents when the money is exact; a true minus sign. */
export function cash(n: number) {
 const abs = Math.abs(n), whole = Math.floor(abs / 100).toLocaleString('en-US'), cents = abs % 100
 return `${n < 0 ? '−' : ''}$${whole}${cents ? `.${String(cents).padStart(2, '0')}` : ''}`
}
export const signed = (n: number) => (n > 0 ? `+${cash(n)}` : cash(n))
/** "Option 2 · AE #4–6 start in May" is "Option 2" on a chip; a forecast is "Forecast". */
export const shortName = (scenario: D) => scenario.kind === 'forecast' ? 'Forecast' : String(scenario.name).split(' · ')[0]
const monthShort = (m: string) => monthLabel(m).split(' ')[0]
export const windowText = (tree: Tree) => tree.from === tree.month ? monthShort(tree.month) : `${monthShort(tree.from)}–${monthShort(tree.month)}`

export function RootCard({ tree, months, forecast, option, optionName }: { tree: Tree; months: string[]; forecast: number[]; option: number[] | null; optionName: string }) {
 const short = tree.floor !== null && tree.value < tree.floor ? tree.floor - tree.value : 0
 return <article className="t-card t-root" data-node="root" aria-labelledby="t-root-title">
  <Dots as="h2" id="t-root-title" itemClass={when}>Lowest cash{monthLabel(tree.month)}</Dots>
  {tree.option !== null ? <>
   <p className="t-old"><s aria-label={`Forecast ${cash(tree.value)}`}>{cash(tree.value)}</s></p>
   <p className={`t-new${tree.floor !== null && tree.option < tree.floor ? ' t-short' : ''}`}>{cash(tree.option)} <span>with {optionName}</span></p>
  </> : <p className={`t-now${short ? ' t-short' : ''}`}>{cash(tree.value)}</p>}
  {tree.floor !== null && <p className={`t-floor${short ? '' : ' t-floor-kept'}`}><Dots>{`floor ${cash(tree.floor)}`}{short ? `short ${cash(short)}` : 'kept'}</Dots></p>}
  <Sparkline months={months} forecast={forecast} option={option} floor={tree.floor}
   label={`Closing cash by month from ${monthLabel(months[0])} to ${monthLabel(months.at(-1))}: forecast lowest ${cash(tree.value)} in ${monthLabel(tree.month)}${tree.option !== null ? `; ${optionName} ${cash(tree.option)}` : ''}${tree.floor !== null ? `; floor ${cash(tree.floor)}` : ''}.`} />
  <p className="t-from">{cash(tree.start)} cash {tree.startMonth ? `at the end of ${monthLabel(tree.startMonth)}` : 'to open the plan'}, then the four drivers</p>
 </article>
}

const when = (i: number) => i ? 't-when' : undefined

function Changes({ base, option, value, baseName, optionName, compact }: { base: number | null; option: number | null; value: number; baseName: string; optionName: string; compact?: boolean }) {
 const lines: ReactNode[] = []
 if (base !== null && base !== value) lines.push(<span key="b" className={value - base < 0 ? 't-down' : 't-up-quiet'}>{signed(value - base)} {compact ? 'vs ' : 'since '}{baseName}</span>)
 if (option !== null && option !== value) lines.push(<span key="o" className="t-up">{signed(option - value)} with {optionName}</span>)
 return lines.length ? <p className="t-changes">{lines}</p> : null
}

export function DriverCard({ node, tree, baseName, optionName, open, onToggle, controls }: { node: DriverNode; tree: Tree; baseName: string; optionName: string; open: boolean; onToggle: () => void; controls: string }) {
 const optionMoved = node.option !== null && node.option !== node.value
 const tone = optionMoved ? 't-green' : tree.exception?.driver === node.driver ? 't-red' : ''
 return <article className={`t-card t-driver ${tone}`} data-node={`driver:${node.driver}`}>
  <Dots as="h3" itemClass={when}>{driverLabel[node.driver]}{windowText(tree)}</Dots>
  <p className={`t-amount${node.value < 0 ? ' t-out' : ''}`}>{signed(node.value)}</p>
  <Changes base={node.base} option={node.option} value={node.value} baseName={baseName} optionName={optionName} compact />
  <button type="button" className="t-chevron" aria-expanded={open} aria-controls={controls} onClick={onToggle} aria-label={`${open ? 'Hide' : 'Show'} what makes up ${driverLabel[node.driver]}`}><span aria-hidden="true">›</span></button>
 </article>
}

/** A leaf's name and what it is: the label's parts, then its detail in the regular weight ("Subscriptions churn 1.2%/mo · $1,150 a customer"). */
function LeafTitle({ label, detail }: { label: string; detail: string }) {
 const head = label.split(' · '), rest = detail ? detail.split(' · ') : []
 const items = [...head.slice(0, -1), <>{head.at(-1)}{rest.length > 0 && <span className="t-detail"> {rest[0]}</span>}</>, ...rest.slice(1)]
 return <Dots as="h4" itemClass={i => i >= head.length ? 't-detail' : undefined}>{items.map((item, i) => <span key={i}>{item}</span>)}</Dots>
}

/** One input, department or line under a driver: its name, then its cash with the change beside it, on one row. */
export function LeafCard({ leaf, optionName, baseName, optionChange, exception, onOpen }: { leaf: Leaf; optionName: string; baseName: string; optionChange: string; exception: boolean; onOpen?: () => void }) {
 const optionMoved = leaf.option !== null && leaf.option !== leaf.value
 const tone = optionMoved ? 't-green' : exception ? 't-red' : leaf.alternatives.length ? 't-alt' : ''
 const change = leaf.base !== null && leaf.base !== leaf.value ? <span className={leaf.value - leaf.base < 0 ? 't-down' : 't-up-quiet'}>{signed(leaf.value - leaf.base)} vs {baseName}</span> : null
 return <article className={`t-card t-leaf ${tone}`} data-node={`leaf:${leaf.key}`}>
  {optionMoved && <img className="t-avatar" src="/brand/avatar.svg" alt="" />}
  {/* The exception card beside this leaf already says what changed in it. */}
  <LeafTitle label={leaf.label} detail={exception ? '' : leaf.detail} />
  {optionMoved && optionChange && <DotText as="p" className="t-option-change" text={optionChange} />}
  <p className="t-leaf-amount"><span>{signed(leaf.value)}</span>{optionMoved
   ? <strong className="t-gain">{signed(leaf.option! - leaf.value)} with {optionName}</strong>
   : (change || leaf.alternatives.length > 0) && <span className="t-leaf-side">{change}{leaf.alternatives.map(a => <span key={a} className="t-alt-tag">{a.split(' · ')[0]}</span>)}</span>}</p>
  {onOpen && <button type="button" className="t-chevron" onClick={onOpen} aria-label={`Open ${leaf.label} in Plan`}><span aria-hidden="true">›</span></button>}
 </article>
}

export function ExceptionCard({ leaf, change, changedBy, moved, baseName }: { leaf: Leaf; change: string; changedBy: { who: string; day: string; time: string } | null; moved: string; baseName: string }) {
 return <article className="t-card t-exception" data-node="exception" aria-label={`What changed in ${leaf.label}`}>
  <span className="t-alert" aria-hidden="true">!</span>
  <DotText as="h4" text={change || `${leaf.label} changed`} />
  {changedBy && <p className="t-by">changed by {changedBy.who}, {changedBy.day}, <span className="date-token">{changedBy.time}</span></p>}
  <p className="t-moved">{moved}</p>
  <p className="t-since">{signed(leaf.value - (leaf.base ?? 0))} since {baseName}; Easel changed nothing.</p>
 </article>
}

export function Sticky({ text, label }: { text: string; label: string }) {
 return <aside className="t-sticky" data-node="sticky" aria-label={label}>
  <svg className="t-sparks t-sparks-a" viewBox="0 0 40 40" aria-hidden="true"><path d="M8 4l5 9M3 17l10 2M19 3l-1 9" /></svg>
  <p>{text}</p>
  <svg className="t-sparks t-sparks-b" viewBox="0 0 40 40" aria-hidden="true"><path d="M32 36l-5-9M37 23l-10-2M21 37l1-9" /></svg>
 </aside>
}
