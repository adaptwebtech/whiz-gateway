import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Prisma schema (AC-1)', () => {
  let schema: string;

  beforeEach(() => {
    jest.resetAllMocks();
    schema = readFileSync(
      join(process.cwd(), 'prisma', 'schema.prisma'),
      'utf8',
    );
  });

  it('AC-1: declares ambiente, inboxes, fila_mensagens_mortas models and StatusFalhaMensagem enum with the §6 fields', () => {
    // Assert — models present
    expect(schema).toMatch(/model\s+ambiente\s*\{/);
    expect(schema).toMatch(/model\s+inboxes\s*\{/);
    expect(schema).toMatch(/model\s+fila_mensagens_mortas\s*\{/);

    // Assert — enum with the 5 §6 values
    expect(schema).toMatch(/enum\s+StatusFalhaMensagem\s*\{/);
    expect(schema).toContain('INBOX_NAO_REGISTRADA');
    expect(schema).toContain('FALHA_ENFILEIRAMENTO');
    expect(schema).toContain('NACK_RECEBIDO');
    expect(schema).toContain('FALHA_ENVIO');
    expect(schema).toContain('AMBIENTE_INDISPONIVEL');

    // Assert — ambiente fields
    expect(schema).toMatch(/\bnome\b/);
    expect(schema).toMatch(/\burl\b/);
    expect(schema).toMatch(/\bdel\b/);

    // Assert — inboxes fields (pid unique, id_ambiente FK)
    expect(schema).toMatch(/\bpid\b/);
    expect(schema).toContain('@unique');
    expect(schema).toMatch(/\bid_ambiente\b/);

    // Assert — fila_mensagens_mortas fields
    expect(schema).toMatch(/\bmessage\b/);
    expect(schema).toMatch(/\bid_inbox\b/);
    expect(schema).toMatch(/\bstatus\b/);
    expect(schema).toMatch(/\breenviado\b/);
  });
});
