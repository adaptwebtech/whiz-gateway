import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class CreateTemplateDto {
  @ApiProperty({
    description: 'Nome do template (identificador único dentro da WABA)',
    example: 'hello_world',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description:
      'Código de idioma do template no formato Meta (ex.: pt_BR, en_US)',
    example: 'pt_BR',
  })
  @IsString()
  language: string;

  @ApiProperty({
    description:
      'Categoria do template. Valores aceitos pela Meta: AUTHENTICATION | MARKETING | UTILITY. Outros valores não são barrados localmente — a Meta é a autoridade.',
    example: 'UTILITY',
  })
  @IsString()
  category: string;

  @ApiProperty({
    description:
      'Array de componentes do template (HEADER, BODY, FOOTER, BUTTONS). Passthrough — a estrutura interna não é validada localmente.',
    example: [
      {
        type: 'BODY',
        text: 'Olá {{1}}, seu código é {{2}}.',
      },
    ],
    type: 'array',
    items: { type: 'object' },
  })
  @IsArray()
  components: object[];
}
