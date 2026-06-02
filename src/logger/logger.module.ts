import { Global, Module } from '@nestjs/common';
import { LoggerService } from './logger.service';

/**
 * Módulo global de logging (Winston, console only — OQ-3).
 */
@Global()
@Module({
  providers: [LoggerService],
  exports: [LoggerService],
})
export class LoggerModule {}
