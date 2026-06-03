import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Valida que o DTO possui pelo menos um critério de busca válido:
 * - pid sozinho, OU
 * - dataInicio + dataFim juntos (ambos obrigatórios).
 * Também rejeita dataInicio > dataFim.
 */
function HasValidCriteria(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'hasValidCriteria',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const dto = args.object as ResendRequestDto;
          const hasPid = typeof dto.pid === 'string' && dto.pid.length > 0;
          const hasDataInicio =
            typeof dto.dataInicio === 'string' && dto.dataInicio.length > 0;
          const hasDataFim =
            typeof dto.dataFim === 'string' && dto.dataFim.length > 0;

          // Precisa de pid OU (dataInicio + dataFim)
          if (!hasPid && !hasDataInicio && !hasDataFim) return false;
          if (!hasPid && hasDataInicio && !hasDataFim) return false;
          if (!hasPid && !hasDataInicio && hasDataFim) return false;

          // dataInicio não pode ser posterior a dataFim
          if (hasDataInicio && hasDataFim) {
            const inicio = new Date(dto.dataInicio as string);
            const fim = new Date(dto.dataFim as string);
            if (inicio > fim) return false;
          }

          return true;
        },
        defaultMessage(): string {
          return 'Informe pid ou (dataInicio + dataFim). dataInicio não pode ser posterior a dataFim.';
        },
      },
    });
  };
}

/**
 * DTO de requisição para reenvio de mensagens mortas.
 */
export class ResendRequestDto {
  @ApiPropertyOptional({
    description: 'PID da inbox para filtrar mensagens mortas associadas.',
    example: 'whatsapp-pid-001',
  })
  @IsOptional()
  @IsString()
  pid?: string;

  @ApiPropertyOptional({
    description: 'Data início do intervalo de filtragem (ISO 8601).',
    example: '2026-06-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  dataInicio?: string;

  @ApiPropertyOptional({
    description: 'Data fim do intervalo de filtragem (ISO 8601).',
    example: '2026-06-30T23:59:59.999Z',
  })
  @IsOptional()
  @IsISO8601()
  dataFim?: string;

  @ApiPropertyOptional({
    description:
      'Forçar reenvio mesmo de mensagens já marcadas como reenviadas. Padrão: false.',
    example: false,
    default: false,
  })
  @IsBoolean()
  @HasValidCriteria({
    message:
      'Informe pid ou (dataInicio + dataFim). dataInicio não pode ser posterior a dataFim.',
  })
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === undefined || value === null) return false;
    return value;
  })
  forcarReenviadas: boolean = false;
}
