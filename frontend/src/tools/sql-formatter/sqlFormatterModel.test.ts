import { describe, expect, it } from 'vitest'
import {
  SQL_DIALECTS,
  SqlFormattingError,
  compactSqlDocument,
  describeSqlSizeChange,
  formatSqlDocument,
  getSqlDiagnosticOffset,
  type SqlFormatSettings,
} from './sqlFormatterModel'

const settings: SqlFormatSettings = {
  dialect: 'mysql',
  indent: 'tab',
  keywordCase: 'upper',
  logicalOperatorNewline: 'before',
  denseOperators: false,
  linesBetweenQueries: 1,
}

describe('sqlFormatterModel', () => {
  it('formats MySQL with tabs and uppercase keywords', () => {
    const result = formatSqlDocument('select u.id,u.name from `users` u where u.active=1 and u.role="admin";', settings)
    expect(result).toContain('SELECT')
    expect(result).toContain('\n\tu.name')
    expect(result).toContain('FROM\n\t`users`')
  })

  it('supports PostgreSQL and SQL Server syntax', () => {
    const postgres = formatSqlDocument("select payload->>'type' from events where id=$1::bigint;", { ...settings, dialect: 'postgresql' })
    const sqlServer = formatSqlDocument('select top (5) [name] from [dbo].[users];', { ...settings, dialect: 'transactsql' })
    expect(postgres).toContain("payload ->> 'type'")
    expect(sqlServer).toContain('TOP (5)')
    expect(sqlServer).toContain('[dbo].[users]')
  })

  it('formats a basic query with every exposed dialect', () => {
    for (const dialect of SQL_DIALECTS) {
      const result = formatSqlDocument('select id,count(*) from users group by id;', {
        ...settings,
        dialect: dialect.id,
      })
      expect(result, dialect.id).toContain('SELECT')
    }
  })

  it('compacts layout without changing quoted whitespace or line-comment scope', () => {
    const compacted = compactSqlDocument("select 'a  b' as value -- keep\nfrom users where id = 1;", settings)
    expect(compacted).toContain("'a  b'")
    expect(compacted).toContain('-- keep\nFROM')
    expect(compacted.split('\n')).toHaveLength(2)
  })

  it('surfaces optional line and column diagnostics', () => {
    try {
      formatSqlDocument('select *\nfrom users\nwhere name = §;', settings)
      throw new Error('Expected SQL formatter to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(SqlFormattingError)
      const formattingError = error as SqlFormattingError
      expect(formattingError.diagnostic?.line).toBe(3)
      expect(getSqlDiagnosticOffset('select *\nfrom users\nwhere name = §;', formattingError.diagnostic!)).toBe(33)
    }
  })

  it('rejects empty input', () => {
    expect(() => formatSqlDocument('   ', settings)).toThrow('请输入')
  })

  it('describes output size changes without ambiguous negative percentages', () => {
    expect(describeSqlSizeChange(100, 80)).toBe('减少 20%')
    expect(describeSqlSizeChange(100, 125)).toBe('增加 25%')
    expect(describeSqlSizeChange(100, 100)).toBe('大小不变')
  })
})
