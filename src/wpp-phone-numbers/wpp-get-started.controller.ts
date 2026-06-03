import {
  Controller,
  Get,
  Logger,
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
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { WppAuthFilter } from '../wpp/filters/wpp-auth.filter';
import { WppService } from '../wpp/wpp.service';

@ApiTags('WhatsApp — Debug Token')
@ApiBearerAuth('bearer')
@UseFilters(WppAuthFilter)
@UseGuards(ApiKeyGuard)
@UsePipes(new ValidationPipe({ whitelist: false, transform: true }))
@Controller('wpp')
export class WppGetStartedController {
  private readonly logger = new Logger(WppGetStartedController.name);

  constructor(private readonly wppService: WppService) {}

  @Get('debug_token')
  @ApiOperation({
    summary: 'Inspeciona token de acesso',
    description:
      'Retorna informações de depuração sobre o token de acesso especificado. Resposta da Meta repassada sem alteração.',
  })
  @ApiQuery({
    name: 'input_token',
    required: false,
    description: 'Token a ser inspecionado',
    example: 'abc',
  })
  @ApiResponse({
    status: 200,
    description: 'Informações do token (body Meta)',
  })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async debugToken(
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log('GET debug_token');
    const result = await this.wppService.forward('GET', 'debug_token', {
      query,
    });
    this.logger.log(`GET debug_token → ${result.status}`);
    res.status(result.status).json(result.data);
  }
}
