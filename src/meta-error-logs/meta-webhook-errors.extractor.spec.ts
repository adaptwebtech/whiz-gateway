/**
 * Unit tests — extrairErrosDeWebhook (feature `meta-error-logs`).
 *
 * Cobre AC-22..AC-26: a metade ASSÍNCRONA das falhas da Meta, que nenhuma
 * resposta HTTP revela e que a tabela não enxergava.
 */

import { extrairErrosDeWebhook } from './meta-webhook-errors.extractor';

/** O payload real que motivou esta feature (131053, vídeo de 63 MB). */
const PAYLOAD_131053 = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '1613119706411328',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '5535910181134',
              phone_number_id: '1106219235900077',
            },
            contacts: [{ wa_id: '553597602772' }],
            statuses: [
              {
                id: 'wamid.HBgMNTUzNTk3NjAyNzcyFQIAERgSN0JEMEVEQzJDNzlGMDY4NTcxAA==',
                status: 'failed',
                timestamp: '1791468714',
                recipient_id: '553597602772',
                errors: [
                  {
                    code: 131053,
                    title: 'Media upload error',
                    message: 'Media upload error',
                    error_data: {
                      details:
                        'Video file has size 63787247 bytes but must be atmost 16777216 bytes and non-empty',
                    },
                  },
                ],
              },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
};

describe('extrairErrosDeWebhook', () => {
  it('AC-22: dado o webhook 131053, então devolve um erro com o wamid como referência', () => {
    // Act
    const erros = extrairErrosDeWebhook(PAYLOAD_131053);

    // Assert
    expect(erros).toHaveLength(1);
    expect(erros[0].referencia).toBe(
      'wamid.HBgMNTUzNTk3NjAyNzcyFQIAERgSN0JEMEVEQzJDNzlGMDY4NTcxAA==',
    );
    expect(erros[0].codigo).toBe(131053);
    expect(erros[0].wabaId).toBe('1613119706411328');
    expect(erros[0].pid).toBe('1106219235900077');
  });

  it('AC-22: o resumo traz o detalhe, que é onde mora a informação', () => {
    // Arrange: `title` e `message` são o mesmo rótulo genérico; o número de
    // bytes só existe em `error_data.details`.

    // Act
    const [erro] = extrairErrosDeWebhook(PAYLOAD_131053);

    // Assert
    expect(erro.resumo).toContain('131053');
    expect(erro.resumo).toContain('Media upload error');
    expect(erro.resumo).toContain('63787247');
    expect(erro.resumo).toContain('16777216');
  });

  it('AC-23: o corpo guardado é o STATUS inteiro, não só o erro', () => {
    // Arrange: é o status que carrega wamid, destinatário e timestamp.

    // Act
    const [erro] = extrairErrosDeWebhook(PAYLOAD_131053);

    // Assert
    const corpo = erro.corpo as Record<string, unknown>;
    expect(corpo['id']).toBe(
      'wamid.HBgMNTUzNTk3NjAyNzcyFQIAERgSN0JEMEVEQzJDNzlGMDY4NTcxAA==',
    );
    expect(corpo['recipient_id']).toBe('553597602772');
    expect(corpo['status']).toBe('failed');
    expect(Array.isArray(corpo['errors'])).toBe(true);
  });

  it('AC-24: webhook normal (mensagem recebida, sem errors) devolve lista vazia', () => {
    // Arrange: é o caso da esmagadora maioria do tráfego — esta função roda em
    // todos eles e não pode custar nada nem inventar registro.
    const normal = {
      entry: [
        {
          id: 'waba-1',
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'pid-1' },
                messages: [{ id: 'wamid.X', type: 'text' }],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    // Act / Assert
    expect(extrairErrosDeWebhook(normal)).toEqual([]);
  });

  it('AC-25: erro de nível conta (errors fora de statuses) também é capturado, sem referência', () => {
    // Arrange
    const nivelConta = {
      entry: [
        {
          id: 'waba-1',
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'pid-1' },
                errors: [{ code: 131031, title: 'Account has been locked' }],
              },
              field: 'account_update',
            },
          ],
        },
      ],
    };

    // Act
    const erros = extrairErrosDeWebhook(nivelConta);

    // Assert
    expect(erros).toHaveLength(1);
    expect(erros[0].codigo).toBe(131031);
    expect(erros[0].referencia).toBeUndefined();
  });

  it('AC-25: vários statuses com erro no mesmo payload viram vários registros', () => {
    // Arrange
    const doisErros = {
      entry: [
        {
          id: 'waba-1',
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'pid-1' },
                statuses: [
                  { id: 'wamid.A', status: 'failed', errors: [{ code: 1 }] },
                  { id: 'wamid.B', status: 'delivered' },
                  { id: 'wamid.C', status: 'failed', errors: [{ code: 2 }] },
                ],
              },
            },
          ],
        },
      ],
    };

    // Act
    const erros = extrairErrosDeWebhook(doisErros);

    // Assert
    expect(erros.map((e) => e.referencia)).toEqual(['wamid.A', 'wamid.C']);
  });

  it('AC-26: payload malformado nunca lança — vem da internet', () => {
    // Arrange / Act / Assert
    expect(extrairErrosDeWebhook({})).toEqual([]);
    expect(extrairErrosDeWebhook({ entry: 'nao-e-array' })).toEqual([]);
    expect(extrairErrosDeWebhook({ entry: [null, 42, 'x'] })).toEqual([]);
    expect(
      extrairErrosDeWebhook({ entry: [{ changes: [{ value: null }] }] }),
    ).toEqual([]);
    expect(
      extrairErrosDeWebhook({
        entry: [
          { changes: [{ value: { statuses: [{ errors: 'nao-e-array' }] } }] },
        ],
      }),
    ).toEqual([]);
    expect(
      extrairErrosDeWebhook({
        entry: [
          { changes: [{ value: { statuses: [{ errors: [null, 7] }] } }] },
        ],
      }),
    ).toEqual([]);
  });

  it('AC-26: erro sem code/title/details ainda vira registro, com resumo genérico', () => {
    // Arrange: um código novo da Meta não pode sumir por não ter os campos que
    // esperamos.
    const semCampos = {
      entry: [
        {
          changes: [{ value: { statuses: [{ id: 'wamid.Z', errors: [{}] }] } }],
        },
      ],
    };

    // Act
    const [erro] = extrairErrosDeWebhook(semCampos);

    // Assert
    expect(erro.resumo).toBe('erro da Meta sem descrição');
    expect(erro.referencia).toBe('wamid.Z');
  });
});
