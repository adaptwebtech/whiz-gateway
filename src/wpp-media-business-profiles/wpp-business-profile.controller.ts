import {
  Body,
  Controller,
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
import { UpdateBusinessProfileDto } from './dto/update-business-profile.dto';

@ApiTags('Perfil de Negócio WhatsApp')
@ApiBearerAuth('bearer')
@UseFilters(WppAuthFilter)
@UseGuards(ApiKeyGuard)
@UsePipes(new ValidationPipe({ whitelist: false, transform: true }))
@Controller('wpp')
export class WppBusinessProfileController {
  private readonly logger = new Logger(WppBusinessProfileController.name);

  constructor(private readonly wppService: WppService) {}

  @Get(':phoneNumberId/whatsapp_business_profile')
  @ApiOperation({
    summary: 'Recupera perfil de negócio WhatsApp (síncrono)',
    description:
      'Repassa GET /:phoneNumberId/whatsapp_business_profile à Meta e retorna os campos do perfil.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número de telefone WhatsApp',
    example: 'pn001',
  })
  @ApiQuery({
    name: 'fields',
    required: false,
    description: 'Campos do perfil a retornar (passthrough)',
    example: 'about,email',
  })
  @ApiResponse({ status: 200, description: 'Dados do perfil (body Meta)' })
  @ApiResponse({ status: 401, description: 'Chave de API ausente ou inválida' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async getBusinessProfile(
    @Param('phoneNumberId') phoneNumberId: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${phoneNumberId}/whatsapp_business_profile`;
    this.logger.log(`GET ${path}`);
    const result = await this.wppService.forward('GET', path, { query });
    res.status(result.status).json(result.data);
  }

  @Post(':phoneNumberId/whatsapp_business_profile')
  @ApiOperation({
    summary: 'Atualiza perfil de negócio WhatsApp (síncrono)',
    description:
      'Repassa POST /:phoneNumberId/whatsapp_business_profile à Meta com o body íntegro.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número de telefone WhatsApp',
    example: 'pn001',
  })
  @ApiResponse({
    status: 200,
    description: 'Resultado da atualização (body Meta)',
  })
  @ApiResponse({ status: 401, description: 'Chave de API ausente ou inválida' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async updateBusinessProfile(
    @Param('phoneNumberId') phoneNumberId: string,
    @Body() dto: UpdateBusinessProfileDto,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${phoneNumberId}/whatsapp_business_profile`;
    this.logger.log(`POST ${path}`);
    const result = await this.wppService.forward('POST', path, { body: dto });
    res.status(result.status).json(result.data);
  }
}
