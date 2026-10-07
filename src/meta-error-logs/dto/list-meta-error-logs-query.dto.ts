import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ORIGENS_ERRO_META } from '../constants/meta-error-logs-tokens.constants';
import type { OrigemErroMeta } from '../constants/meta-error-logs-tokens.constants';

/**
 * DTO de query para listagem de erros da Meta.
 */
export class ListMetaErrorLogsQueryDto {
  @ApiPropertyOptional({
    description: 'Filtro por origem do erro.',
    enum: ORIGENS_ERRO_META,
    example: 'forwardBinary',
  })
  @IsOptional()
  @IsIn(ORIGENS_ERRO_META)
  origem?: OrigemErroMeta;

  @ApiPropertyOptional({
    description: 'Filtro por status HTTP recebido da Meta.',
    example: 400,
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  status?: number;

  @ApiPropertyOptional({
    description: 'Filtro pelo job de upload correlacionado.',
    example: 'ce15210a-5da8-4aa7-a662-d55771b47169',
  })
  @IsOptional()
  @IsString()
  job_id?: string;

  @ApiPropertyOptional({
    description: 'Limite de registros por página. Padrão: 50.',
    example: 50,
    default: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Offset para paginação. Padrão: 0.',
    example: 0,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;
}
