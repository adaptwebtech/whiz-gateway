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

@ApiTags('WhatsApp — WABA')
@ApiBearerAuth('bearer')
@UseFilters(WppAuthFilter)
@UseGuards(ApiKeyGuard)
@UsePipes(new ValidationPipe({ whitelist: false, transform: true }))
@Controller('wpp')
export class WppWabaController {
  private readonly logger = new Logger(WppWabaController.name);

  constructor(private readonly wppService: WppService) {}

  @Get(':businessId/owned_whatsapp_business_accounts')
  @ApiOperation({
    summary: 'Lista WABAs próprias do negócio',
    description:
      'Retorna a lista de WhatsApp Business Accounts próprias do negócio especificado. Resposta da Meta repassada sem alteração.',
  })
  @ApiParam({
    name: 'businessId',
    description: 'ID do negócio',
    example: 'biz001',
  })
  @ApiQuery({
    name: 'fields',
    required: false,
    description: 'Campos a retornar (passthrough)',
    example: 'id,name',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de WABAs próprias (body Meta)',
  })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async getOwnedWaba(
    @Param('businessId') businessId: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${businessId}/owned_whatsapp_business_accounts`;
    this.logger.log(`GET ${path}`);
    const result = await this.wppService.forward('GET', path, { query });
    this.logger.log(`GET ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }

  @Get(':businessId/client_whatsapp_business_accounts')
  @ApiOperation({
    summary: 'Lista WABAs de clientes do negócio',
    description:
      'Retorna a lista de WhatsApp Business Accounts de clientes do negócio especificado. Resposta da Meta repassada sem alteração.',
  })
  @ApiParam({
    name: 'businessId',
    description: 'ID do negócio',
    example: 'biz001',
  })
  @ApiQuery({
    name: 'fields',
    required: false,
    description: 'Campos a retornar (passthrough)',
    example: 'id,name',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de WABAs de clientes (body Meta)',
  })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async getClientWaba(
    @Param('businessId') businessId: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${businessId}/client_whatsapp_business_accounts`;
    this.logger.log(`GET ${path}`);
    const result = await this.wppService.forward('GET', path, { query });
    this.logger.log(`GET ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }
}
