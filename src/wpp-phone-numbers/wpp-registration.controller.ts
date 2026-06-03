import {
  Body,
  Controller,
  Logger,
  Param,
  Post,
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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { WppAuthFilter } from '../wpp/filters/wpp-auth.filter';
import { WppService } from '../wpp/wpp.service';
import { RegisterPhoneDto } from './dto/register-phone.dto';

@ApiTags('WhatsApp — Registro de Número')
@ApiBearerAuth('bearer')
@UseFilters(WppAuthFilter)
@UseGuards(ApiKeyGuard)
@UsePipes(new ValidationPipe({ whitelist: false, transform: true }))
@Controller('wpp')
export class WppRegistrationController {
  private readonly logger = new Logger(WppRegistrationController.name);

  constructor(private readonly wppService: WppService) {}

  @Post(':phoneNumberId/register')
  @ApiOperation({
    summary: 'Registra número de telefone',
    description:
      'Registra o número de telefone na plataforma Meta. Resposta da Meta repassada sem alteração.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número de telefone',
    example: 'pn001',
  })
  @ApiResponse({ status: 200, description: 'Número registrado (body Meta)' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async registerPhone(
    @Param('phoneNumberId') phoneNumberId: string,
    @Body() dto: RegisterPhoneDto,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${phoneNumberId}/register`;
    this.logger.log(`POST ${path}`);
    const result = await this.wppService.forward('POST', path, { body: dto });
    this.logger.log(`POST ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }

  @Post(':phoneNumberId/deregister')
  @ApiOperation({
    summary: 'Desregistra número de telefone',
    description:
      'Remove o registro do número de telefone da plataforma Meta. Resposta da Meta repassada sem alteração.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número de telefone',
    example: 'pn001',
  })
  @ApiResponse({
    status: 200,
    description: 'Número desregistrado (body Meta)',
  })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async deregisterPhone(
    @Param('phoneNumberId') phoneNumberId: string,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${phoneNumberId}/deregister`;
    this.logger.log(`POST ${path}`);
    const result = await this.wppService.forward('POST', path, {});
    this.logger.log(`POST ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }
}
