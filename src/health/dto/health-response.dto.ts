import { ApiProperty } from '@nestjs/swagger';
import { HealthCheckResult } from '@nestjs/terminus';

/**
 * Corpo de resposta do healthcheck de readiness (FR-14, §7).
 */
export class HealthResponseDto {
  @ApiProperty({
    description: 'Estado geral da aplicação.',
    example: 'ok',
  })
  status!: string;

  @ApiProperty({
    description: 'Momento da checagem em formato ISO8601.',
    example: '2026-06-01T12:00:00.000Z',
  })
  timestamp!: string;

  @ApiProperty({
    description: 'Resultado por indicador (banco de dados e broker).',
    example: {
      database: { status: 'up' },
      broker: { status: 'up' },
    },
  })
  checks!: HealthCheckResult['details'];
}
