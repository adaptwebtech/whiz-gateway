export interface RedirecionamentoWebhookEntity {
  uid: string;
  url: string;
  data_expiracao: Date | null;
  id_ambiente: number | null;
  data: Date;
  del: boolean;
}

export interface IRedirecionamentosWebhooksRepository {
  create(data: {
    uid: string;
    url: string;
    data_expiracao: Date | null;
    id_ambiente: number | null;
    data: Date;
    del: boolean;
  }): Promise<RedirecionamentoWebhookEntity>;
  findAll(): Promise<RedirecionamentoWebhookEntity[]>;
  findByUid(uid: string): Promise<RedirecionamentoWebhookEntity | null>;
  update(
    uid: string,
    data: {
      url?: string;
      id_ambiente?: number | null;
      data_expiracao?: Date | null;
    },
  ): Promise<RedirecionamentoWebhookEntity>;
  softDelete(uid: string): Promise<RedirecionamentoWebhookEntity>;
  findActiveByAmbiente(
    idAmbiente: number | null,
  ): Promise<RedirecionamentoWebhookEntity[]>;
}
