export interface ApiKeyEntity {
  uid: string;
  name: string;
  key: string;
  salt: string;
  date: Date | string;
  del: boolean;
}

export interface IApiKeysRepository {
  create(data: {
    uid: string;
    name: string;
    key: string;
    salt: string;
    date: Date;
    del: boolean;
  }): Promise<ApiKeyEntity>;

  findAll(): Promise<ApiKeyEntity[]>;

  findById(uid: string): Promise<ApiKeyEntity | null>;

  softDelete(uid: string): Promise<void>;
}
