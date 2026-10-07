import { Global, Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { LoggerModule } from '../logger/logger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { META_ERROR_LOGS_REPOSITORY } from './constants/meta-error-logs-tokens.constants';
import { MetaErrorLogsCleanupService } from './meta-error-logs-cleanup.service';
import { MetaErrorLogsController } from './meta-error-logs.controller';
import { MetaErrorLogsService } from './meta-error-logs.service';
import { MetaErrorLogsPrismaRepository } from './repositories/meta-error-logs.prisma.repository';

/**
 * `@Global` porque o serviço é injetado em caminhos transversais — `WppService`
 * e o consumer de upload — e importar este módulo em cada um deles abriria ciclo
 * com `ApiKeysModule` (usado aqui pelo guard da rota de consulta).
 */
@Global()
@Module({
  imports: [PrismaModule, LoggerModule, ApiKeysModule],
  providers: [
    MetaErrorLogsPrismaRepository,
    {
      provide: META_ERROR_LOGS_REPOSITORY,
      useExisting: MetaErrorLogsPrismaRepository,
    },
    MetaErrorLogsService,
    MetaErrorLogsCleanupService,
  ],
  controllers: [MetaErrorLogsController],
  exports: [MetaErrorLogsService, META_ERROR_LOGS_REPOSITORY],
})
export class MetaErrorLogsModule {}
