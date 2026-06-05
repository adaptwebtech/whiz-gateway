import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para resposta do endpoint de Flows (re-criptografada).
 */
export class FlowEndpointResponseDto {
  @ApiProperty({
    description: 'Dados de resposta re-criptografados com AES-256-GCM (base64)',
    example: 'base64encryptedresponse==',
  })
  encrypted_flow_data!: string;
}
