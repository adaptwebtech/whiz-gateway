import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
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
import { ConfigService } from '@nestjs/config';
import { WppAuthFilter } from '../wpp/filters/wpp-auth.filter';
import { WppFlowCallbacksService } from '../wpp-flow-callbacks/wpp-flow-callbacks.service';
import { WppService } from '../wpp/wpp.service';

/**
 * Controlador de gerenciamento de Flows do WhatsApp.
 * Proxy autenticado para a API da Meta via ApiKeyGuard.
 */
@ApiTags('Flows')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@UseFilters(WppAuthFilter)
@Controller('wpp')
export class WppFlowsController {
  constructor(
    private readonly wppService: WppService,
    private readonly flowCallbacksService: WppFlowCallbacksService,
    private readonly configService: ConfigService,
  ) {}

  private getEndpointUri(uid: string): string {
    const gatewayUrl = this.configService.get<string>('GATEWAY_PUBLIC_URL');
    return `${gatewayUrl}/wpp/flows/endpoint/${uid}`;
  }

  /**
   * Envia resultado da Meta diretamente na resposta, preservando status e corpo originais.
   * Para erros 4xx/5xx, lança HttpException para que o filtro global trate corretamente.
   */
  private sendResult(
    result: { status: number; data: unknown },
    res: Response,
  ): void {
    res.status(result.status).json(result.data);
  }

  // ─── POST :wabaId/flows ───────────────────────────────────────────────────────

  @Post(':wabaId/flows')
  @UseInterceptors(AnyFilesInterceptor())
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Criar flow',
    description: 'Cria um novo flow no WABA especificado.',
  })
  @ApiParam({ name: 'wabaId', description: 'ID do WABA', example: 'waba-001' })
  @ApiResponse({ status: 200, description: 'Flow criado com sucesso' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida' })
  async createFlow(
    @Param('wabaId') wabaId: string,
    @Body() body: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.wppService.forward('POST', `${wabaId}/flows`, {
      body,
      contentType: 'multipart/form-data',
    });
    this.sendResult(result, res);
  }

  // ─── POST :uid/:wabaId/flows ──────────────────────────────────────────────────

  @Post(':uid/:wabaId/flows')
  @UseInterceptors(AnyFilesInterceptor())
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Criar flow dinâmico',
    description: 'Cria flow com endpoint_uri dinâmico gerado pelo gateway.',
  })
  @ApiParam({
    name: 'uid',
    description: 'UID do flow callback',
    example: 'uid-123',
  })
  @ApiParam({ name: 'wabaId', description: 'ID do WABA', example: 'waba-001' })
  @ApiResponse({ status: 200, description: 'Flow criado com endpoint_uri' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida' })
  @ApiResponse({ status: 404, description: 'UID não encontrado' })
  async createFlowWithUid(
    @Param('uid') uid: string,
    @Param('wabaId') wabaId: string,
    @Body() body: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const url = await this.flowCallbacksService.getUrl(uid);
    if (!url) throw new NotFoundException(`UID não encontrado: ${uid}`);

    const endpointUri = this.getEndpointUri(uid);
    const forwardBody = { ...body, endpoint_uri: endpointUri };

    const result = await this.wppService.forward('POST', `${wabaId}/flows`, {
      body: forwardBody,
      contentType: 'multipart/form-data',
    });
    this.sendResult(result, res);
  }

  // ─── POST :wabaId/migrate_flows ───────────────────────────────────────────────

  @Post(':wabaId/migrate_flows')
  @UseInterceptors(AnyFilesInterceptor())
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Migrar flows',
    description: 'Migra flows para o WABA especificado.',
  })
  @ApiParam({ name: 'wabaId', description: 'ID do WABA', example: 'waba-001' })
  @ApiResponse({ status: 200, description: 'Flows migrados com sucesso' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida' })
  async migrateFlows(
    @Param('wabaId') wabaId: string,
    @Body() body: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.wppService.forward(
      'POST',
      `${wabaId}/migrate_flows`,
      {
        body,
        contentType: 'multipart/form-data',
      },
    );
    this.sendResult(result, res);
  }

  // ─── POST :uid/:wabaId/migrate_flows ─────────────────────────────────────────

  @Post(':uid/:wabaId/migrate_flows')
  @UseInterceptors(AnyFilesInterceptor())
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Migrar flows dinâmico',
    description: 'Migra flows com endpoint_uri gerado pelo gateway.',
  })
  @ApiParam({
    name: 'uid',
    description: 'UID do flow callback',
    example: 'uid-123',
  })
  @ApiParam({ name: 'wabaId', description: 'ID do WABA', example: 'waba-001' })
  @ApiResponse({ status: 200, description: 'Flows migrados com endpoint_uri' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida' })
  @ApiResponse({ status: 404, description: 'UID não encontrado' })
  async migrateFlowsWithUid(
    @Param('uid') uid: string,
    @Param('wabaId') wabaId: string,
    @Body() body: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const url = await this.flowCallbacksService.getUrl(uid);
    if (!url) throw new NotFoundException(`UID não encontrado: ${uid}`);

    const endpointUri = this.getEndpointUri(uid);
    const forwardBody = { ...body, endpoint_uri: endpointUri };

    const result = await this.wppService.forward(
      'POST',
      `${wabaId}/migrate_flows`,
      {
        body: forwardBody,
        contentType: 'multipart/form-data',
      },
    );
    this.sendResult(result, res);
  }

  // ─── GET :wabaId/flows ────────────────────────────────────────────────────────

  @Get(':wabaId/flows')
  @ApiOperation({
    summary: 'Listar flows',
    description: 'Lista todos os flows do WABA especificado.',
  })
  @ApiParam({ name: 'wabaId', description: 'ID do WABA', example: 'waba-001' })
  @ApiResponse({
    status: 200,
    description: 'Lista de flows retornada com sucesso',
  })
  @ApiResponse({ status: 401, description: 'Chave de API inválida' })
  async listFlows(
    @Param('wabaId') wabaId: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.wppService.forward('GET', `${wabaId}/flows`, {});
    this.sendResult(result, res);
  }

  // ─── POST :flowId/assets ──────────────────────────────────────────────────────

  @Post(':flowId/assets')
  @UseInterceptors(AnyFilesInterceptor())
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enviar asset do flow',
    description: 'Envia um arquivo de asset para o flow especificado.',
  })
  @ApiParam({ name: 'flowId', description: 'ID do flow', example: 'flow-001' })
  @ApiResponse({ status: 200, description: 'Asset enviado com sucesso' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida' })
  async uploadFlowAsset(
    @Param('flowId') flowId: string,
    @Body() body: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.wppService.forward('POST', `${flowId}/assets`, {
      body,
      contentType: 'multipart/form-data',
    });
    this.sendResult(result, res);
  }

  // ─── POST :flowId/publish ─────────────────────────────────────────────────────

  @Post(':flowId/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Publicar flow',
    description: 'Publica o flow especificado.',
  })
  @ApiParam({ name: 'flowId', description: 'ID do flow', example: 'flow-001' })
  @ApiResponse({ status: 200, description: 'Flow publicado com sucesso' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida' })
  async publishFlow(
    @Param('flowId') flowId: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.wppService.forward(
      'POST',
      `${flowId}/publish`,
      {},
    );
    this.sendResult(result, res);
  }

  // ─── POST :flowId/deprecate ───────────────────────────────────────────────────

  @Post(':flowId/deprecate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deprecar flow',
    description: 'Marca o flow especificado como depreciado.',
  })
  @ApiParam({ name: 'flowId', description: 'ID do flow', example: 'flow-001' })
  @ApiResponse({ status: 200, description: 'Flow depreciado com sucesso' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida' })
  async deprecateFlow(
    @Param('flowId') flowId: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.wppService.forward(
      'POST',
      `${flowId}/deprecate`,
      {},
    );
    this.sendResult(result, res);
  }

  // ─── POST :phoneNumberId/whatsapp_business_encryption ────────────────────────

  @Post(':phoneNumberId/whatsapp_business_encryption')
  @UseInterceptors(AnyFilesInterceptor())
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Configurar criptografia de negócios',
    description:
      'Configura a chave pública de criptografia do negócio para o número de telefone.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número de telefone',
    example: 'phone-001',
  })
  @ApiResponse({
    status: 200,
    description: 'Criptografia configurada com sucesso',
  })
  @ApiResponse({ status: 401, description: 'Chave de API inválida' })
  async setBusinessEncryption(
    @Param('phoneNumberId') phoneNumberId: string,
    @Body() body: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.wppService.forward(
      'POST',
      `${phoneNumberId}/whatsapp_business_encryption`,
      { body, contentType: 'multipart/form-data' },
    );
    this.sendResult(result, res);
  }

  // ─── POST :phoneNumberId/messages ────────────────────────────────────────────

  @Post(':phoneNumberId/messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enviar mensagem',
    description: 'Envia uma mensagem pelo número de telefone especificado.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número de telefone',
    example: 'phone-001',
  })
  @ApiResponse({ status: 200, description: 'Mensagem enviada com sucesso' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida' })
  async sendMessage(
    @Param('phoneNumberId') phoneNumberId: string,
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.wppService.forward(
      'POST',
      `${phoneNumberId}/messages`,
      {
        body,
      },
    );
    this.sendResult(result, res);
  }

  // ─── POST :wabaId/message_templates ──────────────────────────────────────────

  @Post(':wabaId/message_templates')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Criar template de mensagem',
    description: 'Cria um template de mensagem no WABA especificado.',
  })
  @ApiParam({ name: 'wabaId', description: 'ID do WABA', example: 'waba-001' })
  @ApiResponse({ status: 200, description: 'Template criado com sucesso' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida' })
  async createMessageTemplate(
    @Param('wabaId') wabaId: string,
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.wppService.forward(
      'POST',
      `${wabaId}/message_templates`,
      {
        body,
      },
    );
    this.sendResult(result, res);
  }

  // ─── POST :flowId (Update Metadata — proxy puro) ──────────────────────────────

  @Post(':flowId')
  @UseInterceptors(AnyFilesInterceptor())
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Atualizar metadados do flow',
    description: 'Atualiza os metadados do flow especificado.',
  })
  @ApiParam({ name: 'flowId', description: 'ID do flow', example: 'flow-001' })
  @ApiResponse({
    status: 200,
    description: 'Metadados atualizados com sucesso',
  })
  @ApiResponse({ status: 401, description: 'Chave de API inválida' })
  async updateFlowMetadata(
    @Param('flowId') flowId: string,
    @Body() body: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.wppService.forward('POST', flowId, {
      body,
      contentType: 'multipart/form-data',
    });
    this.sendResult(result, res);
  }

  // ─── POST :uid/:flowId (Update Metadata dinâmico) ────────────────────────────

  @Post(':uid/:flowId')
  @UseInterceptors(AnyFilesInterceptor())
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Atualizar metadados do flow dinâmico',
    description:
      'Atualiza metadados do flow com endpoint_uri gerado pelo gateway.',
  })
  @ApiParam({
    name: 'uid',
    description: 'UID do flow callback',
    example: 'uid-123',
  })
  @ApiParam({ name: 'flowId', description: 'ID do flow', example: 'flow-001' })
  @ApiResponse({
    status: 200,
    description: 'Metadados atualizados com endpoint_uri',
  })
  @ApiResponse({ status: 401, description: 'Chave de API inválida' })
  @ApiResponse({ status: 404, description: 'UID não encontrado' })
  async updateFlowMetadataWithUid(
    @Param('uid') uid: string,
    @Param('flowId') flowId: string,
    @Body() body: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const url = await this.flowCallbacksService.getUrl(uid);
    if (!url) throw new NotFoundException(`UID não encontrado: ${uid}`);

    const endpointUri = this.getEndpointUri(uid);
    const forwardBody = { ...body, endpoint_uri: endpointUri };

    const result = await this.wppService.forward('POST', flowId, {
      body: forwardBody,
      contentType: 'multipart/form-data',
    });
    this.sendResult(result, res);
  }

  // ─── GET :flowId/assets ───────────────────────────────────────────────────────

  @Get(':flowId/assets')
  @ApiOperation({
    summary: 'Listar assets do flow',
    description: 'Lista os assets do flow especificado.',
  })
  @ApiParam({ name: 'flowId', description: 'ID do flow', example: 'flow-001' })
  @ApiResponse({ status: 200, description: 'Assets listados com sucesso' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida' })
  async listFlowAssets(
    @Param('flowId') flowId: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.wppService.forward('GET', `${flowId}/assets`, {});
    this.sendResult(result, res);
  }

  // ─── GET :phoneNumberId/whatsapp_business_encryption ─────────────────────────

  @Get(':phoneNumberId/whatsapp_business_encryption')
  @ApiOperation({
    summary: 'Obter criptografia de negócios',
    description:
      'Obtém a configuração de criptografia do negócio para o número de telefone.',
  })
  @ApiParam({
    name: 'phoneNumberId',
    description: 'ID do número de telefone',
    example: 'phone-001',
  })
  @ApiResponse({
    status: 200,
    description: 'Configuração de criptografia retornada',
  })
  @ApiResponse({ status: 401, description: 'Chave de API inválida' })
  async getBusinessEncryption(
    @Param('phoneNumberId') phoneNumberId: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.wppService.forward(
      'GET',
      `${phoneNumberId}/whatsapp_business_encryption`,
      {},
    );
    this.sendResult(result, res);
  }

  // ─── GET :flowId ──────────────────────────────────────────────────────────────

  @Get(':flowId')
  @ApiOperation({
    summary: 'Obter flow',
    description: 'Obtém detalhes do flow especificado.',
  })
  @ApiParam({ name: 'flowId', description: 'ID do flow', example: 'flow-001' })
  @ApiQuery({
    name: 'fields',
    required: false,
    description: 'Campos a retornar (suporta parênteses para métricas)',
    example: 'id,name,status',
  })
  @ApiResponse({ status: 200, description: 'Flow retornado com sucesso' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida' })
  async getFlow(
    @Param('flowId') flowId: string,
    @Query('fields') fields: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.wppService.forward('GET', flowId, {
      query: fields ? { fields } : undefined,
    });
    this.sendResult(result, res);
  }

  // ─── DELETE :flowId ───────────────────────────────────────────────────────────

  @Delete(':flowId')
  @ApiOperation({
    summary: 'Deletar flow',
    description: 'Remove permanentemente o flow especificado.',
  })
  @ApiParam({ name: 'flowId', description: 'ID do flow', example: 'flow-001' })
  @ApiResponse({ status: 200, description: 'Flow deletado com sucesso' })
  @ApiResponse({ status: 401, description: 'Chave de API inválida' })
  async deleteFlow(
    @Param('flowId') flowId: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.wppService.forward('DELETE', flowId, {});
    this.sendResult(result, res);
  }
}
