import type { CreateInboxDto } from '../dto/create-inbox.dto';
import type { InboxResponseDto } from '../dto/inbox-response.dto';
import type { UpdateInboxDto } from '../dto/update-inbox.dto';

/**
 * Contrato do repositório de inboxes (cadastro-inboxes).
 */
export interface IInboxRepository {
  findAll(): Promise<InboxResponseDto[]>;
  findById(id: string): Promise<InboxResponseDto | null>;
  findByPid(pid: string): Promise<InboxResponseDto | null>;
  /**
   * Resolve pela WABA — segundo caminho, usado quando o webhook não traz
   * `phone_number_id` (eventos de nível WABA).
   *
   * `waba_id` NÃO é único: uma WABA tem vários números, logo várias inboxes. Como
   * o que o roteamento procura é o AMBIENTE, e os números de uma mesma WABA moram
   * no mesmo ambiente, qualquer uma serve. A implementação avisa em log se
   * encontrar ambientes divergentes para a mesma WABA.
   */
  findByWabaId(wabaId: string): Promise<InboxResponseDto | null>;
  /**
   * Reaproveita uma inbox soft-deletada com o mesmo `pid` (o `pid` é `@unique` e
   * não considera `del`): des-soft-deleta e atualiza ambiente/nome. Retorna a
   * inbox revivida, ou `null` se não houver linha soft-deletada com esse pid.
   */
  reviveByPid(data: CreateInboxDto): Promise<InboxResponseDto | null>;
  create(data: CreateInboxDto): Promise<InboxResponseDto>;
  update(id: string, data: UpdateInboxDto): Promise<InboxResponseDto>;
  softDelete(id: string): Promise<InboxResponseDto>;
}
