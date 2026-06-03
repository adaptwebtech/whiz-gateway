/**
 * Testes unitários — WppMediaCleanupService
 *
 * AC-16: Dado arquivo em /tmp/wpp-uploads/<jobId> com mtime > 1 hora,
 *        quando WppMediaCleanupService.cleanup() executa, então arquivo deletado e Logger.log emite nome do arquivo.
 *        Dado arquivo com mtime < 1 hora, então não deletado.
 */

import * as fs from 'fs';
import { Logger } from '@nestjs/common';
import { WppMediaCleanupService } from './wpp-media-cleanup.service';

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('WppMediaCleanupService — unit', () => {
  let service: WppMediaCleanupService;
  let readdirSpy: jest.SpyInstance;
  let statSpy: jest.SpyInstance;
  let unlinkSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new WppMediaCleanupService();

    readdirSpy = jest.spyOn(fs.promises, 'readdir');
    statSpy = jest.spyOn(fs.promises, 'stat');
    unlinkSpy = jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    readdirSpy.mockRestore();
    statSpy.mockRestore();
    unlinkSpy.mockRestore();
    logSpy.mockRestore();
  });

  // ── AC-16: arquivo órfão (mtime > 1 hora) ────────────────────────────────

  it('AC-16: dado arquivo com mtime > 1 hora, quando cleanup() executa, então arquivo deletado e Logger.log emite nome do arquivo', async () => {
    const orphanFile = 'job-old-uuid-001';
    const oneHourAndOneMinuteAgo = new Date(Date.now() - 61 * 60 * 1000);

    readdirSpy.mockResolvedValue([orphanFile] as unknown as fs.Dirent[]);
    statSpy.mockResolvedValue({
      mtime: oneHourAndOneMinuteAgo,
      isFile: () => true,
    } as unknown as fs.Stats);

    await service.cleanup();

    expect(unlinkSpy).toHaveBeenCalledWith(expect.stringContaining(orphanFile));

    // Logger.log should emit the filename
    const logCalls = logSpy.mock.calls;
    const hasFilenameLog = logCalls.some((call) =>
      String(call[0]).includes(orphanFile),
    );
    expect(hasFilenameLog).toBe(true);
  });

  // ── AC-16: arquivo recente (mtime < 1 hora) ───────────────────────────────

  it('AC-16: dado arquivo com mtime < 1 hora, quando cleanup() executa, então arquivo NÃO deletado', async () => {
    const recentFile = 'job-recent-uuid-002';
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    readdirSpy.mockResolvedValue([recentFile] as unknown as fs.Dirent[]);
    statSpy.mockResolvedValue({
      mtime: thirtyMinutesAgo,
      isFile: () => true,
    } as unknown as fs.Stats);

    await service.cleanup();

    expect(unlinkSpy).not.toHaveBeenCalled();
  });

  // ── AC-16: mistura de órfão e recente ─────────────────────────────────────

  it('AC-16: dado mix de arquivo órfão e recente, quando cleanup() executa, então apenas o órfão é deletado', async () => {
    const orphanFile = 'job-old-001';
    const recentFile = 'job-new-002';
    const oneHourAndOneMinuteAgo = new Date(Date.now() - 61 * 60 * 1000);
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    readdirSpy.mockResolvedValue([
      orphanFile,
      recentFile,
    ] as unknown as fs.Dirent[]);

    // eslint-disable-next-line @typescript-eslint/require-await
    statSpy.mockImplementation(async (filePath: fs.PathLike) => {
      const pathStr = String(filePath);
      const mtime = pathStr.includes(orphanFile)
        ? oneHourAndOneMinuteAgo
        : thirtyMinutesAgo;
      return { mtime, isFile: () => true } as unknown as fs.Stats;
    });

    await service.cleanup();

    expect(unlinkSpy).toHaveBeenCalledTimes(1);
    expect(unlinkSpy).toHaveBeenCalledWith(expect.stringContaining(orphanFile));
    expect(unlinkSpy).not.toHaveBeenCalledWith(
      expect.stringContaining(recentFile),
    );
  });
});
