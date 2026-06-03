import { ApiProperty } from '@nestjs/swagger';

export class WebhookVerifyQueryDto {
  @ApiProperty({
    description: 'Modo de verificação enviado pela Meta.',
    example: 'subscribe',
  })
  'hub.mode': string;

  @ApiProperty({
    description: 'Token de verificação configurado no painel Meta.',
    example: 'meu_token',
  })
  'hub.verify_token': string;

  @ApiProperty({
    description: 'Desafio a ser retornado para confirmar o endpoint.',
    example: '1234567890',
  })
  'hub.challenge': string;
}
