import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
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
import { AdminKeyGuard } from '../api-keys/guards/admin-key.guard';
import { AmbienteService } from './ambiente.service';
import { AmbienteResponseDto } from './dto/ambiente-response.dto';
import { CreateAmbienteDto } from './dto/create-ambiente.dto';
import { UpdateAmbienteDto } from './dto/update-ambiente.dto';

@ApiTags('Ambientes')
@ApiBearerAuth('bearer')
@UseGuards(AdminKeyGuard)
@Controller('ambientes')
export class AmbienteController {
  constructor(private readonly service: AmbienteService) {}

  @Get()
  @ApiOperation({ summary: 'Lista todos os ambientes ativos.' })
  @ApiResponse({
    status: 200,
    description: 'Lista de ambientes com del=false.',
    type: AmbienteResponseDto,
    isArray: true,
  })
  @ApiResponse({
    status: 401,
    description: 'Chave de administrador ausente ou inválida.',
  })
  findAll(): Promise<AmbienteResponseDto[]> {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca um ambiente pelo id.' })
  @ApiParam({
    name: 'id',
    description: 'Identificador numérico do ambiente.',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Ambiente encontrado.',
    type: AmbienteResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Chave de administrador ausente ou inválida.',
  })
  @ApiResponse({ status: 404, description: 'Ambiente não encontrado.' })
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<AmbienteResponseDto> {
    return this.service.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Cria um novo ambiente.' })
  @ApiResponse({
    status: 201,
    description: 'Ambiente criado com sucesso.',
    type: AmbienteResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' })
  @ApiResponse({
    status: 401,
    description: 'Chave de administrador ausente ou inválida.',
  })
  @ApiResponse({ status: 409, description: 'Ambiente com este id já existe.' })
  create(@Body() dto: CreateAmbienteDto): Promise<AmbienteResponseDto> {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza parcialmente um ambiente.' })
  @ApiParam({
    name: 'id',
    description: 'Identificador numérico do ambiente.',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Ambiente atualizado com sucesso.',
    type: AmbienteResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' })
  @ApiResponse({
    status: 401,
    description: 'Chave de administrador ausente ou inválida.',
  })
  @ApiResponse({ status: 404, description: 'Ambiente não encontrado.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAmbienteDto,
  ): Promise<AmbienteResponseDto> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove (soft-delete) um ambiente pelo id.' })
  @ApiParam({
    name: 'id',
    description: 'Identificador numérico do ambiente.',
    example: 1,
  })
  @ApiResponse({ status: 200, description: 'Ambiente removido com sucesso.' })
  @ApiResponse({
    status: 401,
    description: 'Chave de administrador ausente ou inválida.',
  })
  @ApiResponse({ status: 404, description: 'Ambiente não encontrado.' })
  softDelete(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.service.softDelete(id);
  }
}
