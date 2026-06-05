import { ApiProperty } from '@nestjs/swagger';

export class FlowCallbackResponseDto {
  @ApiProperty({
    description: 'Identificador único do registro (UUID v4)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  uid: string;

  @ApiProperty({
    description: 'URL do backend do cliente',
    example: 'https://exemplo.com/webhook/flow',
  })
  url: string;

  @ApiProperty({
    description: 'Data de criação (ISO 8601)',
    example: '2026-06-05T12:00:00.000Z',
  })
  data: string;

  @ApiProperty({
    description: 'Indica se o registro foi removido (soft-delete)',
    example: false,
  })
  del: boolean;
}
