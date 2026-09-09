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
import { CreateTemplateDto } from './dto/create-template.dto';
import { EditTemplateDto } from './dto/edit-template.dto';

@ApiTags('WhatsApp Meta Adapter — Templates')
@ApiSecurity('api-key')
@UseFilters(WppAuthFilter)
@UseGuards(ApiKeyGuard)
@UsePipes(new ValidationPipe({ whitelist: false, transform: true }))
@Controller('wpp')
export class WppTemplatesController {
  private readonly logger = new Logger(WppTemplatesController.name);

  constructor(private readonly wppService: WppService) {}

  /**
   * GET /wpp/:id
   * Handles two cases:
   *   - fields=message_template_namespace → namespace da WABA (AC-4)
   *   - no fields → template por ID (AC-1)
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Busca template por ID ou namespace da WABA',
    description:
      'Sem query `fields`: busca um template pelo seu ID. Com `fields=message_template_namespace`: retorna o namespace da WABA. Resposta da Meta repassada sem alteração.',
  })
  @ApiParam({
    name: 'id',
    description:
      'ID do template (`<TEMPLATE_ID>`) ou ID da WABA (`{{WABA-ID}}`)',
    example: 'tpl123',
  })
  @ApiQuery({
    name: 'fields',
    required: false,
    description:
      'Campos a retornar. Use `message_template_namespace` para obter o namespace da WABA.',
    example: 'message_template_namespace',
  })
  @ApiResponse({ status: 200, description: 'Resposta da Meta (transparente)' })
  @ApiResponse({ status: 401, description: 'Chave de API ausente ou inválida' })
  @ApiResponse({
    status: 404,
    description: 'Template ou WABA inexistente (repassado da Meta)',
  })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async getById(
    @Param('id') id: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(
      `GET ${id}${query.fields ? `?fields=${query.fields}` : ''}`,
    );

    const result = await this.wppService.forward('GET', id, { query });

    this.logger.log(`GET ${id} → ${result.status}`);
    res.status(result.status).json(result.data);
  }

  /**
   * GET /wpp/:wabaId/message_templates
   * Handles both:
   *   - ?name=<NAME> → busca por nome (AC-2)
   *   - sem name → lista todos (AC-3)
   */
  @Get(':wabaId/message_templates')
  @ApiOperation({
    summary: 'Lista ou busca templates da WABA',
    description:
      'Sem query `name`: lista todos os templates da WABA. Com `name=<NOME>`: busca templates pelo nome. Resposta da Meta repassada sem alteração.',
  })
  @ApiParam({
    name: 'wabaId',
    description: 'ID da WABA (`{{WABA-ID}}`)',
    example: 'waba456',
  })
  @ApiQuery({
    name: 'name',
    required: false,
    description: 'Nome do template para filtrar (passthrough)',
    example: 'hello_world',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista ou objeto de template(s) da Meta (transparente)',
  })
  @ApiResponse({ status: 401, description: 'Chave de API ausente ou inválida' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async getTemplates(
    @Param('wabaId') wabaId: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${wabaId}/message_templates`;
    this.logger.log(`GET ${path}`);

    const result = await this.wppService.forward('GET', path, { query });

    this.logger.log(`GET ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }

  /**
   * POST /wpp/:wabaId/message_templates — Criação (AC-5, AC-6)
   */
  @Post(':wabaId/message_templates')
  @ApiOperation({
    summary: 'Cria um template na WABA',
    description:
      'Encaminha o body íntegro à Meta Cloud API. Suporta todas as variantes de `components[]` (OTP copy-code, OTP one-tap, catálogo, multi-product, texto, imagem, localização, documento). A validação do shape de `components[]` é feita pela Meta. Resposta da Meta repassada sem alteração.',
  })
  @ApiParam({
    name: 'wabaId',
    description: 'ID da WABA (`{{WABA-ID}}`)',
    example: 'waba456',
  })
  @ApiResponse({
    status: 200,
    description:
      'Template criado (resposta da Meta, ex.: { id, status, category })',
  })
  @ApiResponse({
    status: 201,
    description: 'Template criado (resposta da Meta)',
  })
  @ApiResponse({
    status: 400,
    description: 'Erro de validação repassado da Meta',
  })
  @ApiResponse({ status: 401, description: 'Chave de API ausente ou inválida' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async create(
    @Param('wabaId') wabaId: string,
    @Body() dto: CreateTemplateDto,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${wabaId}/message_templates`;
    this.logger.log(`POST ${path} name=${dto.name} category=${dto.category}`);

    const result = await this.wppService.forward('POST', path, { body: dto });

    this.logger.log(`POST ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }

  /**
   * POST /wpp/:wabaId/migrate_message_templates — Migração entre WABAs
   *
   * Passthrough puro. As queries (`source_waba_id`, `page_number`, `count`,
   * `template_ids`) vão cruas para a Meta; quem valida a regra é ela.
   *
   * A restrição que sempre pega quem chama: **origem e destino têm de pertencer
   * ao MESMO negócio Meta**. E a migração não MOVE — recria no destino, com ids
   * novos e qualidade zerada em `UNKNOWN`. Só `APPROVED` com qualidade `GREEN`
   * ou `UNKNOWN` é elegível.
   *
   * Declarada ANTES de `POST /:templateId` por clareza de leitura: são caminhos
   * de profundidades diferentes e não colidem, mas manter os de dois segmentos
   * juntos evita que alguém encaixe um handler de um segmento no meio.
   */
  @Post(':wabaId/migrate_message_templates')
  @ApiOperation({
    summary: 'Migra templates de outra WABA para esta',
    description:
      'Encaminha `POST /{destino}/migrate_message_templates` à Meta. Query `source_waba_id` é obrigatória; `page_number`, `count` e `template_ids` são opcionais e repassados sem alteração. A Meta exige que origem e destino pertençam ao mesmo negócio. Resposta ({ migrated_templates, failed_templates }) repassada sem alteração.',
  })
  @ApiParam({
    name: 'wabaId',
    description: 'ID da WABA de DESTINO (`{{WABA-ID}}`)',
    example: 'waba456',
  })
  @ApiQuery({
    name: 'source_waba_id',
    required: true,
    description: 'ID da WABA de ORIGEM',
    example: 'waba123',
  })
  @ApiQuery({
    name: 'page_number',
    required: false,
    description: 'Página (0-indexada, blocos de 500)',
  })
  @ApiQuery({
    name: 'count',
    required: false,
    description: 'Tamanho do bloco (máx. 500)',
  })
  @ApiQuery({
    name: 'template_ids',
    required: false,
    description: 'JSON array de ids de template (máx. 500)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Resultado da migração (resposta da Meta: { migrated_templates, failed_templates })',
  })
  @ApiResponse({
    status: 400,
    description:
      'Erro repassado da Meta (ex.: WABAs em negócios diferentes, source_waba_id ausente)',
  })
  @ApiResponse({ status: 401, description: 'Chave de API ausente ou inválida' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async migrateTemplates(
    @Param('wabaId') wabaId: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${wabaId}/migrate_message_templates`;
    this.logger.log(`POST ${path} source_waba_id=${query?.source_waba_id ?? '-'}`);

    const result = await this.wppService.forward('POST', path, { query });

    this.logger.log(`POST ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }

  /**
   * POST /wpp/:templateId — Edição (AC-7)
   */
  @Post(':templateId')
  @ApiOperation({
    summary: 'Edita um template existente',
    description:
      'Encaminha o body íntegro à Meta Cloud API para editar o template identificado por `:templateId`. Passthrough: `name`, `components[]`, `language` e `category` são repassados sem reinterpretação.',
  })
  @ApiParam({
    name: 'templateId',
    description: 'ID do template (`<TEMPLATE_ID>`)',
    example: 'tpl123',
  })
  @ApiResponse({
    status: 200,
    description: 'Template editado (resposta da Meta, ex.: { success: true })',
  })
  @ApiResponse({
    status: 400,
    description: 'Erro de validação repassado da Meta',
  })
  @ApiResponse({ status: 401, description: 'Chave de API ausente ou inválida' })
  @ApiResponse({
    status: 404,
    description: 'Template inexistente (repassado da Meta)',
  })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async edit(
    @Param('templateId') templateId: string,
    @Body() dto: EditTemplateDto,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`POST ${templateId} (edição)`);

    const result = await this.wppService.forward('POST', templateId, {
      body: dto,
    });

    this.logger.log(`POST ${templateId} → ${result.status}`);
    res.status(result.status).json(result.data);
  }

  /**
   * DELETE /wpp/:wabaId/message_templates — Remoção por nome ou por ID (AC-8, AC-9)
   */
  @Delete(':wabaId/message_templates')
  @ApiOperation({
    summary: 'Remove template(s) da WABA',
    description:
      'Com `name=<NOME>`: remove todos os templates com aquele nome (todas as línguas). Com `hsm_id=<ID>&name=<NOME>`: remove o template específico por ID. Ambas as queries são repassadas íntegras à Meta.',
  })
  @ApiParam({
    name: 'wabaId',
    description: 'ID da WABA (`{{WABA-ID}}`)',
    example: 'waba456',
  })
  @ApiQuery({
    name: 'name',
    required: false,
    description: 'Nome do template a remover (passthrough)',
    example: 'hello_world',
  })
  @ApiQuery({
    name: 'hsm_id',
    required: false,
    description: 'ID do template (HSM) para remoção por ID (passthrough)',
    example: '123',
  })
  @ApiResponse({
    status: 200,
    description:
      'Template(s) removido(s) (resposta da Meta, ex.: { success: true })',
  })
  @ApiResponse({ status: 401, description: 'Chave de API ausente ou inválida' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async deleteTemplates(
    @Param('wabaId') wabaId: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${wabaId}/message_templates`;
    this.logger.log(`DELETE ${path}`);

    const result = await this.wppService.forward('DELETE', path, { query });

    this.logger.log(`DELETE ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }
}
