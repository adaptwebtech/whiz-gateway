import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class WppMediaCleanupService {
  private readonly logger = new Logger(WppMediaCleanupService.name);
  private readonly TMP_DIR = '/tmp/wpp-uploads';
  private readonly MAX_AGE_MS = 60 * 60 * 1000; // 1 hora

  @Cron('0 * * * *')
  async cleanup(): Promise<void> {
    const files = await fs.promises.readdir(this.TMP_DIR).catch(() => []);
    const now = Date.now();

    for (const file of files) {
      const filePath = path.join(this.TMP_DIR, file);
      const stat = await fs.promises.stat(filePath).catch(() => null);
      if (!stat || !stat.isFile()) continue;
      if (now - stat.mtime.getTime() > this.MAX_AGE_MS) {
        await fs.promises.unlink(filePath).catch(() => {});
        this.logger.log(file);
      }
    }
  }
}
