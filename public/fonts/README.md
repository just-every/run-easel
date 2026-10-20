# Fonts

IBM Plex Sans is self-hosted under the SIL Open Font License 1.1 in
`ibm-plex-sans/LICENSE.txt`. The Latin and Latin Extended variable-weight WOFF2
subsets come from Fontsource's `@fontsource-variable/ibm-plex-sans` 5.2.8;
upstream: https://github.com/IBM/plex. Plex has tabular figures, which keep
columns of money aligned (`font-variant-numeric: tabular-nums`).

IBM Plex Mono is self-hosted under the same SIL Open Font License in
`ibm-plex-mono/`. Its Latin 400 and 600 WOFF2 files are used only for docs
commands and inline code. The files are IBM Plex Mono v20 served by Google
Fonts; upstream: https://github.com/IBM/plex.

The root document links `/fonts/fonts.css` once and preloads only the primary
Latin file. Do not import this CSS from a component. Every body-font stack uses
`--font-body`; controls inherit it. No metric-matched fallback face is declared
yet: the owner's style pass may add one with the final brand font.

Inter (variable weight 100–900 and optical size) and Caveat (variable weight) are
self-hosted for the homepage under the SIL Open Font License 1.1, each with its
license beside it (`inter/LICENSE.txt`, `caveat/LICENSE.txt`). The WOFF2 files
come from Fontsource's `@fontsource-variable/inter` and
`@fontsource-variable/caveat` 5.3.0, the same files Chest ships. Inter sets the
homepage's heavy headings and card text (the browser picks the display cut from
the font size); Caveat is only for its handwriting, the sticky notes and margin
notes. Upstream: https://github.com/rsms/inter and
https://github.com/googlefonts/caveat.
