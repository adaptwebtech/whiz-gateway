import { ApiProperty } from '@nestjs/swagger';

export class RegisterPhoneDto {
  @ApiProperty({ description: 'Produto de mensagens', example: 'whatsapp' })
  messaging_product: string;

  @ApiProperty({ description: 'PIN de dois fatores', example: '123456' })
  pin: string;
}
