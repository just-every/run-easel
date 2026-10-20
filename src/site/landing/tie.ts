// Line-break care for the homepage's text: a time stays with its am/pm, a date with its weekday and month, a number with
// its unit, a range with both ends, an arrow with both sides, and a "·" with the word before it, so no line starts with
// a separator or an arrow and no figure splits from its unit (runs of facts use `Dots`, which drops the separator). Applied to the rendered page's text nodes only, never to styles.
const NB = '\u00a0', WJ = '\u2060'
const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'
const rules: [RegExp, string][] = [
 [new RegExp(`\\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[ ${NB}](${MONTH})[ ${NB}](\\d{1,2})\\b`, 'g'), `$1${NB}$2${NB}$3`],
 [new RegExp(`\\b(${MONTH}) (\\d{1,4})\\b`, 'g'), `$1${NB}$2`],
 [/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (\d{1,2}:\d{2})/g, `$1${NB}$2`],
 [/\b(\d{4}) (Q[1-4])\b/g, `$1${NB}$2`],
 [/(\d)–(\d)/g, `$1–${WJ}$2`],
 [/ \((?=\$|[+−]?\d[\d.,]*%\))/g, `${NB}(`],
 [/\bMIT licensed/g, `MIT${NB}licensed`],
 [/\b(Q[1-4]) (\d{4})\b/g, `$1${NB}$2`],
 [/, (\d{4})\b/g, `,${NB}$1`],
 [/(\d[\d,.]*%?) (?=(?:am|pm|months?|a|weeks?|days?|cells?|people|accounts?|positions|transactions|departments|lines|hires|sales|items|responses|of|K|M|matched|unplanned|salaries|executives?|starts|statements|new|planned|ahead|late)\b)/g, `$1${NB}`],
 [/ (→|↗|=) /g, `${NB}$1${NB}`],
 [/ – /g, `${NB}–${WJ}${NB}`],
 [/ (→|↗)(?=[<\s]|$)/g, `${NB}$1`],
 [/ · /g, `${NB}· `],
 [/ ✓/g, `${NB}✓`],
 [/([−+])\$/g, `$1${WJ}$`],
]

// A title never leaves one word alone on its last line: its last two words are kept together.
const lastTwo = (inner: string) => inner.replace(/ (?=[^ <>]*(?:<[^>]*>[^ <>]*)*$)/, NB)
const titles = (html: string) => html.replace(/(<h3[^>]*>)([\s\S]*?)(<\/h3>)|(<span class="h-(?:ink|glow)">)([^<]*)(<\/span>)/g, (_, a, b, c, d, e, f) => a ? a + lastTwo(b) + c : d + lastTwo(e) + f)

// A tag (evidence, hypothesis) never wraps away from the word before it.
const tags = (html: string) => html.replace(/([\w$.,%)+−-]+)[ \u00a0](<span class="tag [^"]*">[^<]*<\/span>)/g, `<span class="nowrap">$1${NB}$2</span>`)

export function tie(html: string) {
 return tags(titles(html.replace(/ (<span[^>]*>(?:✓|→))/g, `${NB}$1`).split(/(<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<code[\s\S]*?<\/code>)/).map(part =>
  /^<(style|script|code)/.test(part) ? part : part.replace(/>([^<]+)</g, (_, text: string) => `>${rules.reduce((t, [pattern, to]) => t.replace(pattern, to), text)}<`),
 ).join('')))
}
