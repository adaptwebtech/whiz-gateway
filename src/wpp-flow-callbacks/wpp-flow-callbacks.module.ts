import { Logger, Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { WppAuthFilter } from '../wpp/filters/wpp-auth.filter';
import { WPP_FLOW_CALLBACKS_REPOSITORY } from './constants/wpp-flow-callbacks-tokens.constants';
import { WppFlowCallbacksPrismaRepository } from './repositories/wpp-flow-callbacks.prisma.repository';
import { WppFlowCallbacksController } from './wpp-flow-callbacks.controller';
import { WppFlowCallbacksService } from './wpp-flow-callbacks.service';

@Module({
  imports: [PrismaModule, RedisModule, ApiKeysModule],
  controllers: [WppFlowCallbacksController],
  providers: [
    WppFlowCallbacksService,
    WppAuthFilter,
    Logger,
    {
      provide: WPP_FLOW_CALLBACKS_REPOSITORY,
      useClass: WppFlowCallbacksPrismaRepository,
    },
  ],
  exports: [WppFlowCallbacksService],
})
export class WppFlowCallbacksModule {}
