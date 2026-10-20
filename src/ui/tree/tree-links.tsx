import { useLayoutEffect, useState, type RefObject } from 'react'

// The tree's connectors: from the right middle of a parent card to the left middle of each child, drawn after layout
// from the cards' measured boxes and redrawn whenever the board resizes. Dotted magenta by default, solid green on
// the chosen option's path. Decoration only: the outline order already reads root → driver → leaf.
export type Edge = { from: string; to: string; tone: 'magenta' | 'green' | 'red' }

export function TreeLinks({ board, edges }: { board: RefObject<HTMLElement | null>; edges: Edge[] }) {
 const [paths, setPaths] = useState<{ d: string; tone: string; key: string }[]>([])
 const signature = edges.map(e => `${e.from}>${e.to}:${e.tone}`).join('|')
 useLayoutEffect(() => {
  const root = board.current
  if (!root) return
  const draw = () => {
   const frame = root.getBoundingClientRect()
   const box = (id: string) => root.querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"]`)?.getBoundingClientRect()
   const next = edges.flatMap(e => {
    const a = box(e.from), b = box(e.to)
    if (!a || !b || !a.width || !b.width) return []
    const x1 = a.right - frame.left, y1 = a.top + a.height / 2 - frame.top, x2 = b.left - frame.left, y2 = b.top + b.height / 2 - frame.top
    if (x2 <= x1) return []
    const bend = Math.max(18, (x2 - x1) * 0.5)
    return [{ key: `${e.from}>${e.to}`, tone: e.tone, d: `M${x1.toFixed(1)} ${y1.toFixed(1)} C${(x1 + bend).toFixed(1)} ${y1.toFixed(1)} ${(x2 - bend).toFixed(1)} ${y2.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}` }]
   })
   setPaths(next)
  }
  draw()
  const observer = new ResizeObserver(draw)
  observer.observe(root)
  root.querySelectorAll('[data-node]').forEach(n => observer.observe(n))
  void document.fonts?.ready.then(draw)
  return () => observer.disconnect()
 }, [board, signature])
 return <svg className="t-links" aria-hidden="true">{paths.map(p => <g key={p.key} className={`t-link t-link-${p.tone}`}><path d={p.d} /><circle r="3.2" cx={p.d.split(' ').at(-2)} cy={p.d.split(' ').at(-1)} /></g>)}</svg>
}
