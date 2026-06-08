import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class RedirecionamentoWebhookResponseDto {
  @Expose()
  @ApiProperty({
    description: 'Identificador único do redirecionamento',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  uid: string;

  @Expose()
  @ApiProperty({
    description: 'URL de destino do redirecionamento',
    example: 'https://example.com/hook',
  })
  url: string;

  @Expose()
  @ApiProperty({
    description: 'Data de expiração do redirecionamento (ISO 8601) ou null',
    example: null,
    nullable: true,
  })
  data_expiracao: string | null;

  @Expose()
  @ApiProperty({
    description: 'Identificador do ambiente associado ou null',
    example: 1,
    nullable: true,
  })
  id_ambiente: number | null;

  @Expose()
  @ApiProperty({
    description: 'Data de criação do registro (ISO 8601)',
    example: '2026-01-01T00:00:00.000Z',
  })
  data: string;

  @Expose()
  @ApiProperty({
    description: 'Indica se o registro foi removido (soft-delete)',
    example: false,
  })
  del: boolean;
}
