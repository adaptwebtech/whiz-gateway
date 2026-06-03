import { ApiProperty } from '@nestjs/swagger';

export class VerifyCodeDto {
  @ApiProperty({ description: 'Código de verificação', example: '123456' })
  code: string;
}
