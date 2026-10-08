/**
 * `persistirErrosDeWebhook` — um registro por erro, com `codigo_meta` separado
 * do `status` HTTP. Cobre AC-30..AC-32 da spec `meta-error-logs`.
 */

import type { LoggerService } from '../logger/logger.service';
import { MetaErrorLogsService } from './meta-error-logs.service';
import type { IMetaErrorLogsRepository } from './interfaces/meta-error-logs-repository.interface';

const WAMID = 'wamid.HBgMNTUzNTk3NjAyNzcyFQIAERg=';

const PAYLOAD = {
  entry: [
    {
      id: '1613119706411328',
      changes: [
        {
          value: {
            metadata: { phone_number_id: '1106219235900077' },
            statuses: [
              {
                id: WAMID,
                status: 'failed',
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
        },
      ],
    },
  ],
};

describe('MetaErrorLogsService.persistirErrosDeWebhook', () => {
  let repo: jest.Mocked<IMetaErrorLogsRepository>;
  let logger: jest.Mocked<Pick<LoggerService, 'log' | 'warn' | 'error'>>;
  let service: MetaErrorLogsService;

  beforeEach(() => {
    repo = {
      create: jest.fn().mockResolvedValue({}),
      findByChave: jest.fn(),
      findMany: jest.fn(),
      hardDeleteOlderThan: jest.fn(),
    } as unknown as jest.Mocked<IMetaErrorLogsRepository>;
    logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as jest.Mocked<Pick<LoggerService, 'log' | 'warn' | 'error'>>;
    service = new MetaErrorLogsService(
      repo,
      logger as unknown as LoggerService,
    );
  });

  it('AC-30: grava um registro com origem webhook-status, wamid na referência e o código em codigo_meta', async () => {
    // Act
    const chaves = await service.persistirErrosDeWebhook(PAYLOAD);

    // Assert
    expect(chaves).toHaveLength(1);
    expect(chaves[0]).toMatch(/^ERRMETA-[0-9A-F]{12}$/);

    const gravado = repo.create.mock.calls[0][0];
    expect(gravado.origem).toBe('webhook-status');
    expect(gravado.metodo).toBe('WEBHOOK');
    expect(gravado.referencia).toBe(WAMID);
    expect(gravado.codigoMeta).toBe(131053);
  });

  it('AC-31: status HTTP fica null — quem chamou foi a Meta, não nós', async () => {
    // Arrange: misturar o código da Meta com o status HTTP arruinaria as duas
    // consultas (`?status=400` e `?codigo_meta=131053` perguntam coisas
    // diferentes).

    // Act
    await service.persistirErrosDeWebhook(PAYLOAD);

    // Assert
    expect(repo.create.mock.calls[0][0].status).toBeNull();
  });

  it('AC-31: o corpo guardado é o status inteiro, com o detalhe em bytes', async () => {
    // Act
    await service.persistirErrosDeWebhook(PAYLOAD);

    // Assert
    const corpo = repo.create.mock.calls[0][0].corpo as Record<string, unknown>;
    expect(corpo['id']).toBe(WAMID);
    expect(JSON.stringify(corpo)).toContain('63787247');
  });

  it('AC-30: a chave e o motivo saem em log', async () => {
    // Act
    const [chave] = await service.persistirErrosDeWebhook(PAYLOAD);

    // Assert
    const linha = logger.error.mock.calls[0][0] as string;
    expect(linha).toContain(chave);
    expect(linha).toContain('webhook-status');
    expect(linha).toContain(WAMID);
  });

  it('AC-32: webhook sem erro nenhum não toca no banco', async () => {
    // Arrange: é o caso da esmagadora maioria do tráfego.
    const normal = {
      entry: [{ changes: [{ value: { messages: [{ id: 'wamid.X' }] } }] }],
    };

    // Act
    const chaves = await service.persistirErrosDeWebhook(normal);

    // Assert
    expect(chaves).toEqual([]);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('AC-32: banco fora devolve lista vazia e não lança', async () => {
    // Arrange
    repo.create.mockRejectedValue(new Error('banco fora'));

    // Act
    const chaves = await service.persistirErrosDeWebhook(PAYLOAD);

    // Assert
    expect(chaves).toEqual([]);
  });
});
