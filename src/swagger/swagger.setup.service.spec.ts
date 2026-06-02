import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * Regression tests — gateway-foundation lint-test
 *
 * REG-1: swagger-ui-dist must be explicitly declared in package.json dependencies.
 *        Protects against transient resolution disappearing on a clean install.
 *
 * REG-2: SwaggerSetupService must be importable without a module-resolution
 *        error for swagger-ui-dist; the import at the top of the file
 *        (line 5) must resolve regardless of transitive dependency ordering.
 */

describe('SwaggerSetupService — regression: swagger-ui-dist package declaration', () => {
  let packageJson: Record<string, unknown>;

  beforeAll(() => {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<
      string,
      unknown
    >;
  });

  it('REG-1: swagger-ui-dist is explicitly listed in package.json dependencies', () => {
    // The package is used via a static top-level import in
    // src/swagger/swagger.setup.service.ts. If it is only available as a
    // transitive dependency it may disappear after a clean install, breaking
    // both lint (type-checked ESLint) and any test that loads AppModule.
    const dependencies = packageJson['dependencies'] as
      | Record<string, string>
      | undefined;

    expect(dependencies).toBeDefined();
    expect(Object.keys(dependencies ?? {})).toContain('swagger-ui-dist');
  });

  it('REG-2: swagger-ui-dist resolves and exposes getAbsoluteFSPath (module load contract)', () => {
    // Simulate the exact import used in swagger.setup.service.ts line 5:
    //   import * as swaggerUiDist from 'swagger-ui-dist';
    // Then exercises the only public API called inside buildHtml() lines 44-46.
    // If the package were absent from node_modules this require() would throw
    // "Cannot find module 'swagger-ui-dist'" — identical to the Jest failure
    // described in the triage for app.module.scheduler.spec.ts (AC-14).

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const swaggerUiDist = require('swagger-ui-dist') as {
      getAbsoluteFSPath: () => string;
    };

    expect(typeof swaggerUiDist.getAbsoluteFSPath).toBe('function');

    const fsPath = swaggerUiDist.getAbsoluteFSPath();
    expect(typeof fsPath).toBe('string');
    expect(fsPath.length).toBeGreaterThan(0);

    // Verify the CSS asset used in buildHtml() is reachable at the resolved path.
    const cssPath = path.join(fsPath, 'swagger-ui.css');
    expect(fs.existsSync(cssPath)).toBe(true);
  });
});
