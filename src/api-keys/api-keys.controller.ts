import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyCreatedResponseDto } from './dto/api-key-created-response.dto';
import { ApiKeyResponseDto } from './dto/api-key-response.dto';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { AdminKeyGuard } from './guards/admin-key.guard';

@ApiTags('Chaves de API')
@ApiBearerAuth('bearer')
@UseGuards(AdminKeyGuard)
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly service: ApiKeysService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Criar chave de API',
    description:
      'Cria uma nova chave de API para autenticação de integrações externas.',
  })
  @ApiResponse({
    status: 201,
    description: 'Chave criada com sucesso',
    type: ApiKeyCreatedResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado — chave de administrador ausente ou inválida',
  })
  create(@Body() dto: CreateApiKeyDto): Promise<ApiKeyCreatedResponseDto> {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar chaves de API',
    description:
      'Retorna todas as chaves de API ativas (sem revelar os valores).',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de chaves de API',
    type: [ApiKeyResponseDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado — chave de administrador ausente ou inválida',
  })
  findAll(): Promise<ApiKeyResponseDto[]> {
    return this.service.findAll();
  }

  @Delete(':uid')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Revogar chave de API',
    description: 'Revoga (soft-delete) uma chave de API pelo seu UID.',
  })
  @ApiParam({
    name: 'uid',
    description: 'Identificador único da chave de API',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({ status: 204, description: 'Chave revogada com sucesso' })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado — chave de administrador ausente ou inválida',
  })
  @ApiResponse({ status: 404, description: 'Chave de API não encontrada' })
  revoke(@Param('uid') uid: string): Promise<void> {
    return this.service.revoke(uid);
  }
}
