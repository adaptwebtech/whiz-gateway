import * as fs from 'fs';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';
import {
  BadRequestException,
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
  @ApiQuery({
    name: 'file_offset',
    required: false,
    description:
      'Offset do chunk. Preferido ao header homônimo, que não sobrevive a proxy nginx.',
    example: '0',
  })
  @ApiQuery({
    name: 'upload_session',
    required: false,
    description:
      'Id COMPLETO da sessão (com o `?sig=<mac>`) em base64url. Preferido ao path param, que não consegue carregar o `?`.',
    example: 'dXBsb2FkOk1UcGhkSFJoWTJodFpXNTA_c2lnPUFSWnE',
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
    @Query('file_offset') fileOffsetQuery: string | undefined,
    @Query('upload_session') uploadSessionB64: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Resolver o id ANTES de gravar o tmp: um id inválido tem de virar 400 sem
    // deixar arquivo para trás nem job na fila.
    const { sessionId, origem: origemSessao } = this.resolverSessionId(
      uploadId,
      uploadSessionB64,
    );

    const jobId = randomUUID();
    const tmpFilePath = `${TMP_DIR}/${jobId}`;
    await fs.promises.mkdir(TMP_DIR, { recursive: true });

    // Stream the raw binary body straight to disk — no buffering in RAM (NFR-1).
    await pipeline(req, fs.createWriteStream(tmpFilePath));

    const contentType =
      (req.headers['content-type'] as string) || 'application/octet-stream';
    const { fileOffset, origem } = this.resolverFileOffset(
      fileOffsetQuery,
      req,
    );

    const job: MediaUploadJobDto = {
      jobId,
      type: 'resumable-binary',
      subPath: sessionId,
      tmpFilePath,
      contentType,
      fileOffset,
      callbackUrl,
    };

    this.logger.log(
      `uploadBinary jobId=${jobId} sessionId=${sessionId} (${origemSessao}) fileOffset=${fileOffset} (${origem}) callbackUrl=${callbackUrl ?? '-'}`,
    );
    await this.rabbitMQService.publish(MEDIA_UPLOAD_QUEUE, job);

    res.status(202).json({ jobId });
  }

  /**
   * Reconstitui o id de sessão COMPLETO — com o `?sig=<mac>` que a Meta anexa.
   *
   * O id devolvido por `POST /app/uploads` não é path-safe:
   *
   *   upload:MTphdHRhY2htZW50Ojc5MjVkMDRk?sig=ARZqAApVPDDNjMlPTpM
   *          └─ base64 do payload ───────┘ └─ HMAC da sessão ────┘
   *
   * Montando `/uploads/${sessionId}?callback_url=…` nasce uma URL com DOIS `?`,
   * e o Express corta no primeiro: o path param perde o sig e o `callback_url`
   * é engolido como parte do valor de `sig`. A Meta então recusa com
   *
   *   HMAC check failed! sessionId=upload:MTph…== mac=
   *
   * — `mac=` vazio — e, sem `callback_url`, o resultado do job nunca voltava ao
   * caller, que reportava timeout.
   *
   * Daí `upload_session` em **base64url** (`[A-Za-z0-9-_]`): sem `?`, sem `%`,
   * sem `+`, logo imune a reescrita de proxy e a qualquer parser de query
   * string. O path param continua aceito para compatibilidade — e se ele já
   * vier com o sig (percent-encoded, que o Express decodifica), serve igual.
   */
  private resolverSessionId(
    uploadId: string,
    uploadSessionB64: string | undefined,
  ): { sessionId: string; origem: string } {
    if (uploadSessionB64) {
      const decodificado = Buffer.from(uploadSessionB64, 'base64url').toString(
        'utf8',
      );
      // `Buffer.from` com base64 inválido não lança: ignora o que não reconhece
      // e devolve lixo. A validação é o que impede um subPath mutilado — ou
      // apontado para outra rota do Graph — de chegar à Meta.
      if (!decodificado.startsWith('upload:')) {
        throw new BadRequestException(
          'upload_session inválido: não decodifica para um id de sessão (`upload:…`).',
        );
      }
      return { sessionId: decodificado, origem: 'query upload_session' };
    }

    // Sem validar o path param: ele é um segmento único, montado pelo caller, e
    // recusá-lo aqui mudaria o comportamento de uma rota que hoje é passthrough.
    // A validação estrita fica no `upload_session`, que é o único capaz de
    // apontar o sub-path para outra rota do Graph.
    if (!uploadId.includes('?sig=')) {
      this.logger.warn(
        `uploadBinary: id de sessão SEM \`?sig=\` (${uploadId}). A Meta vai recusar com ` +
          '"HMAC check failed! … mac=". Mande o id completo em `upload_session` (base64url).',
      );
      return { sessionId: uploadId, origem: 'path param (sem sig)' };
    }

    return { sessionId: uploadId, origem: 'path param (com sig)' };
  }

  /**
   * De onde sai o `file_offset`, em ordem de precedência: query param → header
   * `file_offset` → `file-offset` → `x-file-offset` → `"0"`.
   *
   * O header com underscore **não é confiável nesta rota**: em produção e
   * staging o whiz-server alcança o gateway pela internet
   * (`https://gateway.whiz.net.br`) através de um reverse proxy nginx, e o nginx
   * descarta headers com underscore por padrão (`underscores_in_headers off`).
   * O header morria no proxy, o job saía com `fileOffset: undefined`, axios
   * omitia o header na chamada à Meta e a Meta respondia 400 — o mesmo arquivo
   * subia em `development`, que roda em modo direto e não tem proxy no caminho.
   *
   * O default `"0"` é seguro para o upload de um único chunk, que é o que o
   * whiz-server faz; um upload retomado de verdade manda o valor explícito.
   */
  private resolverFileOffset(
    fileOffsetQuery: string | undefined,
    req: Request,
  ): { fileOffset: string; origem: string } {
    const candidatos: [string, string | undefined][] = [
      ['query', fileOffsetQuery],
      ['header file_offset', req.headers['file_offset'] as string | undefined],
      ['header file-offset', req.headers['file-offset'] as string | undefined],
      [
        'header x-file-offset',
        req.headers['x-file-offset'] as string | undefined,
      ],
    ];

    for (const [origem, valor] of candidatos) {
      if (valor !== undefined && valor !== '') {
        return { fileOffset: String(valor), origem };
      }
    }

    this.logger.warn(
      'uploadBinary sem file_offset no query nem em header algum — assumindo "0". ' +
        'Se o caller mandou o header `file_offset`, ele foi comido por um proxy ' +
        '(nginx descarta headers com underscore): mande por query param.',
    );
    return { fileOffset: '0', origem: 'default' };
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
