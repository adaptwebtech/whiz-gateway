import {
  Body,
  Controller,
  Delete,
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
import { CreateOrUpdateQrCodeDto } from './dto/create-or-update-qr-code.dto';

@ApiTags('WhatsApp — QR Codes')
@ApiBearerAuth('bearer')
@UseFilters(WppAuthFilter)
@UseGuards(ApiKeyGuard)
@UsePipes(new ValidationPipe({ whitelist: false, transform: true }))
@Controller('wpp')
export class WppQrCodeController {
  private readonly logger = new Logger(WppQrCodeController.name);

  constructor(private readonly wppService: WppService) {}

  @Get(':phoneNumberId/message_qrdls/:qrCodeId')
  @ApiOperation({
    summary: 'Busca QR code por ID',
    description:
      'Retorna os dados do QR code de mensagem identificado pelo ID. Resposta da Meta repassada sem alteração.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número de telefone',
    example: 'pn001',
  })
  @ApiParam({
    name: 'qrCodeId',
    description: 'ID do QR code',
    example: 'qr001',
  })
  @ApiResponse({ status: 200, description: 'Dados do QR code (body Meta)' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async getQrCode(
    @Param('phoneNumberId') phoneNumberId: string,
    @Param('qrCodeId') qrCodeId: string,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${phoneNumberId}/message_qrdls/${qrCodeId}`;
    this.logger.log(`GET ${path}`);
    const result = await this.wppService.forward('GET', path, {});
    this.logger.log(`GET ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }

  @Get(':phoneNumberId/message_qrdls')
  @ApiOperation({
    summary: 'Lista QR codes do número',
    description:
      'Retorna a lista de QR codes associados ao número de telefone. Query repassada íntegra à Meta.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número de telefone',
    example: 'pn001',
  })
  @ApiQuery({
    name: 'fields',
    required: false,
    description: 'Campos a retornar (passthrough)',
    example: 'code,prefilled_message',
  })
  @ApiQuery({
    name: 'code',
    required: false,
    description: 'ID do QR code para retornar URL da imagem SVG/PNG',
    example: 'ABC',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de QR codes ou URL de imagem (body Meta)',
  })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async listQrCodes(
    @Param('phoneNumberId') phoneNumberId: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${phoneNumberId}/message_qrdls`;
    this.logger.log(`GET ${path}`);
    const result = await this.wppService.forward('GET', path, { query });
    this.logger.log(`GET ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }

  @Post(':phoneNumberId/message_qrdls')
  @ApiOperation({
    summary: 'Cria ou atualiza QR code',
    description:
      'Cria um novo QR code (sem campo `code`) ou atualiza um existente (com campo `code`). A decisão criar/atualizar é feita pela Meta com base na presença de `code` no body.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número de telefone',
    example: 'pn001',
  })
  @ApiResponse({
    status: 200,
    description: 'QR code criado ou atualizado (body Meta)',
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos (body Meta)' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async createOrUpdateQrCode(
    @Param('phoneNumberId') phoneNumberId: string,
    @Body() dto: CreateOrUpdateQrCodeDto,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${phoneNumberId}/message_qrdls`;
    this.logger.log(`POST ${path}`);
    const result = await this.wppService.forward('POST', path, { body: dto });
    this.logger.log(`POST ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }

  @Delete(':phoneNumberId/message_qrdls/:qrCodeId')
  @ApiOperation({
    summary: 'Remove QR code',
    description:
      'Remove o QR code identificado pelo ID. Resposta da Meta repassada sem alteração.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número de telefone',
    example: 'pn001',
  })
  @ApiParam({
    name: 'qrCodeId',
    description: 'ID do QR code a remover',
    example: 'qr001',
  })
  @ApiResponse({
    status: 200,
    description: 'QR code removido — { success: true } (body Meta)',
  })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async deleteQrCode(
    @Param('phoneNumberId') phoneNumberId: string,
    @Param('qrCodeId') qrCodeId: string,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${phoneNumberId}/message_qrdls/${qrCodeId}`;
    this.logger.log(`DELETE ${path}`);
    const result = await this.wppService.forward('DELETE', path, {});
    this.logger.log(`DELETE ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }
}
