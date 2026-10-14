/** Activity rows stack into labelled lines on phones instead of scrolling sideways. */
export const activityStyle = `
@media(max-width:760px){
 .activity-log thead{display:none}
 .activity-log caption{display:block}
 .activity-log,.activity-log tbody,.activity-log tr{display:block}
 .activity-log tr{padding:12px 0;border-bottom:1px solid var(--rule)}
 .table-scroll .activity-log td,.table-scroll .activity-log td:first-child{display:grid;grid-template-columns:76px minmax(0,1fr);gap:8px;position:static;width:auto;min-width:0;max-width:none;padding:3px 0;border:0;box-shadow:none;background:none;white-space:normal;overflow-wrap:anywhere}
 .activity-log td::before{content:attr(data-label);color:var(--muted);font-size:13px}
 .activity-log td.wrap{min-width:0}
}
`
