import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { WppAuthFilter } from '../wpp/filters/wpp-auth.filter';
import { WppService } from '../wpp/wpp.service';
import { BusinessComplianceDto } from './dto/business-compliance.dto';

@ApiTags('WhatsApp — Business Compliance')
@ApiBearerAuth('bearer')
@UseFilters(WppAuthFilter)
@UseGuards(ApiKeyGuard)
@UsePipes(new ValidationPipe({ whitelist: false, transform: true }))
@Controller('wpp')
export class WppComplianceController {
  private readonly logger = new Logger(WppComplianceController.name);

  constructor(private readonly wppService: WppService) {}

  @Get(':phoneNumberId/business_compliance_info')
  @ApiOperation({
    summary: 'Consulta informações de conformidade',
    description:
      'Retorna as informações de conformidade regulatória (Índia) do número de telefone. Resposta da Meta repassada sem alteração.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número de telefone',
    example: 'pn001',
  })
  @ApiResponse({
    status: 200,
    description: 'Informações de conformidade (body Meta)',
  })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async getComplianceInfo(
    @Param('phoneNumberId') phoneNumberId: string,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${phoneNumberId}/business_compliance_info`;
    this.logger.log(`GET ${path}`);
    const result = await this.wppService.forward('GET', path, {});
    this.logger.log(`GET ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }

  @Post(':phoneNumberId/business_compliance_info')
  @ApiOperation({
    summary: 'Registra informações de conformidade',
    description:
      'Adiciona ou atualiza as informações de conformidade regulatória do número (exigido na Índia). Body repassado íntegro à Meta.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número de telefone',
    example: 'pn001',
  })
  @ApiResponse({
    status: 200,
    description: 'Conformidade registrada — { success: true } (body Meta)',
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos (body Meta)' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida ou ausente' })
  @ApiResponse({
    status: 502,
    description: 'Erro de transporte ao contatar a Meta',
  })
  async postComplianceInfo(
    @Param('phoneNumberId') phoneNumberId: string,
    @Body() dto: BusinessComplianceDto,
    @Res() res: Response,
  ): Promise<void> {
    const path = `${phoneNumberId}/business_compliance_info`;
    this.logger.log(`POST ${path}`);
    const result = await this.wppService.forward('POST', path, { body: dto });
    this.logger.log(`POST ${path} → ${result.status}`);
    res.status(result.status).json(result.data);
  }
}
