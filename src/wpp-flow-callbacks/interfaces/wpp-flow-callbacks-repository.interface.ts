export interface FlowCallbackEntity {
  uid: string;
  url: string;
  data: Date;
  del: boolean;
}

export interface IWppFlowCallbacksRepository {
  create(data: { uid: string; url: string }): Promise<FlowCallbackEntity>;
  findAll(): Promise<FlowCallbackEntity[]>;
  findByUid(uid: string): Promise<FlowCallbackEntity | null>;
  update(uid: string, url: string): Promise<FlowCallbackEntity>;
  softDelete(uid: string): Promise<FlowCallbackEntity>;
}
