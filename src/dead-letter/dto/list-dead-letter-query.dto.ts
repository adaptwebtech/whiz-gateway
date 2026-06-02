import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { StatusFalhaMensagem } from '@prisma/client';

/**
 * DTO de query para listagem de mensagens mortas.
 */
export class ListDeadLetterQueryDto {
  @ApiPropertyOptional({
    description: 'Filtro por PID da inbox associada.',
    example: 'whatsapp-123',
  })
  @IsOptional()
  @IsString()
  pid?: string;

  @ApiPropertyOptional({
    description: 'Filtro por ID da inbox.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsString()
  id_inbox?: string;

  @ApiPropertyOptional({
    description: 'Filtro por status de falha.',
    enum: StatusFalhaMensagem,
    example: StatusFalhaMensagem.FALHA_ENVIO,
  })
  @IsOptional()
  @IsEnum(StatusFalhaMensagem)
  status?: StatusFalhaMensagem;

  @ApiPropertyOptional({
    description: 'Filtro por flag de reenvio.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  reenviado?: boolean;

  @ApiPropertyOptional({
    description: 'Data início do filtro por período (ISO 8601).',
    example: '2026-05-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  dataInicio?: string;

  @ApiPropertyOptional({
    description: 'Data fim do filtro por período (ISO 8601).',
    example: '2026-06-30T23:59:59.999Z',
  })
  @IsOptional()
  @IsISO8601()
  dataFim?: string;

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
