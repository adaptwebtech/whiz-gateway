import { ApiProperty } from '@nestjs/swagger';
import { IsUrl } from 'class-validator';

export class UpdateFlowCallbackDto {
  @ApiProperty({
    description: 'Nova URL do backend do cliente',
    example: 'https://novo.exemplo.com/webhook/flow',
  })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url: string;
}
