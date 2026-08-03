/**
 * Unit tests for SentryModule lifecycle — feature `sentry`. Cobre AC-17.
 */

import { SentryModule } from './sentry.module';
import type { SentryService } from './sentry.service';
import { TIMEOUT_FLUSH_MS } from './sentry.constants';

describe('SentryModule', () => {
  let sentryService: jest.Mocked<Pick<SentryService, 'descarregar'>>;
  let module: SentryModule;

  beforeEach(() => {
    sentryService = { descarregar: jest.fn().mockResolvedValue(undefined) };
    module = new SentryModule(sentryService as unknown as SentryService);
  });

  it('AC-17: Given the application is shutting down, when onApplicationShutdown runs, then Sentry is flushed with the configured timeout', async () => {
    // Arrange / Act
    await module.onApplicationShutdown('SIGTERM');

    // Assert
    expect(sentryService.descarregar).toHaveBeenCalledWith(TIMEOUT_FLUSH_MS);
  });
});
