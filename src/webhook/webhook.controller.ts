import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { MetaSignatureGuard } from './guards/meta-signature.guard';
import { WebhookService } from './webhook.service';

@ApiTags('Webhook')
@Controller('webhook')
export class WebhookController {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Verificação do webhook Meta (handshake)' })
  @ApiResponse({
    status: 200,
    description: 'Hub challenge retornado em text/plain',
  })
  @ApiResponse({ status: 403, description: 'Token inválido' })
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ): void {
    const expectedToken = this.config.get<string>('META_VERIFY_TOKEN');
    if (mode !== 'subscribe' || verifyToken !== expectedToken) {
      throw new ForbiddenException('Token de verificação inválido');
    }
    res.setHeader('Content-Type', 'text/plain').status(200).send(challenge);
  }

  @Post()
  @UseGuards(MetaSignatureGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Recebe evento de webhook Meta' })
  @ApiResponse({ status: 200, description: 'Evento recebido e processado' })
  @ApiResponse({ status: 401, description: 'Assinatura inválida' })
  async receive(
    @Req() req: { rawBody?: Buffer; body: Record<string, unknown> },
  ): Promise<void> {
    const rawBody = req.rawBody ?? Buffer.alloc(0);
    await this.webhookService.handleIncoming(req.body, rawBody);
  }
}
