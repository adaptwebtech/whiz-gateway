import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Body,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { FlowEndpointRequestDto } from './dto/flow-endpoint-request.dto';
import { FlowEndpointResponseDto } from './dto/flow-endpoint-response.dto';
import { WppFlowsEndpointService } from './wpp-flows-endpoint.service';

/**
 * Controlador do endpoint público de Flows (sem ApiKeyGuard).
 * Autenticado via assinatura X-Hub-Signature-256 verificada dentro do serviço.
 */
@ApiTags('Flows Endpoint')
@Controller('wpp/flows')
export class WppFlowsEndpointController {
  constructor(private readonly endpointService: WppFlowsEndpointService) {}

  @Post('endpoint/:uid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Endpoint público de Flows',
    description:
      'Recebe payload criptografado da Meta, descriptografa, encaminha ao cliente e re-criptografa a resposta.',
  })
  @ApiParam({
    name: 'uid',
    description: 'Identificador único do flow callback',
    example: 'uid-123',
  })
  @ApiResponse({
    status: 200,
    description: 'Resposta re-criptografada retornada com sucesso',
    type: FlowEndpointResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Assinatura X-Hub-Signature-256 inválida',
  })
  @ApiResponse({ status: 404, description: 'UID não encontrado' })
  @ApiResponse({
    status: 421,
    description: 'Falha na descriptografia (chave RSA incorreta)',
  })
  @ApiResponse({
    status: 503,
    description: 'FLOWS_PRIVATE_KEY não configurado',
  })
  async handleEndpoint(
    @Param('uid') uid: string,
    @Body() body: FlowEndpointRequestDto,
    @Req() req: { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature: string,
  ): Promise<{ encrypted_flow_data: string }> {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(body));
    return this.endpointService.handle(uid, body, rawBody, signature);
  }
}
