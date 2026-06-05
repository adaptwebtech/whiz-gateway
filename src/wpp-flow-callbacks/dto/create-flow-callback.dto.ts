import { ApiProperty } from '@nestjs/swagger';
import { IsUrl } from 'class-validator';

export class CreateFlowCallbackDto {
  @ApiProperty({
    description: 'URL do backend do cliente que receberá payloads decriptados',
    example: 'https://exemplo.com/webhook/flow',
  })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url: string;
}
