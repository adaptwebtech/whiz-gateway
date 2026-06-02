import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * DTO de resposta para o recurso Ambiente.
 */
export class AmbienteResponseDto {
  @ApiProperty({ description: 'Identificador único do ambiente.', example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ description: 'Nome do ambiente.', example: 'development' })
  @Expose()
  nome: string;

  @ApiProperty({
    description: 'URL base do ambiente.',
    example: 'https://dev.2.whiz.net.br',
  })
  @Expose()
  url: string;

  @ApiProperty({
    description: 'Indica se o ambiente foi removido (soft-delete).',
    example: false,
  })
  @Expose()
  del: boolean;
}
