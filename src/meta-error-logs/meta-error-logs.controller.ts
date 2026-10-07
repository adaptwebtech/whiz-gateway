import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { ListMetaErrorLogsQueryDto } from './dto/list-meta-error-logs-query.dto';
import { MetaErrorLogResponseDto } from './dto/meta-error-log-response.dto';
import { MetaErrorLogsService } from './meta-error-logs.service';

/**
 * Consulta dos erros da Meta persistidos. A rota por chave é o caminho curto:
 * a chave sai no log do gateway e no `error` do callback que o whiz-server
 * propaga ao front, então dá para ir do erro na tela ao corpo inteiro da Meta em
 * uma requisição.
 */
@ApiTags('Erros da Meta')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('meta-error-logs')
export class MetaErrorLogsController {
  constructor(private readonly service: MetaErrorLogsService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar erros da Meta',
    description:
      'Mais recentes primeiro. Filtros opcionais por origem, status e job de upload.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de erros.',
    type: [MetaErrorLogResponseDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Chave de API ausente ou inválida.',
  })
  async findMany(
    @Query() query: ListMetaErrorLogsQueryDto,
  ): Promise<MetaErrorLogResponseDto[]> {
    return this.service.findMany(query);
  }

  @Get(':chave')
  @ApiOperation({
    summary: 'Buscar um erro da Meta pela chave',
    description:
      'A chave é a que aparece no log do gateway (`erro da Meta persistido chave=…`) e no `chaveErro` do callback de upload.',
  })
  @ApiParam({
    name: 'chave',
    description: 'Chave de busca do erro.',
    example: 'ERRMETA-A1B2C3D4E5F6',
  })
  @ApiResponse({
    status: 200,
    description: 'Registro completo do erro.',
    type: MetaErrorLogResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Chave de API ausente ou inválida.',
  })
  @ApiResponse({ status: 404, description: 'Chave inexistente.' })
  async findByChave(
    @Param('chave') chave: string,
  ): Promise<MetaErrorLogResponseDto> {
    return this.service.findByChave(chave);
  }
}
