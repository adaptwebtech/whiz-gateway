import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { INBOX_REPOSITORY } from './constants/inbox-tokens.constants';
import { InboxService } from './inbox.service';
import type { IInboxRepository } from './interfaces/inbox-repository.interface';
import { DISPATCH_HANDLER } from '../dispatch/constants/dispatch-tokens.constants';
import { RABBITMQ_SERVICE } from '../rabbitmq/constants/rabbitmq-tokens.constants';
import { WebhookService } from '../webhook/webhook.service';

/**
 * Regressão — o MESMO pid em ambientes diferentes.
 *
 * `development`, `staging` e `production` são deployments distintos do whiz
 * atrás deste gateway, e o mesmo número acaba cadastrado em mais de um (o caso
 * comum é um número de teste que depois vai para produção).
 *
 * O `pid` era `@unique` GLOBAL, então o segundo cadastro batia em 409. E o whiz
 * trata 409 como "já registrado": marcava a inbox como registrada apontando para
 * a entrada do OUTRO ambiente, de modo que ela aparecia conectada e os webhooks
 * dela iam para o ambiente errado. Agora o único é o par (pid, id_ambiente).
 *
 * AC-1: mesmo pid em ambiente DIFERENTE é aceito (não é mais conflito).
 * AC-2: mesmo pid no MESMO ambiente segue sendo 409, com o ambiente na mensagem.
 * AC-3: revive é escopado ao ambiente — entrada apagada em dev não vira a de prod.
 * AC-4: webhook de pid em 2 ambientes despacha para OS DOIS.
 * AC-5: despacho que falha num ambiente não impede o outro.
 * AC-6: pid em nenhum ambiente segue indo para a DLQ.
 */
describe('pid único POR AMBIENTE (regressão)', () => {
  const PID = '5531999999999';

  const inbox = (id: string, id_ambiente: number) =>
    ({ id, id_ambiente, pid: PID, nome: 'n', del: false, waba_id: null, data: '' }) as never;

  describe('cadastro', () => {
    let repo: jest.Mocked<IInboxRepository>;
    let service: InboxService;

    beforeEach(async () => {
      repo = {
        findAll: jest.fn(),
        findById: jest.fn(),
        findAllByPid: jest.fn(),
        findByPidEAmbiente: jest.fn(),
        findAllByWabaId: jest.fn(),
        reviveByPidEAmbiente: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        softDelete: jest.fn(),
      } as unknown as jest.Mocked<IInboxRepository>;

      const modulo = await Test.createTestingModule({
        providers: [InboxService, { provide: INBOX_REPOSITORY, useValue: repo }],
      }).compile();
      service = modulo.get(InboxService);
    });

    it('AC-1: mesmo pid em ambiente diferente é aceito', async () => {
      // Arrange — já existe em development (1); cadastrando em production (3).
      repo.findByPidEAmbiente.mockResolvedValue(null);
      repo.reviveByPidEAmbiente.mockResolvedValue(null);
      repo.create.mockResolvedValue(inbox('gw-prod', 3));

      // Act
      const r = await service.create({ pid: PID, id_ambiente: 3, nome: 'prod' });

      // Assert — a consulta é pelo PAR, não pelo pid solto.
      expect(repo.findByPidEAmbiente).toHaveBeenCalledWith(PID, 3);
      expect(repo.create).toHaveBeenCalled();
      expect(r.id).toBe('gw-prod');
    });

    it('AC-2: mesmo pid no MESMO ambiente segue 409, citando o ambiente', async () => {
      // Arrange
      repo.findByPidEAmbiente.mockResolvedValue(inbox('gw-dev', 1));

      // Act / Assert
      await expect(
        service.create({ pid: PID, id_ambiente: 1, nome: 'dev' }),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.create({ pid: PID, id_ambiente: 1, nome: 'dev' }),
      ).rejects.toThrow(/já existe no ambiente 1/);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('AC-3: revive é escopado ao ambiente pedido', async () => {
      // Arrange — o revive recebe o dto inteiro; quem filtra por ambiente é ele.
      repo.findByPidEAmbiente.mockResolvedValue(null);
      repo.reviveByPidEAmbiente.mockResolvedValue(inbox('gw-prod', 3));

      // Act
      await service.create({ pid: PID, id_ambiente: 3, nome: 'prod' });

      // Assert
      expect(repo.reviveByPidEAmbiente).toHaveBeenCalledWith(
        expect.objectContaining({ pid: PID, id_ambiente: 3 }),
      );
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('roteamento do webhook', () => {
    let repo: jest.Mocked<IInboxRepository>;
    let dispatch: { handle: jest.Mock };
    let mq: { sendToQueue: jest.Mock };
    let service: WebhookService;

    const payload = {
      entry: [{ id: 'waba-1', changes: [{ value: { metadata: { phone_number_id: PID } } }] }],
    };

    beforeEach(async () => {
      repo = {
        findAllByPid: jest.fn().mockResolvedValue([]),
        findAllByWabaId: jest.fn().mockResolvedValue([]),
      } as unknown as jest.Mocked<IInboxRepository>;
      dispatch = { handle: jest.fn().mockResolvedValue(undefined) };
      mq = { sendToQueue: jest.fn().mockResolvedValue(undefined) };

      const modulo = await Test.createTestingModule({
        providers: [
          WebhookService,
          { provide: INBOX_REPOSITORY, useValue: repo },
          { provide: RABBITMQ_SERVICE, useValue: mq },
          { provide: DISPATCH_HANDLER, useValue: dispatch },
        ],
      }).compile();
      service = modulo.get(WebhookService);
    });

    it('AC-4: pid em 2 ambientes despacha para os DOIS', async () => {
      // Arrange — a Meta entrega UMA vez; cada ambiente cadastrado recebe.
      repo.findAllByPid.mockResolvedValue([inbox('gw-dev', 1), inbox('gw-prod', 3)]);

      // Act
      await service.handleIncoming(payload);

      // Assert
      expect(dispatch.handle).toHaveBeenCalledTimes(2);
      expect(dispatch.handle).toHaveBeenCalledWith('gw-dev', payload);
      expect(dispatch.handle).toHaveBeenCalledWith('gw-prod', payload);
      expect(mq.sendToQueue).not.toHaveBeenCalled();
    });

    it('AC-5: falha num ambiente não impede o outro', async () => {
      // Arrange
      repo.findAllByPid.mockResolvedValue([inbox('gw-dev', 1), inbox('gw-prod', 3)]);
      dispatch.handle.mockRejectedValueOnce(new Error('ambiente fora do ar'));

      // Act
      await service.handleIncoming(payload);

      // Assert — os dois foram TENTADOS; o erro de um é engolido e logado.
      expect(dispatch.handle).toHaveBeenCalledTimes(2);
    });

    it('AC-6: pid em nenhum ambiente segue indo para a DLQ', async () => {
      // Arrange
      repo.findAllByPid.mockResolvedValue([]);

      // Act
      await service.handleIncoming(payload);

      // Assert
      expect(dispatch.handle).not.toHaveBeenCalled();
      expect(mq.sendToQueue).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'INBOX_NAO_REGISTRADA' }),
      );
    });
  });
});
