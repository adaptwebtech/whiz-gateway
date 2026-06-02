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
  create(data: CreateInboxDto): Promise<InboxResponseDto>;
  update(id: string, data: UpdateInboxDto): Promise<InboxResponseDto>;
  softDelete(id: string): Promise<InboxResponseDto>;
}
