import { scrollStyle } from './scroll-style'
import { reviewStyle } from './review-style'
import { activityStyle } from './activity-style'
import { chartStyle } from './chart'
import { treeStyle } from './tree/tree-style'
import { tokens } from './tokens'

// Easel's app style, the owner's pick carried to every screen: a white page on a faint square grid, one white top
// bar, heavy black Inter headings, white hairline cards with soft shadows, thin quiet fields with a magenta focus
// ring, dense tables with tabular figures. The magenta → gold gradient is on the active tab only; green is the
// picked plan and done, red the floor, the exception and the gap. Every colour is a token (tokens.ts over
// public/rer-theme.css). Tables scroll inside their own box so the page never scrolls sideways on a phone.
const base = `
*{box-sizing:border-box}
body{margin:0;background:var(--graph-paper);background-color:var(--paper);color:var(--ink);font:400 15px/1.45 var(--sans);font-feature-settings:'tnum' 1,'cv11' 1;-webkit-font-smoothing:antialiased}
a{color:var(--ink);text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:4px;text-decoration-color:var(--hair-strong)}
a:hover{text-decoration-color:var(--magenta)}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
h1,h2,h3{font-family:var(--display);color:var(--ink);margin:0;text-wrap:balance}
h2{font-size:21px;line-height:1.2;font-weight:800;letter-spacing:-.025em;margin:0 0 6px}
h3{font-size:16px;line-height:1.3;font-weight:700;letter-spacing:-.01em;margin:24px 0 8px}
p{margin:8px 0}
.muted{color:var(--muted)}
.error{color:var(--red-ink)}
.date-token{white-space:nowrap}
`

const shell = `
.shell{max-width:1536px;margin:0 auto;padding:0 32px 64px}
.top{display:flex;align-items:center;gap:20px;min-height:76px}
.brand{display:flex;align-items:center;gap:8px;min-width:0;flex:none}
.brand img{width:31px;height:38px;flex:none}
.wordmark{font-family:var(--display);font-size:30px;line-height:1;font-weight:850;letter-spacing:-.045em;color:var(--ink)}
.top .tab-frame{flex:1 1 auto;min-width:0;margin:0}
.tabs{display:flex;align-items:center;gap:2px;margin:0;overflow-x:auto;scroll-padding-inline:16px;scrollbar-width:none;padding:4px 2px}
.tabs::-webkit-scrollbar{display:none}
.tabs button{flex:none;min-height:38px;padding:0 11px;border:0;border-radius:11px;background:none;color:var(--ink);font:500 14.5px/1 var(--sans);cursor:pointer}
.tabs button:hover{background:var(--grid)}
.tabs button[aria-current=page]{background:var(--glow);color:#fff;font-weight:700;font-size:16px;padding:0 18px;box-shadow:0 6px 14px -8px rgba(243,2,112,.6)}
.meta{display:flex;align-items:center;gap:14px;flex:none;margin-left:auto;font-size:13.5px;color:var(--muted);white-space:nowrap}
.meta .company{font-weight:600;color:var(--ink)}
.meta .fresh{padding-left:14px;border-left:1px solid var(--hair-strong)}
.ok{color:var(--green);font-weight:700}
.avatar-chip{display:inline-grid;place-items:center;width:40px;height:40px;flex:none;border-radius:50%;background:#e9ebf0;color:var(--ink);font:700 13.5px/1 var(--sans)}
.status{min-height:44px;display:flex;align-items:center}
.page-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 18px;margin:18px 0 22px}
.page-head h1{font-size:44px;line-height:1.02;font-weight:850;letter-spacing:-.045em}
.page-head p{margin:0;font-size:17px;color:var(--muted)}
section.card.solo{max-width:880px;margin:56px auto 0;padding:40px 44px}
`

const cards = `
section.card{background:var(--surface);border:1px solid var(--rule);border-radius:var(--radius-panel);box-shadow:var(--shadow);padding:22px 24px;margin:0 0 20px;min-width:0}
section.card>h2+p.muted,section.card>h2+p{margin-top:2px}
.empty-year{margin-top:28px}
.lead{font-family:var(--display);font-size:34px;line-height:1.05;font-weight:850;letter-spacing:-.045em;margin:0 0 10px}
.row{display:flex;flex-wrap:wrap;gap:12px 16px;align-items:center}
.row.spread{justify-content:space-between}
.controls{margin:0 0 18px}
.row+.cc{margin-top:24px}
.pack{border-top:1px solid var(--rule);padding:16px 0 4px;margin-top:16px}
.pack h3{margin:0 0 8px;font-size:17px}
.notice{background:var(--amber-soft);border:1px solid var(--amber-line);border-radius:var(--radius-field);padding:12px 16px;margin:12px 0;color:var(--ink)}
.notice h3{margin-top:0}
.note{border-left:3px solid var(--gold);padding:4px 0 4px 16px;margin:16px 0}
.pill{display:inline-flex;align-items:center;min-height:24px;border-radius:999px;background:#f0f0f3;color:var(--ink);padding:1px 11px;font-size:13px;line-height:1.5;font-weight:600;white-space:nowrap;max-width:100%}
ul.plain{list-style:none;padding:0;margin:8px 0}
ul.plain li{padding:8px 0;border-bottom:1px solid var(--rule)}
ul.plain li:last-child{border-bottom:0}
.trace{white-space:normal;font-size:14px}
details.card-row{border:1px solid var(--rule);border-radius:var(--radius-field);margin:8px 0;padding:0 16px;background:var(--surface)}
details.card-row>summary{cursor:pointer;padding:12px 0;line-height:1.5}
details.card-row[open]>summary{margin:0 -16px;padding:12px 16px;background:var(--pink-soft);border-bottom:1px solid var(--rule);border-radius:var(--radius-field) var(--radius-field) 0 0}
details.card-row[open]{padding-bottom:12px}
details>summary{cursor:pointer}
`

const controls = `
button,.button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:38px;padding:0 18px;border:1px solid var(--ink);border-radius:999px;background:var(--ink);color:#fff;font:600 14.5px/1.2 var(--sans);text-decoration:none;cursor:pointer}
button:hover{background:#2b2626}
button.quiet{min-height:32px;padding:0 4px;border-color:transparent;border-radius:6px;background:none;color:var(--ink);font-weight:500;text-decoration:underline;text-decoration-thickness:1px;text-decoration-color:var(--hair-strong);text-underline-offset:4px}
button.quiet:hover{background:none;text-decoration-color:var(--magenta)}
button.secondary{background:var(--surface);color:var(--ink);min-height:44px}
button.secondary:hover{background:var(--grid)}
button.danger{background:none;border-color:transparent;color:var(--red-ink);font-weight:500;padding:0 6px;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:4px}
button.danger:hover{background:var(--red-soft)}
button:disabled{opacity:.6;cursor:progress}
.action{display:inline-flex;flex-wrap:wrap;gap:6px;align-items:center;margin:2px 8px 2px 0}
.form{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(220px,100%),1fr));gap:14px 16px;align-items:start;margin:18px 0 0;padding-top:18px;border-top:1px solid var(--rule)}
.form .form-end,.form .wide,.form>.wide-select,.form>.field:has(.wide-select){grid-column:1/-1}
.form>*{min-width:0}
.form>label:has(textarea),.form>.field:has(textarea){grid-column:1/-1}
.form-end{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
label{display:flex;flex-direction:column;gap:6px;font-size:13.5px;font-weight:600;color:var(--text)}
label.check{flex-direction:row;align-items:center;gap:8px;font-weight:400;font-size:15px}
label.inline{flex-direction:row;align-items:center;gap:8px;max-width:100%;font-size:14.5px}
label.inline select{flex:1 1 auto;width:auto;min-width:0}
.scenario-picker{flex:1 1 400px;min-width:0;max-width:100%}
.selected-option{font-weight:400;color:var(--muted);overflow-wrap:anywhere}
.controls>.row{flex:1;min-width:0}
.field{display:flex;flex-direction:column;gap:4px}
.field small{color:var(--muted);font-size:13px}
input,select,textarea{font:400 15px/1.3 var(--sans);min-height:42px;padding:9px 13px;border:1px solid var(--field);border-radius:var(--radius-field);background:var(--surface);color:var(--ink);min-width:0;max-width:100%;transition:border-color .12s,box-shadow .12s}
input:hover,select:hover,textarea:hover{border-color:var(--ink)}
input:focus-visible,select:focus-visible,textarea:focus-visible{outline:none;border-color:var(--ink);box-shadow:0 0 0 3px var(--surface),0 0 0 5px var(--focus)}
input[type=checkbox]{min-height:0;width:18px;height:18px;accent-color:var(--ink)}
input[type=checkbox]:focus-visible{outline:3px solid var(--focus);outline-offset:2px;box-shadow:none}
.month-control{position:relative;display:block;min-width:0}
.month-control input{width:100%}
.month-hint{position:absolute;left:13px;top:10px;right:36px;background:var(--surface);color:var(--muted);pointer-events:none;font-weight:400}
.file-label{font-size:13.5px;font-weight:600}
.file-controls{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;position:relative}
input.file-input{position:absolute;width:1px;height:1px;min-height:0;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
.file-controls:has(input:focus-visible) button{outline:3px solid var(--focus);outline-offset:2px}
.file-name{font-size:14px;font-weight:400;overflow-wrap:anywhere;min-width:0}
/* Single-choice chevron (Base #247): two gradient strokes 14 px inside the right border, 40 px end padding. */
select:not([multiple],[size]:not([size="1"])){
 --rer-select-ink:var(--ink);
 -webkit-appearance:none;appearance:none;padding-inline-end:40px;text-overflow:ellipsis;
 background-image:linear-gradient(to top right,transparent calc(50% - 1.1px),var(--rer-select-ink) calc(50% - .55px),var(--rer-select-ink) calc(50% + .55px),transparent calc(50% + 1.1px)),linear-gradient(to top left,transparent calc(50% - 1.1px),var(--rer-select-ink) calc(50% - .55px),var(--rer-select-ink) calc(50% + .55px),transparent calc(50% + 1.1px));
 background-repeat:no-repeat;background-position:right 20px center,right 14px center;background-size:6px 6px;
}
select:not([multiple],[size]:not([size="1"])):disabled{--rer-select-ink:color-mix(in srgb,var(--ink) 55%,transparent)}
select[multiple]{min-height:5.5rem;padding-right:13px;background:var(--surface)}
textarea{min-height:84px}
.picker{font-size:15px;font-weight:400}
.form-rows{grid-template-columns:1fr;gap:16px;border-top:0;padding-top:8px}
.form-rows label{display:grid;grid-template-columns:2fr 3fr;gap:16px;align-items:center;font-size:16px;font-weight:500}
.form-rows .field{display:grid;grid-template-columns:2fr 3fr;column-gap:16px;row-gap:6px}
.form-rows .field label{grid-column:1/-1}
.form-rows .field small{grid-column:2}
.form-rows .form-end{justify-content:flex-end;margin-top:8px}
.form-rows button{min-height:48px;padding:0 44px;font-size:16px}
`

const tables = `
.table-scroll{overflow-x:auto;max-width:100%;margin:12px 0;scroll-padding-inline:144px 24px;scrollbar-width:thin;scrollbar-color:var(--hair-strong) var(--surface)}
table{border-collapse:collapse;width:100%;font-size:14px;line-height:1.3;font-variant-numeric:tabular-nums;background:var(--surface)}
caption{text-align:left;font-size:13px;font-weight:600;padding:4px 0 8px;color:var(--muted)}
th,td{border-bottom:1px solid var(--rule);padding:9px 12px;text-align:left;vertical-align:middle;white-space:nowrap}
thead th{font-size:12.5px;font-weight:600;color:var(--muted);letter-spacing:.01em}
th[scope=rowgroup]{font-weight:700;padding-top:14px;color:var(--ink)}
td.indent{padding-left:28px}
td.num,th.num{text-align:right}
tr.total td{font-weight:700;border-top:1px solid var(--ink)}
td.wrap{white-space:normal;min-width:16rem}
.actual{background:#f6f6f8}
th .actual{display:block;margin:-9px -12px;padding:9px 12px}
.cell{min-height:0;padding:2px 4px;margin:-2px -4px;border:1.5px solid transparent;border-radius:4px;background:none;color:inherit;font:inherit;text-decoration:underline dotted color-mix(in srgb,var(--ink) 40%,transparent);text-underline-offset:4px;cursor:pointer}
.cell:hover{background:none;color:var(--magenta)}
.cell[aria-pressed=true]{border-color:var(--magenta);background:var(--pink-soft);text-decoration:none}
`

const overview = `
.overview{display:grid;grid-template-columns:minmax(0,1fr);gap:20px;align-items:start}
.overview-main{min-width:0}
.overview.has-trace{grid-template-columns:minmax(0,1fr) 340px}
.overview-main>section.card:last-child{margin-bottom:0}
.trace-panel{position:sticky;top:16px;margin:0;border-color:var(--magenta)}
.trace-panel h2{font-size:24px;letter-spacing:-.035em;padding-bottom:14px;margin-bottom:14px;border-bottom:1px solid var(--rule)}
.trace-panel ul{list-style:none;padding:0;margin:0 0 16px;display:grid;gap:10px}
.trace-panel li{background:#f7f7f9;border-radius:var(--radius-field);padding:14px 16px}
.trace-from{display:flex;justify-content:space-between;gap:12px;margin:0 0 6px;font-weight:600}
.trace-math{margin:0;font-size:14.5px;line-height:1.5}
.trace-math strong{font-weight:700}
.trace-panel button.quiet{text-decoration:none;border:1px solid var(--ink);border-radius:999px;padding:0 28px;min-height:40px}
.grab{display:none}
`

const phone = `
@media (max-width:1600px){
 .meta .company{display:none}
}
@media (max-width:980px){
 .top{flex-wrap:wrap;gap:8px 12px;padding-top:10px}
 .top .tab-frame{order:3;flex:1 1 100%;margin:0 -32px;padding:0 32px}
 .meta{margin-left:auto}
}
@media (max-width:760px){
 .shell{padding:0 16px 48px}
 .top{min-height:0}
 .top .tab-frame{margin:0 -16px;padding:0}
 .tabs{padding:4px 16px 6px}
 .wordmark{font-size:25px}.brand img{width:26px;height:32px}
 .meta{font-size:13px;gap:10px}.meta .fresh{display:none}
 .avatar-chip{width:36px;height:36px}
 .page-head{margin:12px 0 16px}.page-head h1{font-size:34px}.page-head p{font-size:15px}
 section.card{padding:16px;margin-bottom:16px;border-radius:12px}
 h2{font-size:19px}
 .lead{font-size:28px}
 section.card.solo{margin-top:20px;padding:22px 18px}
 label.inline{width:100%}label.inline select{width:100%}
 .form{grid-template-columns:minmax(0,1fr)}
 .form-rows label,.form-rows .field{grid-template-columns:1fr;font-size:15px;font-weight:600}
 .form-rows .field small{grid-column:1}
 .form-rows button,.form-end>button{width:100%;min-height:46px}
 button{min-height:44px}
 button.quiet,button.danger{min-height:44px}
 .overview.has-trace{grid-template-columns:minmax(0,1fr)}
 .trace-panel{position:fixed;left:0;right:0;bottom:0;top:auto;z-index:10;max-height:70vh;overflow:auto;border-radius:16px 16px 0 0;border-width:1px 0 0;box-shadow:0 -10px 28px rgba(18,16,16,.16)}
 .trace-panel h2{font-size:20px;border:0;padding:0;margin-bottom:12px}
 .grab{display:block;width:44px;height:5px;border-radius:3px;background:var(--hair-strong);margin:-4px auto 12px}
}
`

export const appStyle = tokens + base + shell + cards + controls + tables + overview + chartStyle + treeStyle + phone + scrollStyle + reviewStyle + activityStyle
