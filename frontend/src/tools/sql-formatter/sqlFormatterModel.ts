import { format, type KeywordCase, type SqlLanguage } from 'sql-formatter'

export const MAX_SQL_BYTES = 2 * 1024 * 1024

export type SqlIndent = 'tab' | '2' | '4'
export type SqlLogicalNewline = 'before' | 'after'

export interface SqlFormatSettings {
  dialect: SqlLanguage
  indent: SqlIndent
  keywordCase: KeywordCase
  logicalOperatorNewline: SqlLogicalNewline
  denseOperators: boolean
  linesBetweenQueries: 1 | 2
}

export interface SqlDiagnostic {
  line: number
  column: number
}

export class SqlFormattingError extends Error {
  constructor(message: string, readonly diagnostic?: SqlDiagnostic) {
    super(message)
    this.name = 'SqlFormattingError'
  }
}

export interface SqlDialectDefinition {
  id: SqlLanguage
  label: string
  group: 'common' | 'data'
}

export const SQL_DIALECTS: readonly SqlDialectDefinition[] = Object.freeze([
  { id: 'mysql', label: 'MySQL', group: 'common' },
  { id: 'postgresql', label: 'PostgreSQL', group: 'common' },
  { id: 'transactsql', label: 'SQL Server', group: 'common' },
  { id: 'plsql', label: 'Oracle PL/SQL', group: 'common' },
  { id: 'sqlite', label: 'SQLite', group: 'common' },
  { id: 'mariadb', label: 'MariaDB', group: 'common' },
  { id: 'sql', label: '标准 SQL', group: 'common' },
  { id: 'tidb', label: 'TiDB', group: 'data' },
  { id: 'clickhouse', label: 'ClickHouse', group: 'data' },
  { id: 'bigquery', label: 'BigQuery', group: 'data' },
  { id: 'snowflake', label: 'Snowflake', group: 'data' },
  { id: 'redshift', label: 'Amazon Redshift', group: 'data' },
  { id: 'spark', label: 'Spark SQL', group: 'data' },
  { id: 'hive', label: 'Apache Hive', group: 'data' },
  { id: 'trino', label: 'Trino / Presto', group: 'data' },
  { id: 'duckdb', label: 'DuckDB', group: 'data' },
  { id: 'singlestoredb', label: 'SingleStoreDB', group: 'data' },
  { id: 'db2', label: 'IBM DB2', group: 'data' },
  { id: 'db2i', label: 'IBM DB2i', group: 'data' },
  { id: 'n1ql', label: 'Couchbase N1QL', group: 'data' },
])

const DIALECT_MAP = new Map(SQL_DIALECTS.map((dialect) => [dialect.id, dialect]))

const DIALECT_SAMPLES: Partial<Record<SqlLanguage, string>> = {
  mysql: "select u.id,u.name,count(o.id) order_count from users u left join orders o on o.user_id=u.id where u.status='active' and o.created_at>=date_sub(now(),interval 30 day) group by u.id,u.name order by order_count desc limit 20;",
  postgresql: "select u.id,u.email,jsonb_agg(e.payload order by e.created_at desc) as events from users u join audit_events e on e.user_id=u.id where e.payload->>'type'='login' and e.created_at>=now()-interval '7 days' group by u.id,u.email order by u.id;",
  transactsql: "select top (20) u.[id],u.[name],count(o.[id]) as order_count from [dbo].[users] u left join [dbo].[orders] o on o.[user_id]=u.[id] where u.[status]=N'active' group by u.[id],u.[name] order by order_count desc;",
  plsql: "select department_id,count(*) as employee_count,sum(salary) as total_salary from employees where hire_date>=add_months(sysdate,-12) group by department_id having count(*)>3 order by total_salary desc;",
  bigquery: "select user_id,array_agg(struct(event_name,event_timestamp) order by event_timestamp desc limit 5) recent_events from `analytics.events_*` where _table_suffix between '20260901' and '20260911' group by user_id;",
  clickhouse: "select toStartOfHour(event_time) hour,countIf(status='ok') ok_count,quantile(0.95)(duration_ms) p95 from events where event_date=today() group by hour order by hour desc limit 24;",
  sqlite: "select c.name,count(t.id) task_count from categories c left join tasks t on t.category_id=c.id and t.completed=0 group by c.id,c.name order by task_count desc;",
}

export function formatSqlDocument(source: string, settings: SqlFormatSettings): string {
  assertSqlSize(source)
  if (!source.trim()) throw new SqlFormattingError('请输入需要格式化的 SQL')
  try {
    return format(source, {
      language: settings.dialect,
      tabWidth: settings.indent === 'tab' ? 2 : Number(settings.indent),
      useTabs: settings.indent === 'tab',
      keywordCase: settings.keywordCase,
      dataTypeCase: settings.keywordCase,
      functionCase: 'preserve',
      logicalOperatorNewline: settings.logicalOperatorNewline,
      linesBetweenQueries: settings.linesBetweenQueries,
      denseOperators: settings.denseOperators,
      expressionWidth: 50,
      newlineBeforeSemicolon: false,
    })
  } catch (error) {
    throw normalizeFormattingError(error)
  }
}

export function compactSqlDocument(source: string, settings: SqlFormatSettings): string {
  return compactFormattedSql(formatSqlDocument(source, settings))
}

export function getSqlDialect(id: SqlLanguage): SqlDialectDefinition {
  const dialect = DIALECT_MAP.get(id)
  if (!dialect) {
    throw new Error(`未配置的 SQL 方言：${id}`)
  }
  return dialect
}

export function getSqlSample(dialect: SqlLanguage): string {
  return DIALECT_SAMPLES[dialect] ?? DIALECT_SAMPLES.mysql ?? 'SELECT 1;'
}

export function getSqlDiagnosticOffset(source: string, diagnostic: SqlDiagnostic): number {
  const lines = source.split('\n')
  const lineIndex = Math.max(0, Math.min(lines.length - 1, diagnostic.line - 1))
  let offset = 0
  for (let index = 0; index < lineIndex; index += 1) offset += (lines[index]?.length ?? 0) + 1
  return Math.min(source.length, offset + Math.max(0, diagnostic.column - 1))
}

export function formatSqlBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function describeSqlSizeChange(sourceBytes: number, outputBytes: number): string {
  if (sourceBytes <= 0) return ''
  if (outputBytes === sourceBytes) return '大小不变'

  const percent = Math.max(
    1,
    Math.round((Math.abs(outputBytes - sourceBytes) / sourceBytes) * 100),
  )
  return outputBytes < sourceBytes ? `减少 ${percent}%` : `增加 ${percent}%`
}

function assertSqlSize(source: string) {
  const bytes = new TextEncoder().encode(source).length
  if (bytes > MAX_SQL_BYTES) throw new SqlFormattingError(`SQL 超过 ${formatSqlBytes(MAX_SQL_BYTES)} 的处理上限`)
}

function normalizeFormattingError(error: unknown): SqlFormattingError {
  const original = error instanceof Error ? error.message : 'SQL 格式化失败'
  const location = original.match(/at line\s+(\d+)\s+column\s+(\d+)/i)
  const detail = original.split('\n')[0]?.replace(/^Parse error:\s*/i, '') || 'SQL 语法无法解析'
  return new SqlFormattingError(
    `SQL 语法无法解析：${detail}`,
    location ? { line: Number(location[1]), column: Number(location[2]) } : undefined,
  )
}

function compactFormattedSql(source: string): string {
  let output = ''
  let index = 0
  let pendingSpace = false

  const flushSpace = (next: string) => {
    const previous = output.at(-1) ?? ''
    if (pendingSpace && previous && !/[\s([.,]/.test(previous) && !/[),.;]/.test(next)) output += ' '
    pendingSpace = false
  }

  while (index < source.length) {
    const current = source[index] ?? ''
    const next = source[index + 1] ?? ''

    if (/\s/.test(current)) {
      pendingSpace = true
      index += 1
      continue
    }

    if (current === '-' && next === '-') {
      flushSpace(current)
      const lineEnd = source.indexOf('\n', index)
      const end = lineEnd === -1 ? source.length : lineEnd
      output += source.slice(index, end).trimEnd()
      if (lineEnd !== -1) output += '\n'
      pendingSpace = false
      index = lineEnd === -1 ? source.length : lineEnd + 1
      continue
    }

    if (current === '/' && next === '*') {
      flushSpace(current)
      const close = source.indexOf('*/', index + 2)
      const end = close === -1 ? source.length : close + 2
      output += source.slice(index, end)
      pendingSpace = true
      index = end
      continue
    }

    const dollarTag = current === '$' ? source.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0] : undefined
    if (dollarTag) {
      flushSpace(current)
      const close = source.indexOf(dollarTag, index + dollarTag.length)
      const end = close === -1 ? source.length : close + dollarTag.length
      output += source.slice(index, end)
      index = end
      continue
    }

    if (current === "'" || current === '"' || current === '`' || current === '[') {
      flushSpace(current)
      const closing = current === '[' ? ']' : current
      output += current
      index += 1
      while (index < source.length) {
        const quoted = source[index] ?? ''
        output += quoted
        index += 1
        if (quoted === '\\' && current !== '[' && index < source.length) {
          output += source[index] ?? ''
          index += 1
        } else if (quoted === closing) {
          if (source[index] === closing) {
            output += closing
            index += 1
          } else break
        }
      }
      continue
    }

    flushSpace(current)
    output += current
    index += 1
  }

  return output.trim()
}
