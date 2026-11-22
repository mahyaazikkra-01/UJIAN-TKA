declare module 'node:sqlite' {
  export interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export class StatementSync {
    all(...namedParameters: unknown[]): Record<string, unknown>[];
    get(...namedParameters: unknown[]): Record<string, unknown> | undefined;
    run(...namedParameters: unknown[]): StatementResultingChanges;
  }

  export class DatabaseSync {
    constructor(location: string, options?: { open?: boolean; readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
