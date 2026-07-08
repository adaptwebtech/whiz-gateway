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
   * Reaproveita uma inbox soft-deletada com o mesmo `pid` (o `pid` é `@unique` e
   * não considera `del`): des-soft-deleta e atualiza ambiente/nome. Retorna a
   * inbox revivida, ou `null` se não houver linha soft-deletada com esse pid.
   */
  reviveByPid(data: CreateInboxDto): Promise<InboxResponseDto | null>;
  create(data: CreateInboxDto): Promise<InboxResponseDto>;
  update(id: string, data: UpdateInboxDto): Promise<InboxResponseDto>;
  softDelete(id: string): Promise<InboxResponseDto>;
}
