/** Scroll affordances use observed edges; row labels stay visible beside values. */
export const scrollStyle = `
.scroll-frame{position:relative;min-width:0;max-width:100%}
.scroll-frame[data-after=true]::after{content:"";position:absolute;right:0;top:0;bottom:0;width:24px;background:linear-gradient(to right,transparent,var(--surface));pointer-events:none}
.tab-frame[data-after=true]::after{background:linear-gradient(to right,transparent,var(--paper))}
.scroll-cue{position:absolute;right:0;top:50%;transform:translateY(-50%);z-index:4;background:var(--surface);color:var(--ink);padding:2px 4px;pointer-events:none}
.tab-frame .scroll-cue{background:var(--paper)}
.tab-frame[data-before=true]::before{content:"";position:absolute;left:0;top:0;bottom:0;width:20px;background:linear-gradient(to left,transparent,var(--paper));pointer-events:none;z-index:3}
.scroll-cue-before{left:0;right:auto}
.table-scroll :is(th,td):first-child{position:sticky;left:0;z-index:2;background:var(--surface);width:200px;min-width:200px;max-width:200px;white-space:normal;overflow-wrap:normal;word-break:normal;box-shadow:1px 0 var(--rule)}
.table-scroll th[scope=rowgroup]:first-child{background:var(--surface-warm);z-index:3}
.table-scroll th[scope=rowgroup]+td{background:var(--surface-warm)}
.table-scroll :is(th,td).actual:first-child{background:var(--claret-tint)}
.table-scroll td:last-child:has(.action){white-space:normal;min-width:180px}
@media(max-width:760px){
 .table-scroll{scroll-padding-inline:136px 24px}
 .table-scroll :is(th,td):first-child{width:128px;min-width:128px;max-width:128px;padding-left:8px;padding-right:8px}
}
`
