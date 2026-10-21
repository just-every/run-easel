// The driver tree's style, measured from the owner's pick (app-1536.png, 12ui's conversion of it): a root card at the
// left, four driver cards, their leaves, and a right column for the exception, the sticky and the decision card,
// joined by dotted magenta connectors (solid green on the chosen option's path). Below 761 px it is an outline.
export const treeStyle = `
.t-head{margin:18px 0 14px;gap:8px 18px}
.t-head h1{font-size:62px;letter-spacing:-.05em;line-height:1.04}
.t-head p{font-size:17px}
.t-switch{display:inline-flex;flex-wrap:wrap;max-width:100%;padding:4px;margin:0 0 4px;background:rgba(255,255,255,.88);border:1px solid var(--hair-strong);border-radius:12px;box-shadow:0 4px 10px -6px rgba(18,16,16,.18)}
.t-switch button{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:5px 16px;border:1px solid transparent;border-radius:9px;background:none;color:var(--ink);font:500 15.5px/1.15 var(--sans)}
.t-switch button:hover{background:var(--grid)}
.t-switch button[aria-pressed=true]{border-color:var(--green);background:#f4fff8;font-weight:650}
.t-switch img{width:24px;height:19px}
.t-switch-value{font-size:13px;font-weight:500;color:var(--muted)}
.t-switch .t-below .t-switch-value{color:var(--red-ink)}
.t-switch button[aria-pressed=true] .t-switch-value{color:var(--green-ink)}
.t-switch .t-below[aria-pressed=true] .t-switch-value{color:var(--red-ink)}
.t-board{position:relative;display:grid;grid-template-columns:minmax(0,348fr) 4.75% minmax(0,246fr) 3.94% minmax(0,328fr) 1.77% minmax(0,396fr);column-gap:0;row-gap:16px;align-items:center;margin-top:8px;padding:4px 0}
.t-board>div{min-width:0;position:relative;z-index:1}
.t-root-cell{grid-column:1;align-self:center}
.t-driver-cell{grid-column:3}
.t-leaves{grid-column:5;display:flex;flex-direction:column;gap:8px}
.t-leaves[hidden]{display:none}
.t-side{grid-column:7;display:flex;flex-direction:column;align-items:flex-start;gap:16px;align-self:center}
.t-decision-cell{grid-column:7;align-self:end}
.t-links{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:0}
.t-link path{fill:none;stroke-width:2.4;stroke-linecap:round}
.t-link-magenta path{stroke:var(--magenta);stroke-dasharray:.1 6.5}
.t-link-green path{stroke:var(--green);stroke-width:2.6}
.t-link-red path{stroke:var(--red);stroke-dasharray:.1 6.5}
.t-link circle{fill:var(--magenta)}
.t-link-green circle{fill:var(--green)}
.t-card{position:relative;background:#fff;border:1px solid #d3deea;border-radius:8px;box-shadow:0 5px 12px rgba(35,59,75,.1);color:var(--ink)}
.t-card :where(p,h2,h3,h4){margin:0;text-wrap:balance}
.t-chevron{position:absolute;right:8px;top:50%;transform:translateY(-50%);min-height:36px;width:32px;padding:0;border:0;border-radius:8px;background:none;color:#263e69;font:400 28px/1 var(--sans)}
.t-chevron:hover{background:var(--grid)}
.t-driver .t-chevron[aria-expanded=false] span{display:inline-block;transform:rotate(0)}
.t-driver .t-chevron[aria-expanded=true] span{display:inline-block}
.t-root{padding:18px 18px 16px}
.t-root h2{font-size:22px;font-weight:800;letter-spacing:-.035em}
.t-when{font-weight:400;letter-spacing:-.01em}
.t-root h2 .t-when{font-size:18px}
.t-old{margin-top:12px;font-size:27px;font-weight:800;letter-spacing:-.03em;color:var(--ink)}
.t-old s{text-decoration-thickness:2px}
.t-new,.t-now{font-size:24px;font-weight:800;letter-spacing:-.03em;color:var(--green)}
.t-now{margin-top:12px;color:var(--ink)}
.t-new span{font-size:20px;white-space:nowrap}
.t-short{color:var(--red-ink)}
.t-floor{display:inline-block;margin:10px 0 12px;padding:6px 13px;border-radius:12px;background:linear-gradient(#ffdaeb,#ffdfd4);color:var(--red-ink);font-size:15.5px;font-weight:500}
.t-floor-kept{background:var(--green-soft);color:var(--green-ink)}
.t-card .t-from{margin-top:10px;font-size:12px;line-height:1.35;color:var(--muted)}
.t-spark{position:relative;margin:14px 0 0;padding:0 0 34px 34px}
.t-spark-plot{position:relative;height:96px;border-left:1px solid var(--hair-strong);border-bottom:1px solid var(--hair-strong)}
.t-spark svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.t-spark polyline,.t-spark line{fill:none;stroke-linejoin:round;stroke-linecap:round}
.t-spark-floor{stroke:var(--red);stroke-width:1.8;stroke-dasharray:6 5}
.t-spark-now{stroke:var(--ink);stroke-width:2.2}
.t-spark-old{stroke:#a6a9b3;stroke-width:2;stroke-dasharray:1 5}
.t-spark-new{stroke:var(--green);stroke-width:2.6}
.t-dot{position:absolute;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%}
.t-dot-now{background:var(--ink)}.t-dot-old{background:#b3b6bf;width:6px;height:6px;margin:-3px 0 0 -3px}.t-dot-new{background:var(--green)}
.t-spark-ticks{position:absolute;left:0;top:0;bottom:34px;width:28px}
.t-spark-ticks span{position:absolute;right:0;transform:translateY(-50%);font-size:11.5px;color:var(--muted)}
.t-spark-axis{position:absolute;left:34px;right:0;bottom:0;height:30px}
.t-spark-axis span{position:absolute;top:5px;transform:translateX(-50%);font-size:11.5px;line-height:1.2;text-align:center;color:var(--muted);white-space:nowrap}
.t-driver{padding:16px 32px 16px 18px;min-height:104px;border-left:7px solid #c6cbd4}
.t-driver.t-red{border-left-color:var(--magenta)}
.t-driver.t-green{border-left-color:var(--green)}
.t-driver h3{font-size:21px;font-weight:800;letter-spacing:-.035em}
.t-driver h3 .t-when{font-size:15px;color:#3b4d72}
.t-amount{margin-top:3px;font-size:20px;font-weight:800;letter-spacing:-.04em;white-space:nowrap}
.t-changes{display:flex;flex-direction:column;gap:2px;margin-top:4px;font-size:13.5px;line-height:1.3}
.t-down{color:var(--red-ink);font-weight:650}
.t-up{color:var(--green-ink);font-weight:650}
.t-up-quiet{color:var(--muted)}
.t-leaf{padding:8px 30px 8px 34px;min-height:54px;line-height:1.25;overflow-wrap:anywhere}
.t-leaf::before{content:"";position:absolute;left:13px;top:12px;width:6px;height:10px;border-radius:2px;background:#c9d0dc}
.t-leaf h4{font-size:15px;font-weight:700;letter-spacing:-.025em;line-height:1.25}
.t-leaf h4 .t-detail{font-weight:400;color:var(--text)}
.t-leaf-amount{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:2px 10px;margin-top:2px;font-size:13.5px;line-height:1.3;color:var(--text)}
.t-leaf-side{display:inline-flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:2px 6px;margin-left:auto;text-align:right}
.t-leaf.t-red{border:1px solid var(--red);border-left:6px solid var(--red);padding-left:20px}
.t-leaf.t-red::before{background:var(--magenta);left:7px}
.t-leaf.t-green{border:2px solid var(--green);border-left-width:6px;padding-left:46px}
.t-leaf.t-green::before{display:none}
.t-leaf.t-alt{border-style:dashed;border-color:var(--hair-strong)}
.t-avatar{position:absolute;left:10px;top:12px;width:26px;height:21px}
.t-option-change{font-size:13.5px;color:var(--text);margin-top:2px}
.t-gain{color:var(--green-ink);font-size:15px;font-weight:750}
.t-alt-tag{display:inline-flex;align-items:center;min-height:20px;padding:0 8px;border-radius:999px;background:var(--amber-soft);border:1px solid var(--amber-line);color:var(--amber);font-size:12px;font-weight:600}
.t-exception{width:100%;padding:11px 14px 11px 38px;border:1px solid var(--red);border-left:6px solid var(--red)}
.t-alert{position:absolute;left:11px;top:13px;display:grid;place-items:center;width:17px;height:17px;border-radius:50%;background:var(--red);color:#fff;font:800 12px/1 var(--sans)}
.t-exception h4{font-size:15px;font-weight:700;letter-spacing:-.015em;line-height:1.3}
.t-by{margin-top:2px;font-size:13.5px;color:var(--text)}
.t-moved{margin-top:6px;font-size:15.5px;letter-spacing:-.01em}
.t-since{margin-top:5px;font-size:13.5px;color:var(--muted)}
.t-sticky{position:relative;width:156px;margin:4px 44px 4px auto;padding:20px 16px 22px;background:var(--sticky);font-family:var(--hand);font-size:27px;line-height:1.08;font-weight:600;text-align:center;color:var(--ink);transform:rotate(-6deg);box-shadow:0 12px 20px -12px rgba(80,60,0,.5),0 1px 1px rgba(0,0,0,.06)}
.t-sticky p{margin:0}
.t-sparks{position:absolute;width:34px;height:34px;overflow:visible}
.t-sparks path{fill:none;stroke:var(--magenta);stroke-width:3.2;stroke-linecap:round}
.t-sparks-a{left:-40px;top:-14px}.t-sparks-b{right:-36px;bottom:-16px}
.t-decision{padding:16px}
.t-decision h3{font-size:17.5px;font-weight:800;letter-spacing:-.03em;margin:0 0 12px}
.t-decision h3 span{display:inline;margin-left:4px;font-size:13.5px;font-weight:400;letter-spacing:0;color:var(--text)}
.t-actions{display:flex;flex-wrap:wrap;gap:10px}
.t-actions button{min-height:48px;padding:0 12px;border-radius:11px;font-size:15px;white-space:nowrap}
.t-pick{flex:1 1 auto;background:#0b0b0b;font-weight:700}
.t-open{background:#fff;color:var(--ink);font-weight:500;box-shadow:0 2px 4px rgba(0,0,0,.06)}
.t-open:hover{background:var(--grid)}
.t-foot{--dots:2.6em;row-gap:4px;margin:30px 0 0;font-size:14px;color:#142855}
.t-foot>span+span::before{color:var(--faint)}
.t-empty{max-width:720px}
@media (min-width:1300px){
 .t-leaves:has(.t-green){position:relative;z-index:2}
 .t-leaf.t-green{width:calc(100% + min(12vw,190px))}
}

@media (max-width:1280px){
 .t-head h1{font-size:52px}
 .t-board{grid-template-columns:minmax(0,24fr) minmax(0,18fr) minmax(0,25fr) minmax(0,27fr);column-gap:2%}
 .t-driver-cell{grid-column:2}.t-leaves{grid-column:3}.t-side,.t-decision-cell{grid-column:4}
 .t-leaf h4{font-size:14.5px}
 .t-old{font-size:24px}.t-new,.t-now{font-size:21px}.t-floor{font-size:15px}
 .t-amount{font-size:19px}
 .t-sticky{font-size:23px;width:150px;margin-left:24px}
}
@media (max-width:1100px){
 .t-head h1{line-height:1.22}
 .t-board{grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1.2fr);column-gap:28px}
 .t-root-cell{grid-column:1/-1;grid-row:auto !important;max-width:520px}
 .t-driver-cell{grid-column:1}.t-leaves{grid-column:2}.t-side{grid-column:3}.t-decision-cell{grid-column:3}
 .t-board{grid-template-rows:none !important}
 .t-board>div:not(.t-root-cell){grid-row:auto !important}
}
@media (max-width:760px){
 .t-head h1{font-size:34px;line-height:1.22}
 .t-head p{font-size:15px}
 .t-switch{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%;margin:0 0 4px;padding:4px;border-radius:10px}
 .t-switch button{min-width:0;font-size:14px;flex-direction:column;align-items:flex-start;gap:2px;padding:6px 12px}
 .t-switch img{display:none}
 .t-board{display:flex;flex-direction:column;align-items:stretch;gap:10px;padding:12px 0 0}
 .t-links{display:none}
 .t-root-cell{max-width:none}
 .t-card{overflow-wrap:anywhere}
 .t-new span{font-size:20px}
 .t-decision h3 span{display:block;margin:4px 0 0}
 .t-sparks-b{right:-20px}
 .t-driver-cell{margin-top:6px}
 .t-leaves,.t-side{margin-left:12px;padding-left:14px;border-left:2px dotted var(--magenta)}
 .t-side{gap:12px}
 .t-sticky{margin:6px 0 4px 40px;font-size:23px;width:auto;max-width:200px}
 .t-exception{width:auto}
 .t-decision-cell{margin-top:6px}
 .t-actions button{flex:1 1 100%}
 .t-old{font-size:24px}.t-new,.t-now{font-size:22px}.t-floor{font-size:15px}
 .t-driver{padding:12px 44px 12px 16px}
 .t-driver h3{font-size:19px}.t-amount{font-size:21px}
 .t-leaf{padding-right:38px}
 .t-foot{flex-direction:column;font-size:13px;margin-top:18px}
}
`
