import type { CreateInboxDto } from '../dto/create-inbox.dto';
import type { InboxResponseDto } from '../dto/inbox-response.dto';
import type { UpdateInboxDto } from '../dto/update-inbox.dto';

/**
 * Contrato do repositório de inboxes (cadastro-inboxes).
 */
export interface IInboxRepository {
  findAll(): Promise<InboxResponseDto[]>;
  findById(id: string): Promise<InboxResponseDto | null>;
  /**
   * TODAS as inboxes com este `pid`, uma por ambiente.
   *
   * O webhook da Meta não diz de qual ambiente é — ele traz só o
   * `phone_number_id`. Como o mesmo número pode estar cadastrado em mais de um
   * ambiente (`development`/`staging`/`production` são deployments distintos do
   * whiz atrás deste gateway), a resolução devolve a LISTA e o despacho vai para
   * todos. Devolver só a primeira faria o webhook cair num ambiente sorteado pela
   * ordem do banco.
   */
  findAllByPid(pid: string): Promise<InboxResponseDto[]>;

  /**
   * A inbox deste `pid` NESTE ambiente. É o par que identifica a caixa, e é o que
   * o cadastro usa para decidir se já existe — o `pid` sozinho não serve mais.
   */
  findByPidEAmbiente(
    pid: string,
    idAmbiente: number,
  ): Promise<InboxResponseDto | null>;
  /**
   * Resolve pela WABA — segundo caminho, usado quando o webhook não traz
   * `phone_number_id` (eventos de nível WABA).
   *
   * `waba_id` NÃO é único: uma WABA tem vários números, logo várias inboxes, e a
   * mesma WABA pode estar cadastrada em mais de um ambiente. Devolve UMA inbox
   * por ambiente distinto — o despacho quer atingir cada ambiente uma vez, não
   * uma vez por número da WABA.
   */
  findAllByWabaId(wabaId: string): Promise<InboxResponseDto[]>;
  /**
   * Reaproveita a inbox soft-deletada do MESMO par (`pid`, `id_ambiente`) — o
   * unique é composto e não considera `del`, então inserir por cima bateria em
   * P2002 (→ 500). Des-soft-deleta e atualiza o nome.
   *
   * Escopado ao ambiente de propósito: uma entrada apagada em `development` não
   * pode ser "revivida" como a entrada de `production`, que era o efeito de
   * procurar só pelo `pid`.
   */
  reviveByPidEAmbiente(data: CreateInboxDto): Promise<InboxResponseDto | null>;
  create(data: CreateInboxDto): Promise<InboxResponseDto>;
  update(id: string, data: UpdateInboxDto): Promise<InboxResponseDto>;
  softDelete(id: string): Promise<InboxResponseDto>;
}
