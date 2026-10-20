// Line-break care for the prose pages the site shares with Base (/run and /docs): a paragraph, item or heading never
// leaves its last word alone on a line, a hyphenated word or command token never splits at its hyphen, and a pipe stays
// with the command after it. Text nodes only; styles and scripts pass through untouched.
const NB = '\u00a0'

// The last two words of a block's text stay together.
const lastWords = (html: string) => html.replace(/ ([^ <>]+)(\s*<\/(?:p|li|h[1-6]|dd|td|th|figcaption)>)/g, `${NB}$1$2`)

// "checksum-verified", "just-every/run-easel", "-fsSL": kept whole wherever they fall.
const hyphens = (text: string) => text.replace(/(^|[\s(])([^\s<>()]*[\w.]-+[\w./@-]*|--?[\w][\w-]*)/g, (_, lead: string, token: string) => `${lead}<span style="white-space:nowrap">${token}</span>`)

export function breaks(html: string) {
 const body = html.indexOf('<body')
 return html.slice(0, body) + lastWords(html.slice(body).split(/(<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<[^>]+>)/).map(part =>
  part.startsWith('<') ? part : hyphens(part.replace(/ \| /g, ` |${NB}`).replace(/ (→) /g, `${NB}$1${NB}`)),
 ).join(''))
}
