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
import { CreateFlowCallbackDto } from './dto/create-flow-callback.dto';
import { FlowCallbackResponseDto } from './dto/flow-callback-response.dto';
import { UpdateFlowCallbackDto } from './dto/update-flow-callback.dto';
import { WppFlowCallbacksService } from './wpp-flow-callbacks.service';

@ApiTags('Flow Callbacks')
@ApiBearerAuth('bearer')
@UseGuards(ApiKeyGuard)
@UseFilters(WppAuthFilter)
@Controller('wpp-flow-callbacks')
export class WppFlowCallbacksController {
  constructor(private readonly service: WppFlowCallbacksService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Criar callback de flow',
    description: 'Cria um novo registro UID → URL para uso em flows dinâmicos.',
  })
  @ApiResponse({
    status: 201,
    description: 'Callback criado com sucesso',
    type: FlowCallbackResponseDto,
  })
  @ApiResponse({ status: 400, description: 'URL inválida' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  create(@Body() dto: CreateFlowCallbackDto): Promise<FlowCallbackResponseDto> {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar callbacks de flow',
    description:
      'Retorna todos os callbacks ativos, ordenados por data de criação decrescente.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de callbacks',
    type: [FlowCallbackResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  findAll(): Promise<FlowCallbackResponseDto[]> {
    return this.service.findAll();
  }

  @Get(':uid')
  @ApiOperation({
    summary: 'Buscar callback por UID',
    description: 'Retorna um callback pelo UID.',
  })
  @ApiParam({
    name: 'uid',
    description: 'Identificador único do callback',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Callback encontrado',
    type: FlowCallbackResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  @ApiResponse({ status: 404, description: 'Callback não encontrado' })
  findOne(@Param('uid') uid: string): Promise<FlowCallbackResponseDto> {
    return this.service.findOne(uid);
  }

  @Patch(':uid')
  @ApiOperation({
    summary: 'Atualizar URL do callback',
    description: 'Atualiza a URL de destino e invalida o cache Redis.',
  })
  @ApiParam({
    name: 'uid',
    description: 'Identificador único do callback',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Callback atualizado',
    type: FlowCallbackResponseDto,
  })
  @ApiResponse({ status: 400, description: 'URL inválida' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  @ApiResponse({ status: 404, description: 'Callback não encontrado' })
  update(
    @Param('uid') uid: string,
    @Body() dto: UpdateFlowCallbackDto,
  ): Promise<FlowCallbackResponseDto> {
    return this.service.update(uid, dto);
  }

  @Delete(':uid')
  @ApiOperation({
    summary: 'Remover callback (soft-delete)',
    description: 'Aplica soft-delete e invalida o cache Redis.',
  })
  @ApiParam({
    name: 'uid',
    description: 'Identificador único do callback',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Callback removido',
    type: FlowCallbackResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  @ApiResponse({ status: 404, description: 'Callback não encontrado' })
  remove(@Param('uid') uid: string): Promise<FlowCallbackResponseDto> {
    return this.service.remove(uid);
  }
}
