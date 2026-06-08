import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { WppAuthFilter } from '../wpp/filters/wpp-auth.filter';
import { CreateRedirecionamentoWebhookDto } from './dto/create-redirecionamento-webhook.dto';
import { UpdateRedirecionamentoWebhookDto } from './dto/update-redirecionamento-webhook.dto';
import { RedirecionamentoWebhookResponseDto } from './dto/redirecionamento-webhook-response.dto';
import { DispatchResultDto } from './dto/dispatch-result.dto';
import { RedirecionamentosWebhooksService } from './redirecionamentos-webhooks.service';

@ApiTags('Redirecionamentos Webhooks')
@ApiBearerAuth('bearer')
@UseGuards(ApiKeyGuard)
@UseFilters(WppAuthFilter)
@Controller('redirecionamentos-webhooks')
export class RedirecionamentosWebhooksController {
  constructor(private readonly service: RedirecionamentosWebhooksService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Criar redirecionamento de webhook',
    description: 'Cria um novo registro de redirecionamento de webhook.',
  })
  @ApiResponse({
    status: 201,
    description: 'Redirecionamento criado com sucesso',
    type: RedirecionamentoWebhookResponseDto,
  })
  @ApiResponse({ status: 400, description: 'URL inválida ou dados incorretos' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  create(
    @Body() dto: CreateRedirecionamentoWebhookDto,
  ): Promise<RedirecionamentoWebhookResponseDto> {
    return this.service.create(dto);
  }

  @Post('dispatch')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Despachar payload para redirecionamentos ativos',
    description:
      'Recebe um payload Meta e o despacha para todos os redirecionamentos ativos correspondentes ao ambiente do inbox.',
  })
  @ApiResponse({
    status: 202,
    description: 'Payload despachado',
    type: DispatchResultDto,
  })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  dispatch(
    @Body() payload: Record<string, unknown>,
  ): Promise<DispatchResultDto> {
    return this.service.dispatch(payload);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar redirecionamentos de webhooks',
    description:
      'Retorna todos os redirecionamentos ativos, ordenados por data de criação decrescente.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de redirecionamentos',
    type: [RedirecionamentoWebhookResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  findAll(): Promise<RedirecionamentoWebhookResponseDto[]> {
    return this.service.findAll();
  }

  @Get(':uid')
  @ApiOperation({
    summary: 'Buscar redirecionamento por UID',
    description: 'Retorna um redirecionamento pelo UID.',
  })
  @ApiParam({
    name: 'uid',
    description: 'Identificador único do redirecionamento',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Redirecionamento encontrado',
    type: RedirecionamentoWebhookResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  @ApiResponse({ status: 404, description: 'Redirecionamento não encontrado' })
  findOne(
    @Param('uid') uid: string,
  ): Promise<RedirecionamentoWebhookResponseDto> {
    return this.service.findOne(uid);
  }

  @Patch(':uid')
  @ApiOperation({
    summary: 'Atualizar redirecionamento de webhook',
    description:
      'Atualiza os campos do redirecionamento identificado pelo UID.',
  })
  @ApiParam({
    name: 'uid',
    description: 'Identificador único do redirecionamento',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Redirecionamento atualizado',
    type: RedirecionamentoWebhookResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  @ApiResponse({ status: 404, description: 'Redirecionamento não encontrado' })
  update(
    @Param('uid') uid: string,
    @Body() dto: UpdateRedirecionamentoWebhookDto,
  ): Promise<RedirecionamentoWebhookResponseDto> {
    return this.service.update(uid, dto);
  }

  @Delete(':uid')
  @ApiOperation({
    summary: 'Remover redirecionamento (soft-delete)',
    description:
      'Aplica soft-delete no redirecionamento identificado pelo UID.',
  })
  @ApiParam({
    name: 'uid',
    description: 'Identificador único do redirecionamento',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Redirecionamento removido',
    type: RedirecionamentoWebhookResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  @ApiResponse({ status: 404, description: 'Redirecionamento não encontrado' })
  remove(
    @Param('uid') uid: string,
  ): Promise<RedirecionamentoWebhookResponseDto> {
    return this.service.remove(uid);
  }
}
