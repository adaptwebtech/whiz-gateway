import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class EditTemplateDto {
  @ApiPropertyOptional({
    description:
      'Novo nome do template (opcional; a Meta pode restringir em alguns casos — passthrough)',
    example: 'hello_world_v2',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description:
      'Array de componentes atualizado (HEADER, BODY, FOOTER, BUTTONS). Passthrough — estrutura interna não validada localmente.',
    example: [{ type: 'BODY', text: 'Texto atualizado {{1}}' }],
    type: 'array',
    items: { type: 'object' },
  })
  @IsOptional()
  @IsArray()
  components?: object[];

  @ApiPropertyOptional({
    description:
      'Código de idioma do template no formato Meta (ex.: pt_BR, en_US)',
    example: 'pt_BR',
  })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({
    description:
      'Categoria do template. Valores aceitos pela Meta: AUTHENTICATION | MARKETING | UTILITY. Passthrough.',
    example: 'UTILITY',
  })
  @IsOptional()
  @IsString()
  category?: string;
}
