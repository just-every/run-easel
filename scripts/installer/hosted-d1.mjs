import { RerError } from '@runeditrun/rer/errors';

/** D1's query endpoint accepts a transactional batch. Never split a batch or
 * retry an ambiguous write: Base owns publication and its acknowledgement. */
export function hostedDatabase(api, id) {
 const statements = new WeakMap();
 const fail = () => new RerError('transfer_failed', 'Hosted database query failed. No provider response or application data is included in this diagnostic.', 1);
 const binding = value => {
  if (value instanceof ArrayBuffer) return [...new Uint8Array(value)];
  if (ArrayBuffer.isView(value)) return [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)];
  if (value === null || typeof value === 'string' || typeof value === 'number' && Number.isFinite(value)) return value;
  throw fail();
 };
 const execute = async queries => {
  if (!queries.length) return [];
  try {
   const rows = await api.request(`/d1/database/${id}/query`, {
    method: 'POST', body: queries.length === 1 ? queries[0] : { batch: queries },
   });
   if (!Array.isArray(rows) || rows.length !== queries.length || rows.some(row => row?.success !== true || !Array.isArray(row.results))) throw fail();
   return rows;
  } catch { throw fail(); }
 };
 const prepare = (sql, params = []) => {
  const query = { sql, params: params.map(binding) };
  const statement = {
   bind: (...values) => prepare(sql, values),
   all: async () => (await execute([query]))[0],
   run: async () => (await execute([query]))[0],
   async first(column) {
    const row = (await this.all()).results[0];
    return row ? column === undefined ? row : row[column] : null;
   },
  };
  statements.set(statement, query);
  return statement;
 };
 return { prepare, batch: members => execute(members.map(member => {
  const query = statements.get(member);
  if (!query) throw fail();
  return query;
 })) };
}
