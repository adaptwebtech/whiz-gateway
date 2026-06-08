import {
  Controller,
  Get,
  Query,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { WppAuthFilter } from './filters/wpp-auth.filter';
import { WppService } from './wpp.service';

@ApiTags('WhatsApp Meta Adapter')
@ApiSecurity('api-key')
@UseFilters(WppAuthFilter)
@UseGuards(ApiKeyGuard)
@Controller('wpp')
export class WppController {
  constructor(private readonly wppService: WppService) {}

  @Get('debug_token')
  @ApiOperation({
    summary: 'Verifica token de acesso Meta (debug_token)',
    description: 'Encaminha GET /debug_token à Meta Graph API.',
  })
  @ApiQuery({
    name: 'input_token',
    required: true,
    description: 'Token a verificar',
  })
  @ApiResponse({ status: 200, description: 'Resposta da Meta' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async debugToken(
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.wppService.forward('GET', 'debug_token', {
      query,
    });
    res.status(result.status).json(result.data);
  }
}
