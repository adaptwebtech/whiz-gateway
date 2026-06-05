import { ApiProperty } from '@nestjs/swagger';

export class BlockUserItemDto {
  @ApiProperty({
    description: 'Número de telefone do usuário a bloquear/desbloquear',
    example: '+5511999990000',
  })
  user: string;
}

export class BlockUsersDto {
  @ApiProperty({
    description: 'Produto de mensagens (sempre "whatsapp")',
    example: 'whatsapp',
  })
  messaging_product: string;

  @ApiProperty({
    description: 'Lista de usuários a bloquear ou desbloquear',
    type: [BlockUserItemDto],
    example: [{ user: '+5511999990000' }],
  })
  block_users: BlockUserItemDto[];
}
