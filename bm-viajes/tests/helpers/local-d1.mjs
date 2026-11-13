import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// Execute the production SQL, including constraints and transactions. No SQL mocks.
// This adapter covers the D1 interface used by worker.mjs, not Cloudflare's runtime.
export function localD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../../backend/schema.sql', import.meta.url), 'utf8'));
  class Statement {
    constructor(sql, args = []) { this.sql = sql; this.args = args; }
    bind(...args) { return new Statement(this.sql, args); }
    async first() { return sqlite.prepare(this.sql).get(...this.args) ?? null; }
    async all() { return { results: sqlite.prepare(this.sql).all(...this.args), success: true }; }
    async run() {
      const result = sqlite.prepare(this.sql).run(...this.args);
      return { success: true, meta: { changes: Number(result.changes) } };
    }
  }
  return {
    prepare(sql) { return new Statement(sql); },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    close() { sqlite.close(); },
  };
}
