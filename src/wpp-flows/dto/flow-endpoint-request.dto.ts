import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/**
 * DTO para requisição do endpoint de Flows (criptografado pela Meta).
 */
export class FlowEndpointRequestDto {
  @ApiProperty({
    description: 'Dados do fluxo criptografados com AES-256-GCM (base64)',
    example: 'base64encrypteddata==',
  })
  @IsString()
  encrypted_flow_data!: string;

  @ApiProperty({
    description: 'Chave AES criptografada com RSA-OAEP (base64)',
    example: 'base64encryptedaeskey==',
  })
  @IsString()
  encrypted_aes_key!: string;

  @ApiProperty({
    description: 'Vetor de inicialização AES-GCM (base64)',
    example: 'base64iv==',
  })
  @IsString()
  initial_vector!: string;
}
