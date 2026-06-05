import { ApiProperty } from '@nestjs/swagger';

export class ApiKeyResponseDto {
  @ApiProperty({
    description: 'Identificador único da chave de API',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  uid: string;

  @ApiProperty({
    description: 'Nome identificador da chave de API',
    example: 'integração-x',
  })
  name: string;

  @ApiProperty({
    description: 'Data de criação da chave de API',
    example: '2026-06-03T00:00:00.000Z',
  })
  data: Date | string;
}
