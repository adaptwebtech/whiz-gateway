import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateBusinessProfileDto {
  @ApiProperty({
    description: 'Produto de mensageria (deve ser "whatsapp")',
    example: 'whatsapp',
  })
  @IsString()
  messaging_product: string;

  @ApiPropertyOptional({
    description: 'Texto "sobre" do perfil do negócio',
    example: 'Somos uma empresa de tecnologia.',
  })
  @IsOptional()
  @IsString()
  about?: string;

  @ApiPropertyOptional({
    description: 'Endereço do negócio',
    example: 'Rua Exemplo, 123, São Paulo - SP',
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    description: 'Descrição do negócio',
    example: 'Empresa especializada em soluções digitais.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'E-mail de contato do negócio',
    example: 'contato@empresa.com',
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({
    description: 'Lista de URLs de sites do negócio',
    example: ['https://www.empresa.com'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  websites?: string[];

  @ApiPropertyOptional({
    description: 'Setor vertical do negócio',
    example: 'TECHNOLOGY',
  })
  @IsOptional()
  @IsString()
  vertical?: string;

  @ApiPropertyOptional({
    description: 'Handle da foto de perfil obtido via upload resumível',
    example: 'h_abc123def456',
  })
  @IsOptional()
  @IsString()
  profile_picture_handle?: string;
}
