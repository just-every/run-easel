// Easel's tokens, defined once for the app (style.ts) and the run site (src/site/pages.tsx). The colours Base's
// frames also need (page, surface, ink, muted, focus) come from public/rer-theme.css, so each value lives in one
// place. The look is the owner's pick: a crisp white page on a faint square grid, heavy black Inter headings, white
// hairline cards with soft shadows, magenta → gold only on the active tab, green for the picked plan and done, red
// only for the floor, the exception and the gap, amber for a hypothesis or a difference to explain. The run site keeps
// its own type and corners (--font, --radius-control, --radius-card); the app sets in Inter with rounder fields.
export const tokens = `:root{
--paper:var(--rer-page);--surface:var(--rer-surface);--ink:var(--rer-text);--muted:var(--rer-muted);--focus:var(--rer-focus);
--text:#2b2a2e;--faint:#8a8d97;--rule:#e7e7ec;--border:#d9d9e0;--hair-strong:#d9d9e0;--field:var(--rer-border);--grid:#f1f1f4;
--magenta:#f30270;--gold:#fdc50a;--glow:linear-gradient(100deg,#f30270 0%,#ff3d4f 30%,#ff7417 62%,#fdc50a 100%);
--green:#17924a;--green-ink:#0f7a3c;--green-soft:#e3f6ea;--green-line:#b6e2c4;
--red:#e1251b;--red-ink:#c41a12;--red-soft:#fde8e6;--amber:#9a5c00;--amber-soft:#fff1d2;--amber-line:#f6d58f;
--sticky:#fff2a1;--pink-soft:#fde3ee;
--font:var(--rer-font-body);--radius-control:4px;--radius-card:6px;
--sans:Inter,system-ui,sans-serif;--display:Inter,system-ui,sans-serif;--hand:Caveat,cursive;
--radius-field:10px;--radius-panel:14px;--shadow:0 1px 2px rgba(18,16,16,.05),0 12px 28px -16px rgba(18,16,16,.22);
--graph-paper:linear-gradient(var(--grid) 1px,transparent 1px) 0 0/56px 56px,linear-gradient(90deg,var(--grid) 1px,transparent 1px) 0 0/56px 56px}
`
