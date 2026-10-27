/** Monthly review columns share a grid, and stack into labelled figures on phones. */
export const reviewStyle = `
.variance-head,.variance-summary{display:grid;grid-template-columns:minmax(160px,2fr) repeat(3,minmax(90px,1fr)) minmax(150px,1.5fr);gap:12px;align-items:center}
.variance-head{padding:12px 16px;color:var(--muted);font-size:13px;border-bottom:1px solid var(--rule)}
.variance-head>span:not(:first-child):not(:last-child),.variance-number{text-align:right}
.variance-summary{list-style:none}
.variance-summary::-webkit-details-marker{display:none}
.variance-line::before{content:'▸';display:inline-block;margin-right:8px}
[open]>.variance-summary .variance-line::before{content:'▾'}
.variance-number{font-variant-numeric:tabular-nums;white-space:nowrap}
.variance-number small{display:none}
.variance-unfavourable{color:var(--red-ink)}
.variance-prior{display:none;color:var(--muted)}
@media(min-width:1024px){.variance-head,.variance-summary{grid-template-columns:minmax(160px,2fr) repeat(4,minmax(90px,1fr)) minmax(150px,1.5fr)}.variance-prior{display:block}}
@media(max-width:900px){
 .variance-head{display:none}
 .variance-summary{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 8px}
 .variance-line{grid-column:1/-1}.variance-number small{display:block;font-size:13px;color:var(--muted);font-weight:400}
 .variance-number{font-size:13px}.variance-status{grid-column:1/-1}
}
`
