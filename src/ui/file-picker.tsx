import { useEffect, useId, useRef } from 'react'

/** The real browser file input, opened by an accessible secondary button. */
export function FilePicker({ label, button, accept, filename, onFile }: { label: string; button: string; accept: string; filename?: string; onFile: (file: File) => Promise<void> }) {
 const input = useRef<HTMLInputElement>(null), nameId = useId()
 useEffect(() => { if (!filename && input.current) input.current.value = '' }, [filename])
 return <div className="field file-picker">
  <span className="file-label">{label}</span>
  <div className="file-controls">
   <input ref={input} className="file-input" aria-label={label} aria-describedby={nameId} type="file" accept={accept} onChange={async e => { const file = e.currentTarget.files?.[0]; if (file) await onFile(file) }} />
   <button type="button" className="secondary" aria-describedby={nameId} onClick={() => input.current?.click()}>{button}</button>
   <span id={nameId} className="file-name" aria-live="polite">{filename || 'No file chosen'}</span>
  </div>
 </div>
}
