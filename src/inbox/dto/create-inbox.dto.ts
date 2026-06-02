import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsPositive, IsString } from 'class-validator';

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
}
