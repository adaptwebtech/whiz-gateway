import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations');

function migrationDirs(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

describe('Prisma migrations order & seed (AC-2)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('AC-2: create_tables migration precedes the seed migration which inserts the 3 fixed ambientes', () => {
    // Arrange
    const dirs = migrationDirs();
    const createDir = dirs.find((d) => /create_tables/.test(d));
    const seedDir = dirs.find((d) => /seed_ambientes/.test(d));

    // Assert — both migrations exist
    expect(createDir).toBeDefined();
    expect(seedDir).toBeDefined();

    // Assert — Prisma timestamp prefix orders create_tables before seed
    expect(String(createDir) < String(seedDir)).toBe(true);

    // Act — read seed SQL
    const seedSql = readFileSync(
      join(MIGRATIONS_DIR, String(seedDir), 'migration.sql'),
      'utf8',
    );

    // Assert — exactly 3 INSERTs with the §6 fixed rows
    const inserts = seedSql.match(/INSERT\s+INTO/gi) ?? [];
    expect(inserts.length).toBe(3);
    expect(seedSql).toContain('https://dev.2.whiz.net.br');
    expect(seedSql).toContain('https://staging.2.whiz.net.br');
    expect(seedSql).toContain('https://server.whiz.net.br');
    expect(seedSql).toContain('development');
    expect(seedSql).toContain('staging');
    expect(seedSql).toContain('production');
  });
});
