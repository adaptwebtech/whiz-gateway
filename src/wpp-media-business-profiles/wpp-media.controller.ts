import * as fs from 'fs';
import { randomUUID } from 'crypto';

/* eslint-disable @typescript-eslint/no-require-imports */
// busboy has no TypeScript declarations; use require to avoid unsafe-any issues
type BusboyInstance = {
  on(
    event: 'file',
    handler: (
      name: string,
      stream: NodeJS.ReadableStream,
      info: { mimeType: string },
    ) => void,
  ): void;
  on(event: 'field', handler: (name: string, value: string) => void): void;
  on(event: 'finish', handler: () => void): void;
  on(event: 'error', handler: (err: Error) => void): void;
};
type BusboyFactory = (opts: {
  headers: Record<string, string | string[] | undefined>;
}) => BusboyInstance;
const busboy: BusboyFactory = require('busboy') as BusboyFactory;
/* eslint-enable @typescript-eslint/no-require-imports */
import {
  Controller,
  Delete,
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

@ApiTags('Mídia WhatsApp')
@ApiSecurity('api-key')
@UseFilters(WppAuthFilter)
@UseGuards(ApiKeyGuard)
@UsePipes(new ValidationPipe({ whitelist: false, transform: true }))
@Controller('wpp')
export class WppMediaController {
  private readonly logger = new Logger(WppMediaController.name);

  constructor(
    private readonly wppService: WppService,
    @Inject(RABBITMQ_SERVICE)
    private readonly rabbitMQService: IRabbitMQService,
  ) {}

  @Post(':phoneNumberId/media')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Faz upload de mídia (assíncrono)',
    description:
      'Recebe multipart/form-data com o arquivo de mídia. Salva em disco e enfileira o job de upload. Retorna 202 com jobId imediatamente.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número de telefone WhatsApp',
    example: 'pn001',
  })
  @ApiResponse({
    status: 202,
    description: 'Job enfileirado — retorna { jobId }',
  })
  @ApiResponse({ status: 400, description: 'Erro ao salvar arquivo em disco' })
  @ApiResponse({ status: 401, description: 'Chave de API ausente ou inválida' })
  // Using a non-standard route trick: define the upload route explicitly
  // This is handled via a custom path that avoids conflict with other GET routes
  async uploadMedia(
    @Param('phoneNumberId') phoneNumberId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const jobId = randomUUID();
    const tmpFilePath = `${TMP_DIR}/${jobId}`;
    await fs.promises.mkdir(TMP_DIR, { recursive: true });

    const bb = busboy({
      headers: req.headers,
    });
    const textFields: Record<string, string> = {};
    let fileContentType = 'application/octet-stream';

    // Stream the file part straight to disk — no buffering in RAM (NFR-1).
    await new Promise<void>((resolve, reject) => {
      const writeStream = fs.createWriteStream(tmpFilePath);
      let hasFile = false;
      let fileFlushed = false;
      let parseDone = false;

      const maybeResolve = (): void => {
        if (parseDone && (fileFlushed || !hasFile)) resolve();
      };

      writeStream.on('error', reject);

      bb.on(
        'file',
        (
          _name: string,
          stream: NodeJS.ReadableStream,
          info: { mimeType: string },
        ) => {
          hasFile = true;
          fileContentType = info.mimeType;
          stream.on('error', reject);
          stream.pipe(writeStream);
          writeStream.on('finish', () => {
            fileFlushed = true;
            maybeResolve();
          });
        },
      );
      bb.on('field', (name: string, value: string) => {
        textFields[name] = value;
      });
      bb.on('error', reject);
      bb.on('finish', () => {
        parseDone = true;
        // No file part arrived — close the empty stream and resolve.
        if (!hasFile) writeStream.end();
        maybeResolve();
      });
      req.pipe(bb as unknown as NodeJS.WritableStream);
    });

    const subPath = `${phoneNumberId}/media`;
    const job: MediaUploadJobDto = {
      jobId,
      type: 'media',
      subPath,
      tmpFilePath,
      contentType: fileContentType,
      messagingProduct: textFields['messaging_product'],
      callbackUrl: textFields['callback_url'],
    };

    this.logger.log(`uploadMedia jobId=${jobId} subPath=${subPath}`);
    await this.rabbitMQService.publish(MEDIA_UPLOAD_QUEUE, job);

    res.status(202).json({ jobId });
  }

  @Get(':mediaId')
  @ApiOperation({
    summary: 'Recupera URL e metadados de mídia (síncrono)',
    description:
      'Repassa GET /:mediaId à Meta e retorna status + body intactos.',
  })
  @ApiParam({
    name: 'mediaId',
    description: 'ID de mídia retornado pela Meta',
    example: 'media-abc-123',
  })
  @ApiQuery({
    name: 'phone_number_id',
    required: false,
    description: 'ID do número de telefone (obrigatório pela Meta)',
    example: 'pn001',
  })
  @ApiResponse({ status: 200, description: 'Metadados de mídia (body Meta)' })
  @ApiResponse({ status: 401, description: 'Chave de API ausente ou inválida' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async getMedia(
    @Param('mediaId') mediaId: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`GET ${mediaId}`);
    const result = await this.wppService.forward('GET', mediaId, { query });
    res.status(result.status).json(result.data);
  }

  @Delete(':mediaId')
  @ApiOperation({
    summary: 'Deleta mídia (síncrono)',
    description:
      'Repassa DELETE /:mediaId à Meta e retorna status + body intactos.',
  })
  @ApiParam({
    name: 'mediaId',
    description: 'ID de mídia a ser deletada',
    example: 'media-abc-123',
  })
  @ApiQuery({
    name: 'phone_number_id',
    required: false,
    description: 'ID do número de telefone (obrigatório pela Meta)',
    example: 'pn001',
  })
  @ApiResponse({ status: 200, description: 'Resultado da deleção (body Meta)' })
  @ApiResponse({ status: 401, description: 'Chave de API ausente ou inválida' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async deleteMedia(
    @Param('mediaId') mediaId: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`DELETE ${mediaId}`);
    const result = await this.wppService.forward('DELETE', mediaId, { query });
    res.status(result.status).json(result.data);
  }
}
