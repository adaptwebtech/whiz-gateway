import { ApiProperty } from '@nestjs/swagger';

/**
 * Resultado do teste de alcançabilidade do endpoint (`url`) de um ambiente.
 */
export class AmbienteTestResponseDto {
  @ApiProperty({
    description: 'URL testada (url base do ambiente).',
    example: 'https://dev.2.whiz.net.br',
  })
  url: string;

  @ApiProperty({
    description:
      'true se o endpoint respondeu HTTP (mesmo 4xx/5xx); false em erro de ' +
      'rede/timeout.',
    example: true,
  })
  reachable: boolean;

  @ApiProperty({
    description: 'Código HTTP retornado, quando houve resposta.',
    example: 200,
    nullable: true,
  })
  status: number | null;

  @ApiProperty({
    description: 'Tempo até a resposta/erro, em milissegundos.',
    example: 143,
  })
  elapsedMs: number;

  @ApiProperty({
    description: 'Mensagem de erro quando não alcançável.',
    example: 'timeout of 5000ms exceeded',
    nullable: true,
  })
  error: string | null;
}
