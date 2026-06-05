import {
  Controller,
  Get,
  Logger,
  Param,
  Query,
  Res,
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { WppAuthFilter } from '../wpp/filters/wpp-auth.filter';
import { WppService } from '../wpp/wpp.service';

@ApiTags('WhatsApp — Analytics')
@ApiBearerAuth('bearer')
@UseFilters(WppAuthFilter)
@UseGuards(ApiKeyGuard)
@UsePipes(new ValidationPipe({ whitelist: false, transform: true }))
@Controller('wpp')
export class WppAnalyticsController {
  private readonly logger = new Logger(WppAnalyticsController.name);

  constructor(private readonly wppService: WppService) {}

  @Get(':wabaId')
  @ApiOperation({
    summary: 'Consulta analytics da WABA',
    description:
      'Retorna métricas de mensagens ou conversas da WABA via field expansion. O campo `fields` é repassado íntegro à Meta sem reprocessamento (suporta `analytics` e `conversation_analytics`).',
  })
  @ApiParam({
    name: 'wabaId',
    description: 'ID da WABA',
    example: 'waba123',
  })
  @ApiQuery({
    name: 'fields',
    required: false,
    description:
      'Field expansion da Meta. Ex.: analytics.start(1).end(2).granularity(DAY) ou conversation_analytics.start(1).end(2)',
    example: 'analytics.start(1609459200).end(1609545600).granularity(DAY)',
  })
  @ApiResponse({
    status: 200,
    description: 'Dados de analytics ou conversation_analytics (body Meta)',
  })
  @ApiResponse({ status: 400, description: 'Parâmetros inválidos (body Meta)' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async getAnalytics(
    @Param('wabaId') wabaId: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`GET ${wabaId}`);
    const result = await this.wppService.forward('GET', wabaId, { query });
    this.logger.log(`GET ${wabaId} → ${result.status}`);
    res.status(result.status).json(result.data);
  }
}
