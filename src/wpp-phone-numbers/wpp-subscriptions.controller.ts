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
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { WppAuthFilter } from '../wpp/filters/wpp-auth.filter';
import { WppService } from '../wpp/wpp.service';
import { OverrideCallbackDto } from './dto/override-callback.dto';

@ApiTags('WhatsApp — Inscrições de App')
@ApiBearerAuth('bearer')
@UseFilters(WppAuthFilter)
@UseGuards(ApiKeyGuard)
@UsePipes(new ValidationPipe({ whitelist: false, transform: true }))
@Controller('wpp')
export class WppSubscriptionsController {
  private readonly logger = new Logger(WppSubscriptionsController.name);

  constructor(private readonly wppService: WppService) {}

  @Post(':wabaId/subscribed_apps')
  @ApiOperation({
    summary: 'Inscreve aplicativo na WABA',
    description:
      'Inscreve o aplicativo na WABA especificada. Opcionalmente aceita override de callback. Resposta da Meta repassada sem alteração.',
  })
  @ApiParam({ name: 'wabaId', description: 'ID da WABA', example: 'waba123' })
  @ApiResponse({
    status: 200,
    description: 'Aplicativo inscrito (body Meta)',
  })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async subscribeApp(
    @Param('wabaId') wabaId: string,
    @Body() dto: OverrideCallbackDto,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${wabaId}/subscribed_apps`;
    this.logger.log(`POST ${path}`);
    const result = await this.wppService.forward('POST', path, { body: dto });
    this.logger.log(`POST ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }

  @Get(':wabaId/subscribed_apps')
  @ApiOperation({
    summary: 'Lista aplicativos inscritos na WABA',
    description:
      'Retorna a lista de aplicativos inscritos na WABA especificada. Resposta da Meta repassada sem alteração.',
  })
  @ApiParam({ name: 'wabaId', description: 'ID da WABA', example: 'waba123' })
  @ApiQuery({
    name: 'fields',
    required: false,
    description: 'Campos a retornar (passthrough)',
    example: 'id,name',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de aplicativos inscritos (body Meta)',
  })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async listSubscribedApps(
    @Param('wabaId') wabaId: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${wabaId}/subscribed_apps`;
    this.logger.log(`GET ${path}`);
    const result = await this.wppService.forward('GET', path, { query });
    this.logger.log(`GET ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }

  @Delete(':wabaId/subscribed_apps')
  @ApiOperation({
    summary: 'Cancela inscrição de aplicativo na WABA',
    description:
      'Remove a inscrição do aplicativo na WABA especificada. Resposta da Meta repassada sem alteração.',
  })
  @ApiParam({ name: 'wabaId', description: 'ID da WABA', example: 'waba123' })
  @ApiResponse({
    status: 200,
    description: 'Inscrição cancelada (body Meta)',
  })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async unsubscribeApp(
    @Param('wabaId') wabaId: string,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${wabaId}/subscribed_apps`;
    this.logger.log(`DELETE ${path}`);
    const result = await this.wppService.forward('DELETE', path, {});
    this.logger.log(`DELETE ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }
}
