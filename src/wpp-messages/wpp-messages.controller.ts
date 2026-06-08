import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  Param,
  Post,
  Put,
  Res,
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { WppAuthFilter } from '../wpp/filters/wpp-auth.filter';
import { WppService } from '../wpp/wpp.service';
import { MarkAsReadDto } from './dto/mark-as-read.dto';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('WhatsApp Meta Adapter — Mensagens')
@ApiSecurity('api-key')
@UseFilters(WppAuthFilter)
@UseGuards(ApiKeyGuard)
@UsePipes(new ValidationPipe({ whitelist: false, transform: true }))
@Controller('wpp')
export class WppMessagesController {
  private readonly logger = new Logger(WppMessagesController.name);

  constructor(private readonly wppService: WppService) {}

  @Post(':phoneNumberId/messages')
  @ApiOperation({
    summary: 'Envia uma mensagem WhatsApp',
    description:
      'Encaminha o corpo íntegro à Meta Cloud API. Suporta ~45 variantes discriminadas por `type` (text, image, audio, document, sticker, video, reaction, contacts, location, template, interactive) além de corpos de status (read + typing_indicator). Resposta da Meta repassada sem alteração.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número remetente (Phone-Number-ID da Meta)',
    example: '123456789',
  })
  @ApiResponse({ status: 200, description: 'Resposta da Meta (transparente)' })
  @ApiResponse({
    status: 400,
    description:
      'Validação local: messaging_product ausente, to/type ausentes em envio normal, ou message_id ausente em status read',
  })
  @ApiResponse({ status: 401, description: 'Chave de API ausente ou inválida' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async sendMessage(
    @Param('phoneNumberId') phoneNumberId: string,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ): Promise<void> {
    const isStatusBody = dto.status === 'read';

    if (isStatusBody) {
      if (!dto.message_id) {
        throw new BadRequestException(
          'Campo "message_id" é obrigatório em corpos de status',
        );
      }
    } else {
      if (!dto.to || !dto.type) {
        throw new BadRequestException(
          'Campos "to" e "type" são obrigatórios para envio de mensagens',
        );
      }
    }

    this.logger.log(
      `POST ${phoneNumberId}/messages type=${dto.type ?? `status:${dto.status ?? 'desconhecido'}`}`,
    );

    const result = await this.wppService.forward(
      'POST',
      `${phoneNumberId}/messages`,
      { body: dto },
    );

    this.logger.log(`POST ${phoneNumberId}/messages → ${result.status}`);
    res.status(result.status).json(result.data);
  }

  @Put(':phoneNumberId/messages')
  @ApiOperation({
    summary: 'Marca mensagem como lida',
    description:
      'Encaminha PUT à Meta Cloud API com status "read" e o ID da mensagem. Resposta da Meta repassada sem alteração.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número remetente (Phone-Number-ID da Meta)',
    example: '123456789',
  })
  @ApiResponse({
    status: 200,
    description:
      'Resposta da Meta (transparente, tipicamente { success: true })',
  })
  @ApiResponse({
    status: 400,
    description:
      'Validação local: messaging_product, status ou message_id ausentes',
  })
  @ApiResponse({ status: 401, description: 'Chave de API ausente ou inválida' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async markAsRead(
    @Param('phoneNumberId') phoneNumberId: string,
    @Body() dto: MarkAsReadDto,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(
      `PUT ${phoneNumberId}/messages status=read message_id=${dto.message_id}`,
    );

    const result = await this.wppService.forward(
      'PUT',
      `${phoneNumberId}/messages`,
      { body: dto },
    );

    this.logger.log(`PUT ${phoneNumberId}/messages → ${result.status}`);
    res.status(result.status).json(result.data);
  }
}
