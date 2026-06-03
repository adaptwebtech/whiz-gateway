import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class MarkAsReadDto {
  @ApiProperty({
    description: 'Produto de mensagens (sempre "whatsapp")',
    example: 'whatsapp',
    enum: ['whatsapp'],
  })
  @IsIn(['whatsapp'])
  messaging_product: 'whatsapp';

  @ApiProperty({
    description: 'Status a definir (sempre "read" para marcar como lida)',
    example: 'read',
    enum: ['read'],
  })
  @IsIn(['read'])
  status: 'read';

  @ApiProperty({
    description: 'ID da mensagem recebida a marcar como lida',
    example: 'wamid.HBgLNTUxMTk5OTk4ODg4FQIAERgSM2E2NjAyNzQ1NTM1NTg5OTQA',
  })
  @IsString()
  @IsNotEmpty()
  message_id: string;
}
