import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Corpo padronizado de resposta de erro (FR-10, §7).
 */
export class ErrorResponseDto {
  @ApiProperty({
    description: 'Código de status HTTP da falha.',
    example: 500,
  })
  statusCode!: number;

  @ApiProperty({
    description: 'Momento da falha em formato ISO8601.',
    example: '2026-06-01T12:00:00.000Z',
  })
  timestamp!: string;

  @ApiProperty({
    description: 'Mensagem descritiva do erro.',
    example: 'Internal Server Error',
  })
  message!: string;

  @ApiPropertyOptional({
    description:
      'Detalhes adicionais da falha. Presente apenas fora de produção.',
    example: { method: 'GET', route: '/exemplo' },
  })
  details?: unknown;
}
