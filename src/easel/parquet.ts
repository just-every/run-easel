// REPORT-007: a minimal Apache Parquet writer for flat tabular datasets: one
// row group, one data page per column, PLAIN encoding, no compression, UTF-8
// strings, int64 amounts and optional (nullable) columns with RLE/bit-packed
// definition levels. The bytes depend only on the rows.
const encoder = new TextEncoder()
export type ParquetColumn = { name: string; type: 'string' | 'int64'; optional?: boolean }
export type ParquetValue = string | number | null

/** Thrift compact protocol: just the writers Parquet's metadata structs need. */
class Thrift {
 out: number[] = []
 private last: number[] = [0]
 varint(n: number | bigint) { let v = BigInt(n); while (v >= 0x80n) { this.out.push(Number(v & 0x7fn) | 0x80); v >>= 7n } this.out.push(Number(v)) }
 private zigzag(n: number) { return (BigInt(n) << 1n) ^ (BigInt(n) >> 63n) }
 private field(id: number, type: number) { const delta = id - this.last[this.last.length - 1]; if (delta > 0 && delta <= 15) this.out.push((delta << 4) | type); else { this.out.push(type); this.varint(this.zigzag(id)) } this.last[this.last.length - 1] = id }
 i32(id: number, n: number) { this.field(id, 5); this.varint(this.zigzag(n)) }
 i64(id: number, n: number) { this.field(id, 6); this.varint(this.zigzag(n)) }
 str(id: number, s: string) { this.field(id, 8); this.bytes(encoder.encode(s)) }
 bytes(b: Uint8Array) { this.varint(b.length); this.out.push(...b) }
 list(id: number, elementType: number, size: number) { this.field(id, 9); if (size < 15) this.out.push((size << 4) | elementType); else { this.out.push(0xf0 | elementType); this.varint(size) } }
 /** A struct as a field (id given) or as a list element (no id). */
 begin(id?: number) { if (id !== undefined) this.field(id, 12); this.last.push(0) }
 end() { this.out.push(0); this.last.pop() }
}
const BYTE_ARRAY = 6, INT64 = 2, PLAIN = 0, RLE = 3

export function parquetFile(columns: ParquetColumn[], rows: ParquetValue[][]): Uint8Array {
 const parts: Uint8Array[] = [encoder.encode('PAR1')]
 let offset = 4
 const chunks: { column: ParquetColumn; start: number; size: number }[] = []
 columns.forEach((column, index) => {
  const values = rows.map(r => r[index]), present = values.filter(v => v !== null)
  let data: Uint8Array
  if (column.type === 'string') {
   const encoded = present.map(v => encoder.encode(String(v)))
   data = new Uint8Array(encoded.reduce((n, b) => n + 4 + b.length, 0))
   const view = new DataView(data.buffer); let at = 0
   for (const b of encoded) { view.setUint32(at, b.length, true); data.set(b, at + 4); at += 4 + b.length }
  } else {
   data = new Uint8Array(present.length * 8)
   const view = new DataView(data.buffer)
   present.forEach((v, i) => view.setBigInt64(i * 8, BigInt(v as number), true))
  }
  let levels = new Uint8Array(0)
  if (column.optional) {
   const groups = Math.ceil(values.length / 8), packed = new Uint8Array(groups)
   values.forEach((v, i) => { if (v !== null) packed[i >> 3] |= 1 << (i & 7) })
   const head = new Thrift(); head.varint((groups << 1) | 1)
   const body = Uint8Array.from([...head.out, ...packed])
   levels = new Uint8Array(4 + body.length); new DataView(levels.buffer).setUint32(0, body.length, true); levels.set(body, 4)
  }
  const page = new Uint8Array(levels.length + data.length); page.set(levels); page.set(data, levels.length)
  const h = new Thrift()
  h.begin(); h.i32(1, 0); h.i32(2, page.length); h.i32(3, page.length)
  h.begin(5); h.i32(1, values.length); h.i32(2, PLAIN); h.i32(3, RLE); h.i32(4, RLE); h.end(); h.end()
  const header = Uint8Array.from(h.out)
  chunks.push({ column, start: offset, size: header.length + page.length })
  parts.push(header, page); offset += header.length + page.length
 })
 const m = new Thrift()
 m.begin(); m.i32(1, 1)
 m.list(2, 12, columns.length + 1)
 m.begin(); m.str(4, 'schema'); m.i32(5, columns.length); m.end()
 for (const c of columns) { m.begin(); m.i32(1, c.type === 'string' ? BYTE_ARRAY : INT64); m.i32(3, c.optional ? 1 : 0); m.str(4, c.name); if (c.type === 'string') m.i32(6, 0); m.end() }
 m.i64(3, rows.length)
 m.list(4, 12, 1)
 m.begin(); m.list(1, 12, chunks.length)
 for (const ch of chunks) {
  m.begin(); m.i64(2, ch.start)
  m.begin(3); m.i32(1, ch.column.type === 'string' ? BYTE_ARRAY : INT64)
  m.list(2, 5, 2); m.varint(BigInt(PLAIN) << 1n); m.varint(BigInt(RLE) << 1n)
  m.list(3, 8, 1); m.bytes(encoder.encode(ch.column.name))
  m.i32(4, 0); m.i64(5, rows.length); m.i64(6, ch.size); m.i64(7, ch.size); m.i64(9, ch.start)
  m.end(); m.end()
 }
 m.i64(2, chunks.reduce((n, c) => n + c.size, 0)); m.i64(3, rows.length); m.end()
 m.str(6, 'easel-parquet-1'); m.end()
 const footer = Uint8Array.from(m.out), tail = new Uint8Array(8)
 new DataView(tail.buffer).setUint32(0, footer.length, true); tail.set(encoder.encode('PAR1'), 4)
 const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0) + footer.length + tail.length)
 let at = 0
 for (const p of [...parts, footer, tail]) { out.set(p, at); at += p.length }
 return out
}
