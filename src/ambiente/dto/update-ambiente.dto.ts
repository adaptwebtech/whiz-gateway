import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

/**
 * DTO para atualização parcial de um ambiente. O campo id não é atualizável.
 */
export class UpdateAmbienteDto {
  @ApiPropertyOptional({
    description: 'Nome do ambiente.',
    example: 'staging',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nome?: string;

  @ApiPropertyOptional({
    description: 'URL base do ambiente.',
    example: 'https://staging.whiz.net.br',
  })
  @IsOptional()
  @IsUrl()
  url?: string;
}
