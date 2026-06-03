import { ApiProperty } from '@nestjs/swagger';

export class RequestCodeDto {
  @ApiProperty({ description: 'Método de verificação', example: 'SMS' })
  code_method: string;

  @ApiProperty({ description: 'Localidade', example: 'pt_BR' })
  locale: string;
}
