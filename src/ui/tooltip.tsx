import { useId, type ButtonHTMLAttributes } from 'react'

export function TooltipButton({ tip, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tip: string }) {
 const id = useId()
 return <button {...props} aria-describedby={id} data-tooltip-button>{children}<small id={id} role="tooltip" className="icon-tooltip">{tip}</small></button>
}

export const tooltipStyle = `
[data-tooltip-button]>.icon-tooltip{position:absolute;z-index:20;right:0;bottom:calc(100% + 6px);padding:6px 10px;border-radius:6px;background:var(--ink);color:var(--paper);font:500 13px/1.3 var(--sans);white-space:nowrap;pointer-events:none;visibility:hidden;opacity:0;transition:opacity .1s;transition-delay:0s}
[data-tooltip-button]:hover>.icon-tooltip{visibility:visible;opacity:1;transition-delay:300ms}
[data-tooltip-button]:focus>.icon-tooltip{visibility:visible;opacity:1;transition:none}
`
