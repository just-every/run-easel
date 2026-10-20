// Line-break care for the homepage's text: a time stays with its am/pm, a date with its weekday and month, a number with
// its unit, an arrow with both sides, and a "·" with the word before it, so no line starts with a separator or an arrow
// and no figure splits from its unit. Applied to the rendered page's text nodes only, never to styles.
const NB = '\u00a0', WJ = '\u2060'
const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'
const rules: [RegExp, string][] = [
 [new RegExp(`\\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (${MONTH}) (\\d{1,2})\\b`, 'g'), `$1${NB}$2${NB}$3`],
 [new RegExp(`\\b(${MONTH}) (\\d{1,4})\\b`, 'g'), `$1${NB}$2`],
 [/\b(Q[1-4]) (\d{4})\b/g, `$1${NB}$2`],
 [/, (\d{4})\b/g, `,${NB}$1`],
 [/(\d[\d,.]*%?) (?=(?:am|pm|months?|a|weeks?|days?|cells?|people|accounts?|positions|transactions|departments|lines|hires|sales|items|responses|of|K|M|matched|unplanned|salaries|executives?|starts|statements|new|planned|ahead|late)\b)/g, `$1${NB}`],
 [/ (→|↗|=) /g, `${NB}$1${NB}`],
 [/ – /g, `${NB}–${WJ}${NB}`],
 [/ (→|↗)(?=[<\s]|$)/g, `${NB}$1`],
 [/ · /g, `${NB}· `],
 [/ ✓/g, `${NB}✓`],
]

// A title never leaves one word alone on its last line: its last two words are kept together.
const lastTwo = (inner: string) => inner.replace(/ (?=[^ <>]*(?:<[^>]*>[^ <>]*)*$)/, NB)
const titles = (html: string) => html.replace(/(<h3[^>]*>)([\s\S]*?)(<\/h3>)|(<span class="h-(?:ink|glow)">)([^<]*)(<\/span>)/g, (_, a, b, c, d, e, f) => a ? a + lastTwo(b) + c : d + lastTwo(e) + f)

export function tie(html: string) {
 return titles(html.replace(/ (<span[^>]*>(?:✓|→))/g, `${NB}$1`).split(/(<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<code[\s\S]*?<\/code>)/).map(part =>
  /^<(style|script|code)/.test(part) ? part : part.replace(/>([^<]+)</g, (_, text: string) => `>${rules.reduce((t, [pattern, to]) => t.replace(pattern, to), text)}<`),
 ).join(''))
}
