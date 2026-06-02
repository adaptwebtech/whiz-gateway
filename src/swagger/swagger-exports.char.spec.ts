/**
 * Characterization tests — freeze current exported values of
 * swagger.constants.ts before the split-interfaces-constants refactor.
 *
 * These tests MUST be GREEN before and after the refactor.
 * After the refactor, only the import path changes; the assertions stay the same.
 */

import {
  SWAGGER_PATH,
  SWAGGER_JSON_PATH,
} from './constants/swagger-paths.constants';

describe('CHAR-3: swagger.constants.ts exports', () => {
  it('CHAR-3a: SWAGGER_PATH equals "/docs"', () => {
    expect(SWAGGER_PATH).toBe('/docs');
  });

  it('CHAR-3b: SWAGGER_JSON_PATH equals "/docs-json"', () => {
    expect(SWAGGER_JSON_PATH).toBe('/docs-json');
  });

  it('CHAR-3c: SWAGGER_PATH starts with "/"', () => {
    expect(SWAGGER_PATH.startsWith('/')).toBe(true);
  });

  it('CHAR-3d: SWAGGER_JSON_PATH starts with "/"', () => {
    expect(SWAGGER_JSON_PATH.startsWith('/')).toBe(true);
  });

  it('CHAR-3e: SWAGGER_JSON_PATH is distinct from SWAGGER_PATH', () => {
    expect(SWAGGER_JSON_PATH).not.toBe(SWAGGER_PATH);
  });

  it('CHAR-3f: both constants are non-empty strings', () => {
    expect(typeof SWAGGER_PATH).toBe('string');
    expect(SWAGGER_PATH.length).toBeGreaterThan(0);
    expect(typeof SWAGGER_JSON_PATH).toBe('string');
    expect(SWAGGER_JSON_PATH.length).toBeGreaterThan(0);
  });
});
