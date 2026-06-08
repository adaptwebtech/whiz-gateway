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
import { BlockUsersDto } from './dto/block-users.dto';

@ApiTags('WhatsApp — Block Users')
@ApiSecurity('api-key')
@UseFilters(WppAuthFilter)
@UseGuards(ApiKeyGuard)
@UsePipes(new ValidationPipe({ whitelist: false, transform: true }))
@Controller('wpp')
export class WppBlockUsersController {
  private readonly logger = new Logger(WppBlockUsersController.name);

  constructor(private readonly wppService: WppService) {}

  @Get(':phoneNumberId/block_users')
  @ApiOperation({
    summary: 'Lista usuários bloqueados',
    description:
      'Retorna a lista de usuários bloqueados de enviar mensagens ao número. Query repassada íntegra à Meta.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número de telefone',
    example: 'pn001',
  })
  @ApiQuery({
    name: 'fields',
    required: false,
    description: 'Campos a retornar (passthrough)',
    example: 'user',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de usuários bloqueados (body Meta)',
  })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async listBlockedUsers(
    @Param('phoneNumberId') phoneNumberId: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${phoneNumberId}/block_users`;
    this.logger.log(`GET ${path}`);
    const result = await this.wppService.forward('GET', path, { query });
    this.logger.log(`GET ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }

  @Post(':phoneNumberId/block_users')
  @ApiOperation({
    summary: 'Bloqueia usuários',
    description:
      'Bloqueia os usuários especificados de enviar mensagens ao número. Body repassado íntegro à Meta.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número de telefone',
    example: 'pn001',
  })
  @ApiResponse({
    status: 200,
    description: 'Resultado do bloqueio (body Meta)',
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos (body Meta)' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async blockUsers(
    @Param('phoneNumberId') phoneNumberId: string,
    @Body() dto: BlockUsersDto,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${phoneNumberId}/block_users`;
    this.logger.log(`POST ${path}`);
    const result = await this.wppService.forward('POST', path, { body: dto });
    this.logger.log(`POST ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }

  @Delete(':phoneNumberId/block_users')
  @ApiOperation({
    summary: 'Desbloqueia usuários',
    description:
      'Desbloqueia os usuários especificados, permitindo que voltem a enviar mensagens ao número. Body repassado íntegro à Meta.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número de telefone',
    example: 'pn001',
  })
  @ApiResponse({
    status: 200,
    description: 'Resultado do desbloqueio (body Meta)',
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos (body Meta)' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async unblockUsers(
    @Param('phoneNumberId') phoneNumberId: string,
    @Body() dto: BlockUsersDto,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${phoneNumberId}/block_users`;
    this.logger.log(`DELETE ${path}`);
    const result = await this.wppService.forward('DELETE', path, { body: dto });
    this.logger.log(`DELETE ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }
}
