import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UploadMediaDto {
  @ApiProperty({
    description: 'Produto de mensageria (deve ser "whatsapp")',
    example: 'whatsapp',
  })
  @IsString()
  messaging_product: string;

  @ApiPropertyOptional({
    description:
      'URL de callback para receber o resultado do upload via webhook',
    example: 'https://meu-servidor.com/webhook/media',
  })
  @IsOptional()
  @IsString()
  callback_url?: string;
}
