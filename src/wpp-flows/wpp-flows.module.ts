import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { WppFlowCallbacksModule } from '../wpp-flow-callbacks/wpp-flow-callbacks.module';
import { WppModule } from '../wpp/wpp.module';
import { WppFlowsEndpointController } from './wpp-flows-endpoint.controller';
import { WppFlowsEndpointService } from './wpp-flows-endpoint.service';
import { WppFlowsController } from './wpp-flows.controller';

/**
 * Módulo de gerenciamento de Flows do WhatsApp.
 * Expõe rotas de gerenciamento (autenticadas por ApiKeyGuard) e
 * endpoint público de Flows (autenticado por X-Hub-Signature-256).
 */
@Module({
  imports: [WppModule, ApiKeysModule, WppFlowCallbacksModule],
  controllers: [WppFlowsController, WppFlowsEndpointController],
  providers: [WppFlowsEndpointService],
})
export class WppFlowsModule {}
