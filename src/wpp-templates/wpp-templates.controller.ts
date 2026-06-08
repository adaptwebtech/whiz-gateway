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
