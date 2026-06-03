import { ApiPropertyOptional } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({
    description: 'Produto de mensagens (sempre "whatsapp")',
    example: 'whatsapp',
    enum: ['whatsapp'],
  })
  @IsIn(['whatsapp'])
  messaging_product: 'whatsapp';

  @ApiPropertyOptional({
    description: 'Tipo do destinatário',
    example: 'individual',
    default: 'individual',
  })
  @IsOptional()
  @IsString()
  recipient_type?: string;

  @ApiPropertyOptional({
    description:
      'Número do destinatário em formato E.164 (sem +). Obrigatório para envio de mensagens.',
    example: '5511999998888',
  })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({
    description:
      'Discriminador do tipo de mensagem. Obrigatório para envio; omitido em corpos de status (status: "read").',
    example: 'text',
    enum: [
      'text',
      'reaction',
      'image',
      'audio',
      'document',
      'sticker',
      'video',
      'contacts',
      'location',
      'template',
      'interactive',
    ],
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({
    description:
      'Status da mensagem — presente apenas em corpos de status (read+typing). Não usado em envios normais.',
    example: 'read',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'ID da mensagem — usado em corpos de status (read+typing).',
    example: 'wamid.HBgLNTUxMTk5OTk4ODg4FQIAERgSM2E2NjAyNzQ1NTM1NTg5OTQA',
  })
  @IsOptional()
  @IsString()
  message_id?: string;

  // ── Campos de reply ──────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Contexto de reply — torna o envio uma resposta a uma mensagem existente.',
    example: { message_id: 'wamid.HBgLNTUxMTk5OTk4ODg4FQIAERgSM2E2' },
  })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;

  // ── Objetos de tipo de mensagem (passados íntegros à Meta) ───────────────────

  @ApiPropertyOptional({
    description: 'Mensagem de texto. Requer type: "text".',
    example: { body: 'Olá, tudo bem?', preview_url: false },
  })
  @IsOptional()
  @IsObject()
  text?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Reação com emoji a uma mensagem existente. Requer type: "reaction".',
    example: { message_id: 'wamid.HBgLNTUx', emoji: '👍' },
  })
  @IsOptional()
  @IsObject()
  reaction?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Imagem por ID de mídia ou URL pública. Requer type: "image".',
    example: {
      link: 'https://exemplo.com/foto.jpg',
      caption: 'Foto do produto',
    },
  })
  @IsOptional()
  @IsObject()
  image?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Áudio por ID de mídia ou URL pública. Requer type: "audio".',
    example: { id: 'media-id-123' },
  })
  @IsOptional()
  @IsObject()
  audio?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Documento por ID de mídia ou URL pública. Requer type: "document".',
    example: {
      link: 'https://exemplo.com/doc.pdf',
      filename: 'contrato.pdf',
      caption: 'Contrato',
    },
  })
  @IsOptional()
  @IsObject()
  document?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Sticker por ID de mídia ou URL pública. Requer type: "sticker".',
    example: { id: 'sticker-id-456' },
  })
  @IsOptional()
  @IsObject()
  sticker?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Vídeo por ID de mídia ou URL pública. Requer type: "video".',
    example: { link: 'https://exemplo.com/video.mp4', caption: 'Apresentação' },
  })
  @IsOptional()
  @IsObject()
  video?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Array de contatos. Requer type: "contacts".',
    example: [
      {
        name: { formatted_name: 'João Silva', first_name: 'João' },
        phones: [{ phone: '5511999991111', type: 'CELL' }],
      },
    ],
  })
  @IsOptional()
  contacts?: unknown[];

  @ApiPropertyOptional({
    description: 'Localização geográfica. Requer type: "location".',
    example: {
      latitude: -23.5505,
      longitude: -46.6333,
      name: 'São Paulo',
      address: 'Av. Paulista, 1000',
    },
  })
  @IsOptional()
  @IsObject()
  location?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Template aprovado pela Meta. Requer type: "template". Cobre templates de texto, mídia e interativos.',
    example: {
      name: 'hello_world',
      language: { code: 'en_US' },
      components: [],
    },
  })
  @IsOptional()
  @IsObject()
  template?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Mensagem interativa (list, button, product, product_list, catalog_message, order_details, order_status). Requer type: "interactive".',
    example: {
      type: 'button',
      body: { text: 'Escolha uma opção' },
      action: {
        buttons: [{ type: 'reply', reply: { id: 'btn1', title: 'Sim' } }],
      },
    },
  })
  @IsOptional()
  @IsObject()
  interactive?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Indicador de digitação. Usado em conjunto com status: "read" no POST.',
    example: { type: 'text' },
  })
  @IsOptional()
  @IsObject()
  typing_indicator?: Record<string, unknown>;
}
