/** Display date-only values without a UTC/local date shift; transport stays ISO. */
export function usDate(value?: string | null, format = 'MM/DD/YYYY'): string {
 if (!value) return '—'
 const match = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(value)
 if (!match) return value
 const day = format === 'YYYY-MM-DD' ? `${match[1]}-${match[2]}-${match[3]}` : format === 'DD/MM/YYYY' ? `${match[3]}/${match[2]}/${match[1]}` : `${match[2]}/${match[3]}/${match[1]}`
 return `${day}${match[4] ? ' ' + match[4].replace(/^T/, '').replace(/\.\d+Z$/, ' UTC').replace(/Z$/, ' UTC') : ''}`
}
