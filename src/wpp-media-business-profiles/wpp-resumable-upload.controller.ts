import * as fs from 'fs';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';
import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Req,
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
import type { Request, Response } from 'express';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { RABBITMQ_SERVICE } from '../rabbitmq/constants/rabbitmq-tokens.constants';
import { MEDIA_UPLOAD_QUEUE } from '../rabbitmq/constants/rabbitmq-queue.constants';
import type { IRabbitMQService } from '../rabbitmq/interfaces/rabbitmq-service.interface';
import { WppAuthFilter } from '../wpp/filters/wpp-auth.filter';
import { WppService } from '../wpp/wpp.service';
import { MediaUploadJobDto } from './dto/media-upload-job.dto';

const TMP_DIR = '/tmp/wpp-uploads';

@ApiTags('Upload Resumível WhatsApp')
@ApiSecurity('api-key')
@UseFilters(WppAuthFilter)
@UseGuards(ApiKeyGuard)
@UsePipes(new ValidationPipe({ whitelist: false, transform: true }))
@Controller('wpp')
export class WppResumableUploadController {
  private readonly logger = new Logger(WppResumableUploadController.name);

  constructor(
    private readonly wppService: WppService,
    @Inject(RABBITMQ_SERVICE)
    private readonly rabbitMQService: IRabbitMQService,
  ) {}

  @Post('app/uploads')
  @ApiOperation({
    summary: 'Cria sessão de upload resumível (síncrono)',
    description:
      'Repassa POST /app/uploads à Meta e retorna o ID de sessão imediatamente.',
  })
  @ApiQuery({
    name: 'file_length',
    required: true,
    description: 'Tamanho do arquivo em bytes',
    example: '1024',
  })
  @ApiQuery({
    name: 'file_type',
    required: true,
    description: 'Tipo MIME do arquivo',
    example: 'image/jpeg',
  })
  @ApiQuery({
    name: 'file_name',
    required: false,
    description: 'Nome do arquivo (opcional)',
    example: 'perfil.jpg',
  })
  @ApiResponse({
    status: 200,
    description: 'Sessão criada — retorna { id: "<session_id>" }',
  })
  @ApiResponse({ status: 401, description: 'Chave de API ausente ou inválida' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async createUploadSession(
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log('POST app/uploads');
    const result = await this.wppService.forward('POST', 'app/uploads', {
      query,
    });
    res.status(result.status).json(result.data);
  }

  @Post('uploads/:uploadId')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Envia dados binários de upload resumível (assíncrono)',
    description:
      'Recebe corpo binário bruto. Salva em disco e enfileira o job. Retorna 202 com jobId imediatamente.',
  })
  @ApiParam({
    name: 'uploadId',
    description: 'ID da sessão de upload',
    example: 'upload-session-xyz',
  })
  @ApiQuery({
    name: 'callback_url',
    required: false,
    description: 'URL de callback para receber o resultado via webhook',
    example: 'https://meu-servidor.com/webhook/upload',
  })
  @ApiResponse({
    status: 202,
    description: 'Job enfileirado — retorna { jobId }',
  })
  @ApiResponse({ status: 400, description: 'Erro ao salvar arquivo em disco' })
  @ApiResponse({ status: 401, description: 'Chave de API ausente ou inválida' })
  async uploadBinary(
    @Param('uploadId') uploadId: string,
    @Query('callback_url') callbackUrl: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const jobId = randomUUID();
    const tmpFilePath = `${TMP_DIR}/${jobId}`;
    await fs.promises.mkdir(TMP_DIR, { recursive: true });

    // Stream the raw binary body straight to disk — no buffering in RAM (NFR-1).
    await pipeline(req, fs.createWriteStream(tmpFilePath));

    const contentType =
      (req.headers['content-type'] as string) || 'application/octet-stream';
    const fileOffset = req.headers['file_offset'] as string | undefined;

    const job: MediaUploadJobDto = {
      jobId,
      type: 'resumable-binary',
      subPath: uploadId,
      tmpFilePath,
      contentType,
      fileOffset,
      callbackUrl,
    };

    this.logger.log(`uploadBinary jobId=${jobId} uploadId=${uploadId}`);
    await this.rabbitMQService.publish(MEDIA_UPLOAD_QUEUE, job);

    res.status(202).json({ jobId });
  }

  @Get('uploads/:uploadId')
  @ApiOperation({
    summary: 'Consulta status da sessão de upload (síncrono)',
    description: 'Repassa GET /:uploadId à Meta e retorna o status da sessão.',
  })
  @ApiParam({
    name: 'uploadId',
    description: 'ID da sessão de upload',
    example: 'upload-session-xyz',
  })
  @ApiResponse({ status: 200, description: 'Status da sessão (body Meta)' })
  @ApiResponse({ status: 401, description: 'Chave de API ausente ou inválida' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async getUploadStatus(
    @Param('uploadId') uploadId: string,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`GET uploads/${uploadId}`);
    const result = await this.wppService.forward('GET', uploadId, {});
    res.status(result.status).json(result.data);
  }
}
