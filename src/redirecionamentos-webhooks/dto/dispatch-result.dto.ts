import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class DispatchResultDto {
  @Expose()
  @ApiProperty({
    description: 'Número de destinos para os quais o payload foi despachado',
    example: 2,
  })
  dispatched: number;
}
