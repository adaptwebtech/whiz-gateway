import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrUpdateQrCodeDto {
  @ApiProperty({
    description: 'Mensagem pré-preenchida ao escanear o QR code',
    example: 'Olá, gostaria de mais informações!',
  })
  prefilled_message: string;

  @ApiPropertyOptional({
    description:
      'Formato da imagem do QR code a ser gerada (SVG ou PNG). Presente na criação.',
    example: 'SVG',
  })
  generate_qr_image?: string;

  @ApiPropertyOptional({
    description:
      'Código identificador do QR code. Presente na atualização (a Meta decide criar ou atualizar com base neste campo).',
    example: 'MYCODE123',
  })
  code?: string;
}
