import {
  Controller,
  Get,
  Logger,
  Param,
  Post,
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

@ApiTags('WhatsApp — Commerce Settings')
@ApiSecurity('api-key')
@UseFilters(WppAuthFilter)
@UseGuards(ApiKeyGuard)
@UsePipes(new ValidationPipe({ whitelist: false, transform: true }))
@Controller('wpp')
export class WppCommerceController {
  private readonly logger = new Logger(WppCommerceController.name);

  constructor(private readonly wppService: WppService) {}

  @Get(':phoneNumberId/whatsapp_commerce_settings')
  @ApiOperation({
    summary: 'Consulta configurações de comércio',
    description:
      'Retorna as configurações de comércio (carrinho e catálogo) do número de telefone. Resposta da Meta repassada sem alteração.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número de telefone',
    example: 'pn001',
  })
  @ApiResponse({
    status: 200,
    description: 'Configurações de comércio (body Meta)',
  })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async getCommerceSettings(
    @Param('phoneNumberId') phoneNumberId: string,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${phoneNumberId}/whatsapp_commerce_settings`;
    this.logger.log(`GET ${path}`);
    const result = await this.wppService.forward('GET', path, {});
    this.logger.log(`GET ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }

  @Post(':phoneNumberId/whatsapp_commerce_settings')
  @ApiOperation({
    summary: 'Atualiza configurações de comércio',
    description:
      'Define ou atualiza as configurações de comércio (carrinho/catálogo) do número de telefone via query string. Query repassada íntegra à Meta.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número de telefone',
    example: 'pn001',
  })
  @ApiQuery({
    name: 'is_cart_enabled',
    required: false,
    description: 'Habilita ou desabilita o carrinho',
    example: 'true',
  })
  @ApiQuery({
    name: 'is_catalog_visible',
    required: false,
    description: 'Habilita ou desabilita a visibilidade do catálogo',
    example: 'false',
  })
  @ApiResponse({
    status: 200,
    description: 'Configurações atualizadas — { success: true } (body Meta)',
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos (body Meta)' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async updateCommerceSettings(
    @Param('phoneNumberId') phoneNumberId: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${phoneNumberId}/whatsapp_commerce_settings`;
    this.logger.log(`POST ${path}`);
    const result = await this.wppService.forward('POST', path, { query });
    this.logger.log(`POST ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }
}
