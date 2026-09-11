import { ApiProperty } from '@nestjs/swagger';
import { Allow } from 'class-validator';

/**
 * DTO de PASSTHROUGH: o gateway repassa o corpo à Meta sem reinterpretar.
 *
 * `@Allow()` (e não `@IsString()` e cia.) é deliberado. O que estes decoradores
 * precisam fazer aqui é UMA coisa: registrar metadado de validação para o campo,
 * para que o pipe global não o trate como propriedade estranha.
 *
 * Por que sem metadado quebrava: o pipe global roda com `whitelist: true` +
 * `forbidNonWhitelisted: true`, e o `tsconfig` mira `ES2023` — logo
 * `useDefineForClassFields` ligado, e todo campo declarado vira propriedade
 * PRÓPRIA da instância criada pelo `class-transformer`, com valor `undefined`.
 * Sem metadado, essas propriedades caem como não-whitelisted e o pipe recusa a
 * requisição INTEIRA, mesmo sem corpo nenhum. Foi o que derrubou o Embedded
 * Signup em produção com "property override_callback_uri should not exist".
 *
 * E por que NÃO validar tipo: quem define o contrato destes campos é a Meta. Um
 * `@IsString()` aqui faria o gateway recusar payload que a Meta aceita (o teste
 * de QR code já mandava `generate_qr_image: true`, booleano). Validar tipo no
 * proxy é inventar um contrato que não é nosso.
 */
export class RequestCodeDto {
  @ApiProperty({ description: 'Método de verificação', example: 'SMS' })
  @Allow()
  code_method: string;

  @ApiProperty({ description: 'Localidade', example: 'pt_BR' })
  @Allow()
  locale: string;
}
