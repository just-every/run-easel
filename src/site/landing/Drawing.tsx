import type { ReactNode } from 'react'

/** A landing drawing card: warm paper, an ink outline and an inner hairline frame. Its words are real text. */
export function Drawing({ children, className }: { children: ReactNode; className?: string }) {
 return <div className={`drawing${className ? ` ${className}` : ''}`}><div className="drawing-inner">{children}</div></div>
}
