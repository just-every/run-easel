// Easel's tokens, defined once for the app (style.ts) and the run site (src/site/pages.tsx). The colours Base's
// frames also need (paper, surface, ink, muted, focus, the type) come from public/rer-theme.css, so each value lives
// in one place; claret, the warm surfaces and graph paper are Easel's own and appear only inside drawings and data.
export const tokens = `:root{
--paper:var(--rer-page);--surface:var(--rer-surface);--ink:var(--rer-text);--muted:var(--rer-muted);--focus:var(--rer-focus);
--surface-warm:#f8f6ee;--rule:#e3e2dc;--border:#cfccc3;--grid:#ece8de;
--claret:#8c1a1f;--claret-tint:#f4e7e0;--danger:var(--claret);
--font:var(--rer-font-body);--radius-control:4px;--radius-card:6px;
--graph-paper:linear-gradient(var(--grid) 1px,transparent 1px) 0 0/24px 24px,linear-gradient(90deg,var(--grid) 1px,transparent 1px) 0 0/24px 24px}
`
