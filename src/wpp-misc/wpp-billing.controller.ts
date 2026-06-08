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
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { WppAuthFilter } from '../wpp/filters/wpp-auth.filter';
import { WppService } from '../wpp/wpp.service';

@ApiTags('WhatsApp — Billing')
@ApiSecurity('api-key')
@UseFilters(WppAuthFilter)
@UseGuards(ApiKeyGuard)
@UsePipes(new ValidationPipe({ whitelist: false, transform: true }))
@Controller('wpp')
export class WppBillingController {
  private readonly logger = new Logger(WppBillingController.name);

  constructor(private readonly wppService: WppService) {}

  @Get(':businessId/extendedcredits')
  @ApiOperation({
    summary: 'Consulta linhas de crédito estendido',
    description:
      'Retorna as linhas de crédito estendido associadas ao Business. Query repassada íntegra à Meta.',
  })
  @ApiParam({
    name: 'businessId',
    description: 'ID do Business',
    example: 'biz001',
  })
  @ApiQuery({
    name: 'fields',
    required: false,
    description: 'Campos a retornar (passthrough)',
    example: 'id,owner_business_id,available_balance',
  })
  @ApiResponse({
    status: 200,
    description: 'Linhas de crédito estendido (body Meta)',
  })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async getExtendedCredits(
    @Param('businessId') businessId: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${businessId}/extendedcredits`;
    this.logger.log(`GET ${path}`);
    const result = await this.wppService.forward('GET', path, { query });
    this.logger.log(`GET ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }
}
