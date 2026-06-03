import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WebhookCallbackDto {
  @ApiProperty({
    description: 'Identificador único do job de upload',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  jobId: string;

  @ApiProperty({
    description: 'Status do processamento do job',
    enum: ['done', 'failed'],
    example: 'done',
  })
  status: 'done' | 'failed';

  @ApiPropertyOptional({
    description: 'Payload de resposta da Meta em caso de sucesso',
    example: { id: 'media-abc123' },
  })
  payload?: unknown;

  @ApiPropertyOptional({
    description: 'Detalhe do erro em caso de falha',
    example: { error: { message: 'Upload failed', code: 400 } },
  })
  error?: unknown;
}
