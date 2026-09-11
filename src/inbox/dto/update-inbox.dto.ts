import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  ValidateIf,
} from 'class-validator';

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

  @ApiPropertyOptional({
    description:
      'WABA dona do número, usada para rotear os webhooks de nível WABA.',
    example: '1613119706411328',
  })
  // `null` é aceito de propósito: é como se LIMPA a WABA de uma inbox que foi
  // cadastrada com a errada. Sem isso não havia caminho para desfazer — a UI
  // omite campo vazio, e omitir significa "não mexe".
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  waba_id?: string | null;
}
