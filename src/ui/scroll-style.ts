/** Scroll affordances use observed edges; row labels stay visible beside values. */
export const scrollStyle = `
.scroll-frame{position:relative;min-width:0;max-width:100%}
.scroll-frame[data-after=true]::after{content:"";position:absolute;right:0;top:0;bottom:0;width:24px;background:linear-gradient(to right,transparent,var(--surface));pointer-events:none}
.tab-frame[data-after=true]::after{background:linear-gradient(to right,transparent,var(--paper))}
/* The cue is a drawn chevron on an opaque chip (no glyph), so it never sits as text over the scrolled text beneath. */
.scroll-cue{position:absolute;right:2px;top:50%;transform:translateY(-50%);z-index:4;width:24px;height:24px;border-radius:50%;background-color:var(--surface);box-shadow:0 1px 4px rgba(18,16,16,.18);pointer-events:none;
 background-image:linear-gradient(45deg,transparent calc(50% - 1px),var(--ink) calc(50% - 1px),var(--ink) calc(50% + 1px),transparent calc(50% + 1px)),linear-gradient(-45deg,transparent calc(50% - 1px),var(--ink) calc(50% - 1px),var(--ink) calc(50% + 1px),transparent calc(50% + 1px));
 background-size:7px 7px;background-repeat:no-repeat;background-position:calc(50% + 1px) calc(50% - 3px),calc(50% + 1px) calc(50% + 3px)}
.scroll-cue-before{left:2px;right:auto;transform:translateY(-50%) scaleX(-1)}
.tab-frame[data-before=true]::before{content:"";position:absolute;left:0;top:0;bottom:0;width:20px;background:linear-gradient(to left,transparent,var(--paper));pointer-events:none;z-index:3}
.table-scroll :is(th,td):first-child{position:sticky;left:0;z-index:2;background:var(--surface);width:200px;min-width:200px;max-width:200px;white-space:normal;overflow-wrap:normal;word-break:normal;box-shadow:1px 0 var(--rule)}
.table-scroll th[scope=rowgroup]:first-child{background:#f7f7f9;z-index:3}
.table-scroll th[scope=rowgroup]+td{background:#f7f7f9}
.table-scroll :is(th,td).actual:first-child{background:#f6f6f8}
.table-scroll td:last-child:has(.action){white-space:normal;min-width:180px}
@media(max-width:760px){
 .table-scroll{scroll-padding-inline:136px 24px}
 .table-scroll :is(th,td):first-child{width:128px;min-width:128px;max-width:128px;padding-left:8px;padding-right:8px}
}
`
