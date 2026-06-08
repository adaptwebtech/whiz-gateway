import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AmbienteController } from './ambiente.controller';
import { AmbienteService } from './ambiente.service';
import { AMBIENTE_REPOSITORY } from './constants/ambiente-tokens.constants';
import { AmbientePrismaRepository } from './repositories/ambiente.prisma.repository';

@Module({
  imports: [PrismaModule, ApiKeysModule],
  providers: [
    AmbientePrismaRepository,
    { provide: AMBIENTE_REPOSITORY, useExisting: AmbientePrismaRepository },
    AmbienteService,
  ],
  controllers: [AmbienteController],
  exports: [AMBIENTE_REPOSITORY],
})
export class AmbienteModule {}
