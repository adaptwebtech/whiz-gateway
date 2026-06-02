import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * DTO de resposta para o recurso Inbox.
 */
export class InboxResponseDto {
  @ApiProperty({
    description: 'Identificador único da inbox (UUID).',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @Expose()
  id: string;

  @ApiProperty({
    description: 'Identificador do ambiente ao qual a inbox pertence.',
    example: 1,
  })
  @Expose()
  id_ambiente: number;

  @ApiProperty({
    description: 'Identificador externo único da inbox (ex.: número WhatsApp).',
    example: 'whatsapp-123',
  })
  @Expose()
  pid: string;

  @ApiProperty({
    description: 'Nome da inbox.',
    example: 'WhatsApp Dev',
  })
  @Expose()
  nome: string;

  @ApiProperty({
    description: 'Indica se a inbox foi removida (soft-delete).',
    example: false,
  })
  @Expose()
  del: boolean;

  @ApiProperty({
    description: 'Data de criação da inbox (ISO 8601).',
    example: '2026-06-01T00:00:00.000Z',
  })
  @Expose()
  data: string;
}
