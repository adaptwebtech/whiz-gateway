import {
  Body,
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
import { RequestCodeDto } from './dto/request-code.dto';
import { SetTwoStepPinDto } from './dto/set-two-step-pin.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';

@ApiTags('WhatsApp — Números de Telefone')
@ApiSecurity('api-key')
@UseFilters(WppAuthFilter)
@UseGuards(ApiKeyGuard)
@UsePipes(new ValidationPipe({ whitelist: false, transform: true }))
@Controller('wpp')
export class WppPhoneNumbersController {
  private readonly logger = new Logger(WppPhoneNumbersController.name);

  constructor(private readonly wppService: WppService) {}

  @Get(':wabaId/phone_numbers')
  @ApiOperation({
    summary: 'Lista números de telefone da WABA',
    description:
      'Retorna a lista de números de telefone associados à WABA especificada. Resposta da Meta repassada sem alteração.',
  })
  @ApiParam({ name: 'wabaId', description: 'ID da WABA', example: 'waba123' })
  @ApiQuery({
    name: 'fields',
    required: false,
    description: 'Campos a retornar (passthrough)',
    example: 'id,display_phone_number',
  })
  @ApiResponse({ status: 200, description: 'Lista de números (body Meta)' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async listPhoneNumbers(
    @Param('wabaId') wabaId: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${wabaId}/phone_numbers`;
    this.logger.log(`GET ${path}`);
    const result = await this.wppService.forward('GET', path, { query });
    this.logger.log(`GET ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Busca número de telefone por ID',
    description:
      'Retorna as informações de um número de telefone pelo seu ID. Resposta da Meta repassada sem alteração.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID do número de telefone',
    example: 'pn001',
  })
  @ApiQuery({
    name: 'fields',
    required: false,
    description: 'Campos a retornar (passthrough)',
    example: 'name_status',
  })
  @ApiResponse({ status: 200, description: 'Dados do número (body Meta)' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async getById(
    @Param('id') id: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`GET ${id}`);
    const result = await this.wppService.forward('GET', id, { query });
    this.logger.log(`GET ${id} → ${result.status}`);
    res.status(result.status).json(result.data);
  }

  @Post(':phoneNumberId/request_code')
  @ApiOperation({
    summary: 'Solicita código de verificação',
    description:
      'Solicita um código de verificação para o número de telefone especificado. Resposta da Meta repassada sem alteração.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número de telefone',
    example: 'pn001',
  })
  @ApiResponse({ status: 200, description: 'Código solicitado (body Meta)' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async requestCode(
    @Param('phoneNumberId') phoneNumberId: string,
    @Body() dto: RequestCodeDto,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${phoneNumberId}/request_code`;
    this.logger.log(`POST ${path}`);
    const result = await this.wppService.forward('POST', path, { body: dto });
    this.logger.log(`POST ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }

  @Post(':phoneNumberId/verify_code')
  @ApiOperation({
    summary: 'Verifica código de confirmação',
    description:
      'Verifica o código de confirmação para o número de telefone especificado. Resposta da Meta repassada sem alteração.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número de telefone',
    example: 'pn001',
  })
  @ApiResponse({ status: 200, description: 'Código verificado (body Meta)' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async verifyCode(
    @Param('phoneNumberId') phoneNumberId: string,
    @Body() dto: VerifyCodeDto,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${phoneNumberId}/verify_code`;
    this.logger.log(`POST ${path}`);
    const result = await this.wppService.forward('POST', path, { body: dto });
    this.logger.log(`POST ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }

  @Post(':phoneNumberId')
  @ApiOperation({
    summary: 'Define PIN de dois fatores',
    description:
      'Define ou atualiza o PIN de verificação em dois fatores do número de telefone. Resposta da Meta repassada sem alteração.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número de telefone',
    example: 'pn001',
  })
  @ApiResponse({ status: 200, description: 'PIN definido (body Meta)' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async setTwoStepPin(
    @Param('phoneNumberId') phoneNumberId: string,
    @Body() dto: SetTwoStepPinDto,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`POST ${phoneNumberId} (set two-step pin)`);
    const result = await this.wppService.forward('POST', phoneNumberId, {
      body: dto,
    });
    this.logger.log(`POST ${phoneNumberId} → ${result.status}`);
    res.status(result.status).json(result.data);
  }
}
