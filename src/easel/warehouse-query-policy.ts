// Conservative warehouse query policy. Unknown syntax and functions stay local.
// Databricks accepts the intersection of parsed Spark SQL and the Hive SELECT
// grammar; vendor extensions outside that intersection require a policy review.
import { Parser as SnowflakeParser } from 'node-sql-parser/build/snowflake.js'
import { Parser as BigQueryParser } from 'node-sql-parser/build/bigquery.js'
import { Parser as HiveParser } from 'node-sql-parser/build/hive.js'
import { SparkSQL } from 'dt-sql-parser/dist/parser/spark/index.js'
import { requireThat, text, type Data } from './types'
import type { Warehouse } from './warehouse-provider'

const parsers = { snowflake: new SnowflakeParser(), bigquery: new BigQueryParser(), databricks: new HiveParser() }
const spark = new SparkSQL()
const functions = new Set('ABS AVG CEIL CEILING COALESCE CONCAT COUNT DATE DATE_FORMAT DATE_TRUNC EXTRACT FLOOR FORMAT_DATE IF IFNULL IFF LEFT LENGTH LOWER LTRIM MAX MIN NULLIF REGEXP_REPLACE REPLACE RIGHT ROUND RTRIM SUBSTR SUBSTRING SUM TO_CHAR TO_DATE TRIM TRUNC UPPER YEAR MONTH DAY'.split(' '))
const nodes = new Set('select expr column_ref function aggr_func cast expr_list binary_expr unary_expr number bool null default origin star single_quote_string double_quote_string string backticks_quote_string case when else interval extract date timestamp ASC DESC'.split(' '))
const prohibited = /\b(insert|update|delete|merge|drop|create|alter|truncate|grant|revoke|into|copy|call|execute|exec|export|load|unload|put|get|remove|use|set|reset|begin|commit|rollback|attach|detach|vacuum|pragma|lock|unlock)\b/i

// Strip quoted tokens only for the keyword check. The dialect parser still sees
// every original byte and must consume the entire statement without recovery.
function unquoted(sql: string) {
 let out = ''
 for (let i = 0; i < sql.length; i++) {
  const c = sql[i]
  if (c === "'" || c === '"' || c === '`') {
   const quote = c; out += ' '
   for (i++; i < sql.length; i++) {
    if (sql[i] === '\\') { i++; continue }
    if (sql[i] === quote) { if (sql[i + 1] === quote) { i++; continue } break }
   }
  } else {
   requireThat(!(c === ';' || (c === '-' && sql[i + 1] === '-') || (c === '/' && sql[i + 1] === '*') || c === '#'), 'Use one SELECT without comments or second statements')
   out += c
  }
 }
 return out
}

function inspect(node: unknown): void {
 if (!node || typeof node !== 'object') return
 if (Array.isArray(node)) { node.forEach(inspect); return }
 const n = node as Data
 requireThat(!n.type || nodes.has(n.type), 'This query form is not supported; use a read-only SELECT')
 if (n.type === 'select') {
  requireThat(!n.into || Object.values(n.into).every(v => v === null), 'SELECT INTO is refused')
  requireThat(!n.locking_read && !n.for_update, 'Locking reads are refused')
  for (const source of n.from ?? []) {
   // Only named relations and parsed subqueries; no file, stage or table functions.
   requireThat((typeof source.table === 'string' && !/[@$/:\\]/.test(source.table) && !/[@$/:\\]/.test(source.db ?? '')) || source.expr?.ast?.type === 'select', 'Use named warehouse tables or SELECT subqueries')
  }
 }
 if (n.type === 'function' || n.type === 'aggr_func') {
  const parts = typeof n.name === 'string' ? [n.name] : n.name?.schema && !n.name?.name?.length ? [n.name.schema.value] : !n.name?.schema ? n.name?.name?.map((p: Data) => p.value) : []
  requireThat(parts?.length === 1 && functions.has(String(parts[0]).toUpperCase()), 'This function is not supported in a read-only metric query')
 }
 for (const value of Object.values(n)) inspect(value)
}

export function readOnlyQuery(raw: unknown, warehouse: Warehouse): string {
 const sql = text(raw, 'Query', 8000).replace(/;\s*$/, '')
 const keywords = unquoted(sql)
 requireThat(/^(select|with)\b/i.test(keywords.trim()) && !prohibited.test(keywords), 'The query may only read: use one SELECT without writes, DDL or session commands')
 let ast: unknown
 try {
  if (warehouse === 'databricks') requireThat(spark.validate(sql).length === 0, 'Unsupported Spark SQL')
  ast = parsers[warehouse].astify(sql)
 } catch { requireThat(false, 'The query could not be parsed for this warehouse; use a supported single SELECT') }
 if (Array.isArray(ast)) { requireThat(ast.length === 1, 'Use one SELECT statement'); ast = ast[0] }
 requireThat((ast as Data)?.type === 'select', 'Use one SELECT statement')
 inspect(ast)
 return sql
}
