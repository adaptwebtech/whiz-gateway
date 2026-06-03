import { ApiProperty } from '@nestjs/swagger';

export class SetTwoStepPinDto {
  @ApiProperty({ description: 'PIN de dois fatores', example: '123456' })
  pin: string;
}
