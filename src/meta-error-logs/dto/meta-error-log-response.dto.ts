import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * DTO de resposta de um erro da Meta persistido.
 */
export class MetaErrorLogResponseDto {
  @ApiProperty({
    description: 'Identificador único do registro (UUID).',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @Expose()
  id: string;

  @ApiProperty({
    description:
      'Chave curta de busca, a mesma emitida em log no instante do persist.',
    example: 'ERRMETA-A1B2C3D4E5F6',
  })
  @Expose()
  chave: string;

  @ApiProperty({
    description:
      'Onde o erro aconteceu: forward, forwardMultipart, forwardBinary ou callback.',
    example: 'forwardBinary',
  })
  @Expose()
  origem: string;

  @ApiProperty({ description: 'Método HTTP da chamada.', example: 'POST' })
  @Expose()
  metodo: string;

  @ApiProperty({
    description: 'Sub-path da chamada à Meta (ou a URL do callback).',
    example: 'upload:MTphdHRhY2htZW50Oj...',
  })
  @Expose()
  sub_path: string;

  @ApiProperty({
    description:
      'URL absoluta de fato requisitada (ou a do callback). O sub_path é o que o caller pediu; esta é a rota que saiu do processo.',
    example:
      'https://graph.facebook.com/v24.0/upload:MTph...==?sig=ARZqAApVPDDNjMlPTpM',
    nullable: true,
  })
  @Expose()
  url: string | null;

  @ApiProperty({
    description:
      'Status HTTP recebido. null em erro de transporte (nenhuma resposta).',
    example: 400,
    nullable: true,
  })
  @Expose()
  status: number | null;

  @ApiProperty({
    description:
      'Código de erro da Meta (131053, 131049…), independente do status HTTP.',
    example: 131053,
    nullable: true,
  })
  @Expose()
  codigo_meta: number | null;

  @ApiProperty({
    description: 'Corpo da resposta, inteiro, sem truncar.',
    example: { error: { message: '(#100) …', code: 100 } },
    nullable: true,
  })
  @Expose()
  corpo: unknown;

  @ApiProperty({
    description: 'Headers enviados, com os segredos substituídos.',
    example: { 'Content-Type': 'application/octet-stream', file_offset: '0' },
    nullable: true,
  })
  @Expose()
  requisicao: unknown;

  @ApiProperty({
    description: 'Job de upload assíncrono correlacionado, quando houver.',
    example: 'ce15210a-5da8-4aa7-a662-d55771b47169',
    nullable: true,
  })
  @Expose()
  job_id: string | null;

  @ApiProperty({
    description:
      'Objeto a que o erro se refere quando não é uma chamada HTTP: o `wamid` da mensagem, nas falhas reportadas por webhook.',
    example: 'wamid.HBgMNTUzNTk3NjAyNzcyFQIAERgSN0JEMEVEQzJDNzlGMDY4NTcxAA==',
    nullable: true,
  })
  @Expose()
  referencia: string | null;

  @ApiProperty({
    description: 'Mensagem do erro de transporte ou da falha de callback.',
    example: 'Error: ECONNRESET',
    nullable: true,
  })
  @Expose()
  mensagem: string | null;

  @ApiProperty({
    description: 'Data de criação do registro (ISO 8601).',
    example: '2026-10-07T13:54:09.006Z',
  })
  @Expose()
  data: string;
}
