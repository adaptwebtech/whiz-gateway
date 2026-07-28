import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import {
  InstagramWebhookService,
  type InstagramSurface,
} from './instagram-webhook.service';

/**
 * Requisição com corpo cru (rawBody) habilitado no bootstrap (main.ts).
 */
type RawBodyRequest = {
  rawBody?: Buffer;
  body: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
};

@ApiTags('Webhook Instagram/Messenger')
@Controller('webhook')
export class InstagramWebhookController {
  constructor(
    private readonly service: InstagramWebhookService,
    private readonly config: ConfigService,
  ) {}

  @Get('instagram')
  @ApiOperation({
    summary: 'Verificação do webhook de Instagram (handshake Meta)',
  })
  @ApiQuery({
    name: 'hub.mode',
    description: 'Modo de verificação enviado pela Meta.',
    example: 'subscribe',
  })
  @ApiQuery({
    name: 'hub.verify_token',
    description: 'Token de verificação (META_VERIFY_TOKEN).',
    example: 'meu_token_meta',
  })
  @ApiQuery({
    name: 'hub.challenge',
    description: 'Desafio a ser retornado para confirmar o endpoint.',
    example: '1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Hub challenge retornado em text/plain',
  })
  @ApiResponse({ status: 403, description: 'Token inválido' })
  verifyInstagram(
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

  @Post('instagram')
  @HttpCode(200)
  @ApiOperation({ summary: 'Recebe webhook de Instagram (Facebook Login)' })
  @ApiBody({
    schema: { type: 'object' },
    description: 'Payload de evento de Instagram enviado pela Meta.',
  })
  @ApiResponse({ status: 200, description: 'Evento aceito para forward' })
  receiveInstagram(@Req() req: RawBodyRequest): void {
    this.dispatch('instagram', req);
  }

  @Get('instagram-login')
  @ApiOperation({
    summary: 'Verificação do webhook de Instagram Login (handshake Meta)',
  })
  @ApiQuery({
    name: 'hub.mode',
    description: 'Modo de verificação enviado pela Meta.',
    example: 'subscribe',
  })
  @ApiQuery({
    name: 'hub.verify_token',
    description: 'Token de verificação (IG_VERIFY_TOKEN).',
    example: 'meu_token_ig',
  })
  @ApiQuery({
    name: 'hub.challenge',
    description: 'Desafio a ser retornado para confirmar o endpoint.',
    example: '1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Hub challenge retornado em text/plain',
  })
  @ApiResponse({ status: 403, description: 'Token inválido' })
  verifyInstagramLogin(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ): void {
    const expectedToken = this.config.get<string>('IG_VERIFY_TOKEN');
    if (mode !== 'subscribe' || verifyToken !== expectedToken) {
      throw new ForbiddenException('Token de verificação inválido');
    }
    res.setHeader('Content-Type', 'text/plain').status(200).send(challenge);
  }

  @Post('instagram-login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Recebe webhook de Instagram Login (OAuth direto)' })
  @ApiBody({
    schema: { type: 'object' },
    description: 'Payload de evento de Instagram Login enviado pela Meta.',
  })
  @ApiResponse({ status: 200, description: 'Evento aceito para forward' })
  receiveInstagramLogin(@Req() req: RawBodyRequest): void {
    this.dispatch('instagram-login', req);
  }

  @Get('messenger')
  @ApiOperation({
    summary: 'Verificação do webhook de Messenger (handshake Meta)',
  })
  @ApiQuery({
    name: 'hub.mode',
    description: 'Modo de verificação enviado pela Meta.',
    example: 'subscribe',
  })
  @ApiQuery({
    name: 'hub.verify_token',
    description: 'Token de verificação (META_VERIFY_TOKEN).',
    example: 'meu_token_meta',
  })
  @ApiQuery({
    name: 'hub.challenge',
    description: 'Desafio a ser retornado para confirmar o endpoint.',
    example: '1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Hub challenge retornado em text/plain',
  })
  @ApiResponse({ status: 403, description: 'Token inválido' })
  verifyMessenger(
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

  @Post('messenger')
  @HttpCode(200)
  @ApiOperation({ summary: 'Recebe webhook de Messenger (Página Facebook)' })
  @ApiBody({
    schema: { type: 'object' },
    description:
      'Payload de evento de Messenger (object=page) enviado pela Meta.',
  })
  @ApiResponse({ status: 200, description: 'Evento aceito para forward' })
  receiveMessenger(@Req() req: RawBodyRequest): void {
    this.dispatch('messenger', req);
  }

  @Get('messenger-login')
  @ApiOperation({
    summary: 'Verificação do webhook de Messenger Login (handshake Meta)',
  })
  @ApiQuery({
    name: 'hub.mode',
    description: 'Modo de verificação enviado pela Meta.',
    example: 'subscribe',
  })
  @ApiQuery({
    name: 'hub.verify_token',
    description: 'Token de verificação (MESSENGER_LOGIN_VERIFY_TOKEN).',
    example: 'meu_token_messenger_login',
  })
  @ApiQuery({
    name: 'hub.challenge',
    description: 'Desafio a ser retornado para confirmar o endpoint.',
    example: '1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Hub challenge retornado em text/plain',
  })
  @ApiResponse({ status: 403, description: 'Token inválido' })
  verifyMessengerLogin(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ): void {
    const expectedToken = this.config.get<string>(
      'MESSENGER_LOGIN_VERIFY_TOKEN',
    );
    if (mode !== 'subscribe' || verifyToken !== expectedToken) {
      throw new ForbiddenException('Token de verificação inválido');
    }
    res.setHeader('Content-Type', 'text/plain').status(200).send(challenge);
  }

  @Post('messenger-login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Recebe webhook de Messenger Login (app Meta dedicado)',
  })
  @ApiBody({
    schema: { type: 'object' },
    description:
      'Payload de evento de Messenger (object=page) do app Meta dedicado.',
  })
  @ApiResponse({ status: 200, description: 'Evento aceito para forward' })
  receiveMessengerLogin(@Req() req: RawBodyRequest): void {
    this.dispatch('messenger-login', req);
  }

  /**
   * Delega ao serviço em modo fire-and-forget (AC-10): a resposta 200 é
   * emitida imediatamente, independente do resultado do forward. Erros do
   * serviço nunca propagam para a resposta HTTP.
   */
  private dispatch(surface: InstagramSurface, req: RawBodyRequest): void {
    const rawBody = req.rawBody ?? Buffer.from('');
    const signature = req.headers['x-hub-signature-256'];
    void Promise.resolve(
      this.service.handleIncoming(
        surface,
        rawBody,
        typeof signature === 'string' ? signature : undefined,
        req.body,
      ),
    ).catch(() => undefined);
  }
}
