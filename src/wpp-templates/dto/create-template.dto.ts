import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow, IsArray, IsString } from 'class-validator';

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

  /**
   * PASSTHROUGH. `@Allow()` (e não `@IsString()`) pelo mesmo motivo dos demais
   * DTOs de proxy: o que falta é registrar metadado de validação para o campo
   * não ser tratado como propriedade estranha pelo pipe global de `main.ts`
   * (`whitelist: true` + `forbidNonWhitelisted: true`). Quem define o contrato
   * deste campo é a Meta.
   *
   * Sem esta declaração, todo template com variáveis NOMEADAS era recusado AQUI,
   * com 400 "property parameter_format should not exist" — a requisição nunca
   * chegava à Meta.
   */
  @ApiPropertyOptional({
    description:
      'Formato dos parâmetros do template: `POSITIONAL` (`{{1}}`) ou `NAMED` (`{{nome}}`). Passthrough — a Meta é a autoridade sobre os valores aceitos.',
    example: 'NAMED',
  })
  @Allow()
  parameter_format?: string;
}
