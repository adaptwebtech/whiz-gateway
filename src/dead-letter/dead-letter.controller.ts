import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { DeadLetterResponseDto } from './dto/dead-letter-response.dto';
import { ListDeadLetterQueryDto } from './dto/list-dead-letter-query.dto';
import { DeadLetterService } from './dead-letter.service';

/**
 * Controller da fila de mensagens mortas.
 */
@ApiTags('Mensagens Mortas')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('dead-letter')
export class DeadLetterController {
  constructor(private readonly service: DeadLetterService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar mensagens mortas',
    description:
      'Retorna a lista de mensagens mortas ativas (del=false) com filtros opcionais.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de mensagens mortas.',
    type: [DeadLetterResponseDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Chave de API ausente ou inválida.',
  })
  async findMany(
    @Query() query: ListDeadLetterQueryDto,
  ): Promise<DeadLetterResponseDto[]> {
    return this.service.findMany(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Buscar mensagem morta por ID',
    description: 'Retorna uma mensagem morta pelo seu identificador único.',
  })
  @ApiParam({
    name: 'id',
    description: 'Identificador único (UUID) da mensagem morta.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Mensagem morta encontrada.',
    type: DeadLetterResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Chave de API ausente ou inválida.',
  })
  @ApiResponse({
    status: 404,
    description: 'Mensagem morta não encontrada.',
  })
  async findById(@Param('id') id: string): Promise<DeadLetterResponseDto> {
    return this.service.findById(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Remover mensagem morta (soft-delete)',
    description: 'Marca a mensagem morta como removida (del=true).',
  })
  @ApiParam({
    name: 'id',
    description: 'Identificador único (UUID) da mensagem morta.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 204,
    description: 'Mensagem morta removida com sucesso.',
  })
  @ApiResponse({
    status: 401,
    description: 'Chave de API ausente ou inválida.',
  })
  @ApiResponse({
    status: 404,
    description: 'Mensagem morta não encontrada.',
  })
  async softDelete(@Param('id') id: string): Promise<void> {
    await this.service.softDelete(id);
  }
}
