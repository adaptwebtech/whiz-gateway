import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GrievanceOfficerDetailsDto {
  @ApiProperty({
    description: 'Nome do responsável por reclamações',
    example: 'João Silva',
  })
  name: string;

  @ApiProperty({
    description: 'E-mail do responsável por reclamações',
    example: 'joao@empresa.com',
  })
  email: string;

  @ApiPropertyOptional({
    description: 'Telefone fixo do responsável (com DDI)',
    example: '+551133334444',
  })
  landline_number?: string;

  @ApiPropertyOptional({
    description: 'Telefone celular do responsável (com DDI)',
    example: '+5511999990001',
  })
  mobile_number?: string;
}

export class BusinessComplianceDto {
  @ApiProperty({
    description: 'Produto de mensagens (sempre "whatsapp")',
    example: 'whatsapp',
  })
  messaging_product: string;

  @ApiProperty({
    description: 'Nome da entidade empresarial',
    example: 'Empresa LTDA',
  })
  entity_name: string;

  @ApiProperty({
    description: 'Tipo da entidade (ex.: INDIVIDUAL, BUSINESS)',
    example: 'INDIVIDUAL',
  })
  entity_type: string;

  @ApiProperty({
    description: 'Indica se a entidade está registrada',
    example: true,
  })
  is_registered: boolean;

  @ApiProperty({
    description: 'Detalhes do responsável por reclamações (grievance officer)',
    type: GrievanceOfficerDetailsDto,
  })
  grievance_officer_details: GrievanceOfficerDetailsDto;
}
