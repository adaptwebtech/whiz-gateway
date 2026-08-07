import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

/**
 * DTO de criação de inbox.
 */
export class CreateInboxDto {
  @ApiProperty({
    description: 'Identificador do ambiente ao qual a inbox pertence.',
    example: 1,
  })
  @IsInt()
  @IsPositive()
  id_ambiente: number;

  @ApiProperty({
    description: 'Identificador externo único da inbox (ex.: número WhatsApp).',
    example: 'whatsapp-123',
  })
  @IsString()
  @IsNotEmpty()
  pid: string;

  @ApiProperty({
    description: 'Nome da inbox.',
    example: 'WhatsApp Dev',
  })
  @IsString()
  @IsNotEmpty()
  nome: string;

  @ApiPropertyOptional({
    description:
      'WABA dona do número. Usada para rotear os webhooks de nível WABA ' +
      '(account_update, phone_number_quality_update, message_template_*), que não ' +
      'trazem phone_number_id e por isso não podem ser resolvidos pelo pid.',
    example: '1613119706411328',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  waba_id?: string;
}
