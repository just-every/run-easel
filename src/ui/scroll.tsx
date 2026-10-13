import { useCallback, useEffect, useRef, useState } from 'react'

/** Observe the real scroll edges, including content and viewport changes. */
export function useScrollEdges() {
 const ref = useRef<HTMLDivElement>(null)
 const [edges, setEdges] = useState({ before: false, after: false })
 const update = useCallback(() => {
  const el = ref.current
  if (el) { const before = el.scrollLeft > 1, after = el.scrollLeft + el.clientWidth < el.scrollWidth - 1; setEdges(old => old.before === before && old.after === after ? old : { before, after }) }
 }, [])
 useEffect(() => {
  const el = ref.current
  if (!el) return
  const observer = new ResizeObserver(update)
  observer.observe(el)
  for (const child of el.children) observer.observe(child)
  const mutations = new MutationObserver(update)
  mutations.observe(el, { childList: true, subtree: true, characterData: true })
  el.addEventListener('scroll', update, { passive: true })
  update()
  return () => { observer.disconnect(); mutations.disconnect(); el.removeEventListener('scroll', update) }
 })
 return { ref, edges, update }
}

/** Move only the containing strip, never the page, and preserve its sticky label. */
export function revealHorizontally(el: HTMLElement, sticky = false) {
 const strip = el.closest<HTMLElement>('.table-scroll,.tabs')
 if (!strip || el === strip) return
 const rect = el.getBoundingClientRect(), box = strip.getBoundingClientRect()
 const first = sticky ? el.closest('tr')?.firstElementChild : null
 if (first?.contains(el)) return
 const max = strip.scrollWidth - strip.clientWidth
 const before = strip.scrollLeft > 1, after = strip.scrollLeft < max - 1
 const label = first?.getBoundingClientRect().width ?? 0
 const left = box.left + (sticky ? label + 8 : before ? 24 : 0)
 const right = box.right - (after ? 24 : 0)
 // At a real edge the cue disappears, so do not create a scroll merely to
 // reserve space for it. Inside the strip, keep the whole target past the cues.
 const delta = rect.left < left ? rect.left - left : rect.right > right ? rect.right - right : 0
 if (delta) strip.scrollLeft = Math.max(0, Math.min(max, strip.scrollLeft + delta))
}
