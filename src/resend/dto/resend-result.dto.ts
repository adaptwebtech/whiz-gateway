import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * DTO de resposta para operação de reenvio de mensagens mortas.
 */
export class ResendResultDto {
  @ApiProperty({
    description: 'Total de mensagens processadas.',
    example: 10,
  })
  @Expose()
  total: number;

  @ApiProperty({
    description: 'Quantidade de mensagens reenviadas com sucesso.',
    example: 8,
  })
  @Expose()
  reenviadas: number;

  @ApiProperty({
    description: 'Quantidade de mensagens que falharam no reenvio.',
    example: 2,
  })
  @Expose()
  falhas: number;
}
