import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, IsUrl, Min } from 'class-validator';

/**
 * DTO para criação de um novo ambiente.
 */
export class CreateAmbienteDto {
  @ApiProperty({
    description: 'Identificador fixo do ambiente (sem autoincrement).',
    example: 1,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  id: number;

  @ApiProperty({ description: 'Nome do ambiente.', example: 'development' })
  @IsString()
  @IsNotEmpty()
  nome: string;

  @ApiProperty({
    description: 'URL base do ambiente.',
    example: 'https://dev.2.whiz.net.br',
  })
  @IsUrl()
  url: string;
}
