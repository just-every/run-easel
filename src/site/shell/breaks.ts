// Line-break care for the prose pages the site shares with Base (/run and /docs): a paragraph, item or heading never
// leaves its last word alone on a line, a hyphenated word or command token never splits at its hyphen, and a pipe stays
// with the command after it (the line breaks before "| sh", never after the pipe). Text nodes only; styles and scripts
// pass through untouched.
const NB = '\u00a0'

// The last two words of a block's (or a link's) text stay together, through any inline tags around the last word; a
// last word already tied to the one before it is left alone.
const INLINE = '(?:span|code|a|strong|em)'
const lastWords = (html: string) => html.replace(new RegExp(` ((?:<${INLINE}[^>]*>)*[^\\s<>]+(?:<\\/${INLINE}>)*[.,:;!?]?\\s*<\\/(?:p|li|h[1-6]|dd|td|th|figcaption|a)>)`, 'g'), `${NB}$1`)

// "checksum-verified", "just-every/run-easel", "-fsSL": kept whole wherever they fall.
const nowrap = (text: string) => `<span style="white-space:nowrap">${text}</span>`
const hyphens = (text: string) => text.replace(/(^|[\s(])([^\s<>()]*[\w.]-+[\w./@-]*|--?[\w-]*)/g, (_, lead: string, token: string) => lead + nowrap(token))

export function breaks(html: string) {
 const body = html.indexOf('<body')
 return html.slice(0, body) + lastWords(html.slice(body).split(/(<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<[^>]+>)/).map(part =>
  part.startsWith('<') ? part : hyphens(part.replace(/ (→) /g, `${NB}$1${NB}`)).replace(/ \| (\S+)/g, (_, next: string) => ` ${nowrap(`| ${next}`)}`),
 ).join(''))
}
