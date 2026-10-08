import { MetaErrorLogResponseDto } from '../dto/meta-error-log-response.dto';
import { ListMetaErrorLogsQueryDto } from '../dto/list-meta-error-logs-query.dto';
import { OrigemErroMeta } from '../constants/meta-error-logs-tokens.constants';

/**
 * Dados de um erro prontos para gravação. `corpo` e `requisicao` chegam aqui
 * **inteiros** — truncar é justamente o que fazia o log ser inútil — e
 * `requisicao` já vem redigida pelo serviço.
 */
export interface CreateMetaErrorLogData {
  chave: string;
  origem: OrigemErroMeta;
  metodo: string;
  subPath: string;
  /**
   * URL absoluta de fato requisitada. O `subPath` é o que o caller pediu; esta
   * é a rota que saiu do processo, já com base URL e query string montadas.
   */
  url?: string;
  /** `null` em erro de transporte: não houve resposta. */
  status: number | null;
  /** Corpo da resposta da Meta. `undefined` quando não houve corpo. */
  corpo?: unknown;
  /** Headers enviados, já sem segredos. */
  requisicao?: Record<string, unknown>;
  jobId?: string | null;
  mensagem?: string | null;
}

/**
 * Contrato do repositório de erros da Meta.
 */
export interface IMetaErrorLogsRepository {
  create(data: CreateMetaErrorLogData): Promise<MetaErrorLogResponseDto>;
  findByChave(chave: string): Promise<MetaErrorLogResponseDto | null>;
  findMany(
    filter: ListMetaErrorLogsQueryDto,
  ): Promise<MetaErrorLogResponseDto[]>;
  hardDeleteOlderThan(date: Date): Promise<number>;
}
