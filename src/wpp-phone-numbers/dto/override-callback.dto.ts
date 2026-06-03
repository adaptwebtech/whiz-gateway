import { ApiPropertyOptional } from '@nestjs/swagger';

export class OverrideCallbackDto {
  @ApiPropertyOptional({
    description: 'URL de callback alternativa',
    example: 'https://meuservidor.com/webhook',
  })
  override_callback_uri?: string;

  @ApiPropertyOptional({
    description: 'Token de verificação',
    example: 'secret-token',
  })
  verify_token?: string;
}
