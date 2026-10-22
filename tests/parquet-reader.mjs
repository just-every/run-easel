// A small independent Parquet reader for flat files written with PLAIN
// encoding and no compression: enough to prove drops carry the dataset's rows.
export function readParquet(bytes) {
 const buf = Buffer.from(bytes)
 if (buf.subarray(0, 4).toString() !== 'PAR1' || buf.subarray(-4).toString() !== 'PAR1') throw new Error('Not a Parquet file')
 const footerLength = buf.readUInt32LE(buf.length - 8)
 const meta = new Compact(buf.subarray(buf.length - 8 - footerLength, buf.length - 8)).struct()
 const schema = meta[2].slice(1).map(e => ({ name: e[4].toString(), type: e[1] === 6 ? 'string' : 'int64', optional: e[3] === 1 }))
 const rows = Array.from({ length: Number(meta[3]) }, () => [])
 for (const chunk of meta[4][0][1]) {
  const column = schema[meta[4][0][1].indexOf(chunk)], offset = Number(chunk[3][9])
  const reader = new Compact(buf.subarray(offset)), page = reader.struct(), size = page[3], start = offset + reader.at
  let at = start, defined = rows.map(() => true)
  const values = Number(page[5][1])
  if (column.optional) {
   const length = buf.readUInt32LE(at); at += 4
   const levels = buf.subarray(at, at + length), header = new Compact(levels); const groups = header.varint() >> 1
   defined = Array.from({ length: values }, (_, i) => (levels[header.at + (i >> 3)] >> (i & 7)) & 1 ? true : false)
   void groups; at += length
  }
  for (let i = 0; i < values; i++) {
   if (!defined[i]) { rows[i].push(null); continue }
   if (column.type === 'string') { const n = buf.readUInt32LE(at); rows[i].push(buf.subarray(at + 4, at + 4 + n).toString()); at += 4 + n }
   else { rows[i].push(Number(buf.readBigInt64LE(at))); at += 8 }
  }
  void size
 }
 return { columns: schema.map(c => c.name), rows }
}

class Compact {
 constructor(buf) { this.buf = buf; this.at = 0 }
 byte() { return this.buf[this.at++] }
 varint() { let n = 0n, shift = 0n; for (;;) { const b = this.byte(); n |= BigInt(b & 0x7f) << shift; if (!(b & 0x80)) return Number(n); shift += 7n } }
 zigzag() { const n = BigInt(this.varint()); return Number((n >> 1n) ^ -(n & 1n)) }
 value(type) {
  if (type === 1) return true; if (type === 2) return false
  if (type === 3) return this.byte()
  if (type === 4 || type === 5 || type === 6) return this.zigzag()
  if (type === 8) { const n = this.varint(); const out = this.buf.subarray(this.at, this.at + n); this.at += n; return out }
  if (type === 9) { const head = this.byte(), size = head >> 4 === 15 ? this.varint() : head >> 4, element = head & 15; return Array.from({ length: size }, () => this.value(element)) }
  if (type === 12) return this.struct()
  throw new Error(`Unsupported Thrift type ${type}`)
 }
 struct() {
  const out = {}; let id = 0
  for (;;) {
   const head = this.byte(); if (head === 0) return out
   const type = head & 15, delta = head >> 4
   id = delta ? id + delta : this.zigzag()
   out[id] = this.value(type)
  }
 }
}
