import { scrollStyle } from './scroll-style'
import { reviewStyle } from './review-style'
import { activityStyle } from './activity-style'
import { chartStyle } from './chart'
import { tokens } from './tokens'

// Easel's app style: ink on paper, squared controls, claret only in data (the
// actual months, the selected tab and cell, status pills, the charts). Every
// colour is a token (tokens.ts over public/rer-theme.css). Tables scroll inside their own
// box so the page never scrolls sideways on a phone.
const base = `
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:400 15px/1.45 var(--font);font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
a{color:var(--ink);text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:5px}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
h1,h2,h3{font-family:var(--font);color:var(--ink);margin:0;text-wrap:balance}
h2{font-size:20px;line-height:1.25;font-weight:600;letter-spacing:-.01em;margin:0 0 4px}
h3{font-size:16px;line-height:1.3;font-weight:600;margin:24px 0 8px}
p{margin:8px 0}
.muted{color:var(--muted)}
.error{color:var(--danger)}
.date-token{white-space:nowrap}
`

const shell = `
.shell{max-width:1440px;margin:0 auto;padding:0 48px 64px}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:72px;border-bottom:1px solid var(--rule)}
.brand{display:flex;align-items:center;gap:12px;min-width:0}
.brand img{width:32px;height:32px;flex:none}
.wordmark{font-size:26px;line-height:1.2;font-weight:600;letter-spacing:-.02em}
.company{font-size:17px;line-height:1.3;font-weight:400;padding-left:16px;margin-left:4px;border-left:1px solid var(--border);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.who{margin:0;font-size:16px;color:var(--ink);text-align:right}
.who-role{display:none}
.tab-frame{margin-bottom:24px}
.tabs{display:flex;justify-content:flex-end;gap:4px 8px;margin:0;border-bottom:1px solid var(--rule);overflow-x:auto;scroll-padding-inline:16px;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tabs button{flex:none;min-height:48px;padding:0 12px;border:0;border-bottom:2px solid transparent;border-radius:0;background:none;color:var(--ink);font:500 15px/1 var(--font);cursor:pointer}
.tabs button:hover{border-bottom-color:var(--ink);background:none}
.tabs button[aria-current=page]{color:var(--claret);border-bottom-color:var(--claret)}
.status{min-height:44px;display:flex;align-items:center}
section.card.solo{max-width:1200px;margin:64px auto 0;padding:48px}
`

const cards = `
section.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);padding:24px;margin:0 0 24px;min-width:0}
section.card>h2+p.muted,section.card>h2+p{margin-top:2px}
.empty-year{margin-top:32px}
.lead{font-size:28px;line-height:1.15;font-weight:600;letter-spacing:-.02em;margin:0 0 8px}
.row{display:flex;flex-wrap:wrap;gap:12px 16px;align-items:center}
.row.spread{justify-content:space-between}
.controls{margin:0 0 16px}
.row+.cc{margin-top:24px}
.pack{border-top:1px solid var(--rule);padding:16px 0 4px;margin-top:16px}
.pack h3{margin:0 0 8px;font-size:17px}
.notice{background:var(--surface-warm);border:1px solid var(--rule);border-radius:var(--radius-control);padding:12px 16px;margin:12px 0}
.notice h3{margin-top:0}
.pill{display:inline-block;border:1px solid var(--claret);border-radius:999px;background:var(--claret-tint);color:var(--claret);padding:1px 10px;font-size:13px;line-height:1.5;font-weight:500;white-space:nowrap;max-width:100%}
ul.plain{list-style:none;padding:0;margin:8px 0}
ul.plain li{padding:6px 0;border-bottom:1px solid var(--rule)}
ul.plain li:last-child{border-bottom:0}
.trace{white-space:normal;font-size:14px}
details.card-row{border:1px solid var(--rule);border-radius:var(--radius-control);margin:8px 0;padding:0 16px}
details.card-row>summary{cursor:pointer;padding:12px 0;line-height:1.5}
details.card-row[open]>summary{margin:0 -16px;padding:12px 16px;background:var(--claret-tint);border-bottom:1px solid var(--rule)}
details.card-row[open]{padding-bottom:12px}
`

const controls = `
button,.button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:36px;padding:0 16px;border:1px solid var(--ink);border-radius:var(--radius-control);background:var(--ink);color:var(--paper);font:500 15px/1.2 var(--font);text-decoration:none;cursor:pointer}
button:hover{background:color-mix(in srgb,var(--ink) 86%,var(--paper))}
button.quiet{min-height:32px;padding:0 4px;border-color:transparent;background:none;color:var(--ink);text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:5px}
button.quiet:hover{background:none;text-decoration-thickness:2px}
button.secondary{background:var(--surface);color:var(--ink);min-height:44px}
button.secondary:hover{background:var(--surface-warm)}
button.danger{background:none;border-color:var(--danger);color:var(--danger)}
button.danger:hover{background:var(--claret-tint)}
button:disabled{opacity:.6;cursor:progress}
.action{display:inline-flex;flex-wrap:wrap;gap:6px;align-items:center;margin:2px 8px 2px 0}
.form{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(220px,100%),1fr));gap:12px 16px;align-items:start;margin:16px 0 0;padding-top:16px;border-top:1px solid var(--rule)}
.form .form-end,.form .wide,.form>.wide-select,.form>.field:has(.wide-select){grid-column:1/-1}
.form>*{min-width:0}
.form>label:has(textarea),.form>.field:has(textarea){grid-column:1/-1}
.form-end{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
label{display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:500}
label.check{flex-direction:row;align-items:center;gap:8px;font-weight:400;font-size:15px}
label.inline{flex-direction:row;align-items:center;gap:8px;max-width:100%;font-size:15px}
label.inline select{flex:1 1 auto;width:auto;min-width:0}
.scenario-picker{flex:1 1 400px;min-width:0;max-width:100%}
.selected-option{font-weight:400;color:var(--muted);overflow-wrap:anywhere}
.controls>.row{flex:1;min-width:0}
.field{display:flex;flex-direction:column;gap:4px}
.field small{color:var(--muted);font-size:13px}
input,select,textarea{font:400 15px/1.3 var(--font);min-height:40px;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-control);background:var(--surface);color:var(--ink);min-width:0;max-width:100%}
input[type=checkbox]{min-height:0;width:18px;height:18px;accent-color:var(--ink)}
.month-control{position:relative;display:block;min-width:0}
.month-control input{width:100%}
.month-hint{position:absolute;left:12px;top:9px;right:36px;background:var(--surface);color:var(--muted);pointer-events:none;font-weight:400}
.file-label{font-size:14px;font-weight:500}
.file-controls{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;position:relative}
input.file-input{position:absolute;width:1px;height:1px;min-height:0;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
.file-controls:has(input:focus-visible) button{outline:2px solid var(--focus);outline-offset:2px}
.file-name{font-size:14px;font-weight:400;overflow-wrap:anywhere;min-width:0}
/* Single-choice chevron (Base #247); lists retain their native appearance. */
select:not([multiple],[size]:not([size="1"])){
 --rer-select-ink:var(--ink);
 -webkit-appearance:none;appearance:none;padding-inline-end:36px;text-overflow:ellipsis;
 background-image:linear-gradient(to top right,transparent calc(50% - 1.1px),var(--rer-select-ink) calc(50% - .55px),var(--rer-select-ink) calc(50% + .55px),transparent calc(50% + 1.1px)),linear-gradient(to top left,transparent calc(50% - 1.1px),var(--rer-select-ink) calc(50% - .55px),var(--rer-select-ink) calc(50% + .55px),transparent calc(50% + 1.1px));
 background-repeat:no-repeat;background-position:right 20px center,right 14px center;background-size:6px 6px;
}
select:not([multiple],[size]:not([size="1"])):focus-visible{--rer-select-ink:var(--ink)}
select:not([multiple],[size]:not([size="1"])):disabled{--rer-select-ink:color-mix(in srgb,var(--ink) 55%,transparent)}
select[multiple]{min-height:5.5rem;padding-right:12px;background:var(--surface)}
textarea{min-height:80px}
.picker{font-size:15px;font-weight:400}
.form-rows{grid-template-columns:1fr;gap:16px;border-top:0;padding-top:8px}
.form-rows label{display:grid;grid-template-columns:2fr 3fr;gap:16px;align-items:center;font-size:17px;font-weight:400}
.form-rows .field{display:grid;grid-template-columns:2fr 3fr;column-gap:16px;row-gap:6px}
.form-rows .field label{grid-column:1/-1}
.form-rows .field small{grid-column:2}
.form-rows .form-end{justify-content:flex-end;margin-top:8px}
.form-rows button{min-height:44px;padding:0 48px}
`

const tables = `
.table-scroll{overflow-x:auto;max-width:100%;margin:12px 0;scroll-padding-inline:144px 24px;scrollbar-width:thin;scrollbar-color:var(--border) var(--surface)}
table{border-collapse:collapse;width:100%;font-size:14px;line-height:1.3;font-variant-numeric:tabular-nums;background:var(--surface)}
caption{text-align:left;font-size:13px;font-weight:500;padding:4px 0 8px;color:var(--muted)}
th,td{border-bottom:1px solid var(--rule);padding:10px 12px;text-align:left;vertical-align:middle;white-space:nowrap}
thead th{font-size:13px;font-weight:500;color:var(--muted)}
th[scope=rowgroup]{font-weight:600;padding-top:14px;color:var(--ink)}
td.indent{padding-left:28px}
td.num,th.num{text-align:right}
tr.total td{font-weight:600;border-top:1px solid var(--ink)}
td.wrap{white-space:normal;min-width:16rem}
.actual{background:var(--claret-tint)}
th .actual{display:block;margin:-10px -12px;padding:10px 12px}
.cell{min-height:0;padding:2px 4px;margin:-2px -4px;border:1.5px solid transparent;border-radius:2px;background:none;color:inherit;font:inherit;text-decoration:underline dotted color-mix(in srgb,var(--ink) 40%,transparent);text-underline-offset:4px;cursor:pointer}
.cell:hover{background:none;color:var(--claret)}
.cell[aria-pressed=true]{border-color:var(--claret);text-decoration:none}
`

const overview = `
.overview{display:grid;grid-template-columns:minmax(0,1fr);gap:24px;align-items:start}
.overview-main{min-width:0}
.overview.has-trace{grid-template-columns:minmax(0,1fr) 320px}
.overview-main>section.card:last-child{margin-bottom:0}
.trace-panel{position:sticky;top:16px;margin:0}
.trace-panel h2{font-size:26px;letter-spacing:-.02em;padding-bottom:16px;margin-bottom:16px;border-bottom:1px solid var(--rule)}
.trace-panel ul{list-style:none;padding:0;margin:0 0 16px;display:grid;gap:12px}
.trace-panel li{background:var(--surface-warm);border-radius:var(--radius-control);padding:16px}
.trace-from{display:flex;justify-content:space-between;gap:12px;margin:0 0 6px;font-weight:500}
.trace-math{margin:0;font-size:15px;line-height:1.5}
.trace-math strong{font-weight:600}
.trace-panel button.quiet{text-decoration:none;border:1px solid var(--ink);padding:0 32px;min-height:40px}
.grab{display:none}
`

const phone = `
@media (max-width:760px){
 .shell{padding:0 16px 48px}
 .top{min-height:60px}
 .wordmark{font-size:22px}.brand img{width:28px;height:28px}
 .company{font-size:15px;padding-left:12px}
 .who{font-size:14px}
 .tab-frame{margin:0 -16px 16px}.tabs{justify-content:flex-start;padding:0 16px}
 section.card{padding:16px;margin-bottom:16px}
 h2{font-size:18px}
.lead{font-size:24px}
 section.card.solo{margin-top:24px;padding:20px 16px}
 label.inline{width:100%}label.inline select{width:100%}
 .form{grid-template-columns:minmax(0,1fr)}
 .form-rows label,.form-rows .field{grid-template-columns:1fr;font-size:15px;font-weight:500}
 .form-rows .field small{grid-column:1}
 .form-rows button,.form-end>button{width:100%;min-height:44px}
 button{min-height:44px}
 button.quiet{min-height:44px}
 .overview.has-trace{grid-template-columns:minmax(0,1fr)}
 .trace-panel{position:fixed;left:0;right:0;bottom:0;top:auto;z-index:10;max-height:70vh;overflow:auto;border-radius:14px 14px 0 0;border-width:2px 0 0;border-color:var(--ink);box-shadow:0 -8px 24px color-mix(in srgb,var(--ink) 12%,transparent)}
 .trace-panel h2{font-size:21px;border:0;padding:0;margin-bottom:12px}
 .grab{display:block;width:44px;height:5px;border-radius:3px;background:var(--border);margin:-4px auto 12px}
}
@media(max-width:640px){
 .who-person{display:none}.who-role{display:inline}.who{font-size:13px;white-space:nowrap}
 .top{gap:8px}.brand{gap:8px;flex:1}.brand img{width:22px;height:22px}.wordmark{font-size:19px}
 .company{overflow:visible;text-overflow:clip;font-size:14px;padding-left:8px;margin-left:0}
}
`

export const appStyle = tokens + base + shell + cards + controls + tables + overview + chartStyle + phone + scrollStyle + reviewStyle + activityStyle
