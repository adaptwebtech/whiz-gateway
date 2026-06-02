import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

/**
 * DTO de atualização parcial de inbox.
 * NOTA: `pid` é intencionalmente omitido — enviar `pid` retorna 400 (forbidNonWhitelisted).
 */
export class UpdateInboxDto {
  @ApiPropertyOptional({
    description: 'Novo nome da inbox.',
    example: 'WhatsApp Produção',
  })
  @IsOptional()
  @IsString()
  nome?: string;

  @ApiPropertyOptional({
    description: 'Novo identificador de ambiente.',
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  id_ambiente?: number;
}
