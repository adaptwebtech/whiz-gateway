import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateInboxDto } from './dto/create-inbox.dto';
import { InboxResponseDto } from './dto/inbox-response.dto';
import { UpdateInboxDto } from './dto/update-inbox.dto';
import { InboxService } from './inbox.service';

@ApiTags('Inboxes')
@ApiBearerAuth('bearer')
@Controller('inboxes')
export class InboxController {
  constructor(private readonly service: InboxService) {}

  @Get()
  @ApiOperation({ summary: 'Lista todas as inboxes ativas.' })
  @ApiResponse({
    status: 200,
    description: 'Lista de inboxes com del=false.',
    type: InboxResponseDto,
    isArray: true,
  })
  findAll(): Promise<InboxResponseDto[]> {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca uma inbox pelo id.' })
  @ApiResponse({
    status: 200,
    description: 'Inbox encontrada.',
    type: InboxResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Inbox não encontrada.' })
  findById(@Param('id') id: string): Promise<InboxResponseDto> {
    return this.service.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Cria uma nova inbox.' })
  @ApiResponse({
    status: 201,
    description: 'Inbox criada com sucesso.',
    type: InboxResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' })
  @ApiResponse({
    status: 409,
    description: 'Inbox com este pid já existe.',
  })
  create(@Body() dto: CreateInboxDto): Promise<InboxResponseDto> {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza parcialmente uma inbox.' })
  @ApiResponse({
    status: 200,
    description: 'Inbox atualizada com sucesso.',
    type: InboxResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' })
  @ApiResponse({ status: 404, description: 'Inbox não encontrada.' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateInboxDto,
  ): Promise<InboxResponseDto> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove (soft-delete) uma inbox pelo id.' })
  @ApiResponse({
    status: 200,
    description: 'Inbox removida com sucesso.',
    type: InboxResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Inbox não encontrada.' })
  softDelete(@Param('id') id: string): Promise<InboxResponseDto> {
    return this.service.softDelete(id);
  }
}
