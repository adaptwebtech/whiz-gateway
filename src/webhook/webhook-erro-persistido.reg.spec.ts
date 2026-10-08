/**
 * Regressão: falha de entrega que a Meta reporta por WEBHOOK precisa virar
 * registro em `logs_erros_meta`, com chave de busca.
 *
 * A tabela nasceu cobrindo só o caminho de SAÍDA (`WppService.forward*` e a
 * entrega de callback). Mas o `POST /messages` responde 200 com um `wamid`, e a
 * recusa chega segundos depois num `statuses[].errors[]` — nenhuma resposta HTTP
 * revela. Resultado observado em produção: um
 *
 *   131053 Media upload error — Video file has size 63787247 bytes but must be
 *   atmost 16777216 bytes and non-empty
 *
 * aparecia só como uma linha de log, sem registro e sem chave.
 *
 * Cobre AC-27..AC-29 da spec `meta-error-logs`.
 */

import { StatusFalhaMensagem } from '@prisma/client';
import type { MetaErrorLogsService } from '../meta-error-logs/meta-error-logs.service';
import { WebhookService } from './webhook.service';

const WAMID = 'wamid.HBgMNTUzNTk3NjAyNzcyFQIAERgSN0JEMEVEQzJDNzlGMDY4NTcxAA==';

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
            statuses: [
              {
                id: WAMID,
                status: 'failed',
                timestamp: '1791468714',
                recipient_id: '553597602772',
                errors: [
                  {
                    code: 131053,
                    title: 'Media upload error',
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

describe('WebhookService — erro da Meta vindo por webhook', () => {
  let inboxRepo: { findAllByPid: jest.Mock; findAllByWabaId: jest.Mock };
  let mq: { sendToQueue: jest.Mock };
  let dispatchHandler: { handle: jest.Mock };
  let erros: jest.Mocked<Pick<MetaErrorLogsService, 'persistirErrosDeWebhook'>>;
  let service: WebhookService;

  const build = () =>
    new WebhookService(
      inboxRepo as never,
      mq as never,
      dispatchHandler as never,
      erros as unknown as MetaErrorLogsService,
    );

  beforeEach(() => {
    inboxRepo = {
      findAllByPid: jest
        .fn()
        .mockResolvedValue([{ id: 'inbox-1', id_ambiente: 1 }]),
      findAllByWabaId: jest.fn().mockResolvedValue([]),
    };
    mq = { sendToQueue: jest.fn().mockResolvedValue(undefined) };
    dispatchHandler = { handle: jest.fn().mockResolvedValue(undefined) };
    erros = {
      persistirErrosDeWebhook: jest
        .fn()
        .mockResolvedValue(['ERRMETA-A1B2C3D4E5F6']),
    } as unknown as jest.Mocked<
      Pick<MetaErrorLogsService, 'persistirErrosDeWebhook'>
    >;
    service = build();
  });

  it('AC-27: dado o webhook 131053, então o payload é entregue ao persist', async () => {
    // Act
    await service.handleIncoming(PAYLOAD_131053);

    // Assert
    expect(erros.persistirErrosDeWebhook).toHaveBeenCalledTimes(1);
    expect(erros.persistirErrosDeWebhook).toHaveBeenCalledWith(PAYLOAD_131053);
  });

  it('AC-27: o despacho ao ambiente acontece do mesmo jeito', async () => {
    // Arrange: persistir é acessório; entregar a mensagem não é.

    // Act
    await service.handleIncoming(PAYLOAD_131053);

    // Assert
    expect(dispatchHandler.handle).toHaveBeenCalledWith(
      'inbox-1',
      PAYLOAD_131053,
    );
  });

  it('AC-28: dado o persist indisponível, então a ingestão segue normalmente', async () => {
    // Arrange
    erros.persistirErrosDeWebhook.mockRejectedValue(new Error('banco fora'));

    // Act / Assert
    await expect(
      service.handleIncoming(PAYLOAD_131053),
    ).resolves.toBeUndefined();
    expect(dispatchHandler.handle).toHaveBeenCalled();
  });

  it('AC-28: dado nenhum MetaErrorLogsService injetado, então a ingestão segue normalmente', async () => {
    // Arrange
    service = new WebhookService(
      inboxRepo as never,
      mq as never,
      dispatchHandler as never,
    );

    // Act / Assert
    await expect(
      service.handleIncoming(PAYLOAD_131053),
    ).resolves.toBeUndefined();
    expect(dispatchHandler.handle).toHaveBeenCalled();
  });

  it('AC-29: inbox não registrada ainda persiste o erro antes de ir para a DLQ', async () => {
    // Arrange: o erro da Meta é informação útil mesmo sem inbox — e era
    // justamente nesse caso que ele sumia por completo.
    inboxRepo.findAllByPid.mockResolvedValue([]);
    inboxRepo.findAllByWabaId.mockResolvedValue([]);

    // Act
    await service.handleIncoming(PAYLOAD_131053);

    // Assert
    expect(erros.persistirErrosDeWebhook).toHaveBeenCalledTimes(1);
    expect(mq.sendToQueue).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        status: StatusFalhaMensagem.INBOX_NAO_REGISTRADA,
      }),
    );
  });
});
