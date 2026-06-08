import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Allow,
  IsDateString,
  IsInt,
  IsOptional,
  IsUrl,
  ValidateIf,
} from 'class-validator';

export class CreateRedirecionamentoWebhookDto {
  @ApiProperty({
    description: 'URL de destino para o redirecionamento do webhook',
    example: 'https://example.com/hook',
  })
  @IsUrl()
  url: string;

  @ApiPropertyOptional({
    description: 'Identificador do ambiente associado',
    example: 1,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  id_ambiente?: number | null;

  @ApiPropertyOptional({
    description:
      'Data de expiração do redirecionamento. Null indica que nunca expira.',
    example: '2099-01-01T00:00:00.000Z',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf(
    (o: CreateRedirecionamentoWebhookDto) => o.data_expiracao !== null,
  )
  @IsDateString()
  @Allow()
  data_expiracao?: Date | null;
}
