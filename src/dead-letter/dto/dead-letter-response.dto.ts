import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { StatusFalhaMensagem } from '@prisma/client';

/**
 * DTO de resposta para o recurso de fila de mensagens mortas.
 */
export class DeadLetterResponseDto {
  @ApiProperty({
    description: 'Identificador único do registro (UUID).',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @Expose()
  id: string;

  @ApiProperty({
    description: 'Payload original da mensagem que falhou.',
    example: { body: 'test webhook payload' },
  })
  @Expose()
  message: unknown;

  @ApiProperty({
    description: 'Identificador da inbox associada, ou null se desconhecida.',
    example: 'inbox-uuid-001',
    nullable: true,
  })
  @Expose()
  id_inbox: string | null;

  @ApiProperty({
    description: 'Status de falha da mensagem.',
    enum: StatusFalhaMensagem,
    example: StatusFalhaMensagem.FALHA_ENVIO,
  })
  @Expose()
  status: StatusFalhaMensagem;

  @ApiProperty({
    description: 'Indica se a mensagem foi reenviada com sucesso.',
    example: false,
  })
  @Expose()
  reenviado: boolean;

  @ApiProperty({
    description: 'Indica se o registro foi removido (soft-delete).',
    example: false,
  })
  @Expose()
  del: boolean;

  @ApiProperty({
    description: 'Data de criação do registro (ISO 8601).',
    example: '2026-06-01T00:00:00.000Z',
  })
  @Expose()
  data: string;
}
