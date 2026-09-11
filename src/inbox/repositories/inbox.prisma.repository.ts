import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInboxDto } from '../dto/create-inbox.dto';
import { InboxResponseDto } from '../dto/inbox-response.dto';
import { UpdateInboxDto } from '../dto/update-inbox.dto';
import type { IInboxRepository } from '../interfaces/inbox-repository.interface';

@Injectable()
export class InboxPrismaRepository implements IInboxRepository {
  private readonly logger = new Logger(InboxPrismaRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<InboxResponseDto[]> {
    const records = await this.prisma.inboxes.findMany({
      where: { del: false },
    });
    return records.map((r) =>
      plainToInstance(
        InboxResponseDto,
        { ...r, data: r.data.toISOString() },
        { excludeExtraneousValues: true },
      ),
    );
  }

  async findById(id: string): Promise<InboxResponseDto | null> {
    const record = await this.prisma.inboxes.findUnique({ where: { id } });
    if (!record || record.del) return null;
    return plainToInstance(
      InboxResponseDto,
      { ...record, data: record.data.toISOString() },
      { excludeExtraneousValues: true },
    );
  }

  async findAllByPid(pid: string): Promise<InboxResponseDto[]> {
    const records = await this.prisma.inboxes.findMany({
      where: { pid, del: false },
      orderBy: { id_ambiente: 'asc' },
    });
    return records.map((r) =>
      plainToInstance(
        InboxResponseDto,
        { ...r, data: r.data.toISOString() },
        { excludeExtraneousValues: true },
      ),
    );
  }

  async findByPidEAmbiente(
    pid: string,
    idAmbiente: number,
  ): Promise<InboxResponseDto | null> {
    const record = await this.prisma.inboxes.findFirst({
      where: { pid, id_ambiente: idAmbiente, del: false },
    });
    if (!record) return null;
    return plainToInstance(
      InboxResponseDto,
      { ...record, data: record.data.toISOString() },
      { excludeExtraneousValues: true },
    );
  }

  async findAllByWabaId(wabaId: string): Promise<InboxResponseDto[]> {
    const records = await this.prisma.inboxes.findMany({
      where: { waba_id: wabaId, del: false },
      orderBy: [{ id_ambiente: 'asc' }, { data: 'asc' }],
    });
    if (records.length === 0) return [];

    // Vários números da mesma WABA são o caso NORMAL, e o evento de nível WABA
    // interessa ao AMBIENTE, não ao número: despachar por número entregaria o
    // mesmo evento N vezes ao mesmo whiz. Uma por ambiente distinto.
    const porAmbiente = new Map<number, (typeof records)[number]>();
    for (const r of records) {
      if (!porAmbiente.has(r.id_ambiente)) porAmbiente.set(r.id_ambiente, r);
    }

    return [...porAmbiente.values()].map((r) =>
      plainToInstance(
        InboxResponseDto,
        { ...r, data: r.data.toISOString() },
        { excludeExtraneousValues: true },
      ),
    );
  }
  async reviveByPidEAmbiente(
    data: CreateInboxDto,
  ): Promise<InboxResponseDto | null> {
    // O par (pid, id_ambiente) é @unique ignorando `del`, então uma linha
    // soft-deletada continua ocupando o par e um novo insert bateria em P2002
    // (500). Aqui revivemos essa linha em vez de inserir.
    //
    // Escopado ao AMBIENTE: procurar só pelo pid faria uma entrada apagada em
    // `development` ser revivida como a entrada de `production`, trocando o
    // ambiente de uma caixa que o operador achava que estava criando do zero.
    const record = await this.prisma.inboxes.findFirst({
      where: { pid: data.pid, id_ambiente: data.id_ambiente, del: true },
    });
    if (!record) return null;

    const ambiente = await this.prisma.ambiente.findUnique({
      where: { id: data.id_ambiente, del: false },
    });
    if (!ambiente) {
      throw new BadRequestException(
        `Ambiente ${data.id_ambiente} não encontrado ou inativo.`,
      );
    }

    const revived = await this.prisma.inboxes.update({
      where: { id: record.id },
      data: {
        del: false,
        // Atualiza o nome registrado quando informado; senão mantém o anterior.
        ...(data.nome ? { nome: data.nome } : {}),
        // Idem para a WABA: reconectar um número não pode apagar a resolução de
        // nível WABA que já estava registrada.
        ...(data.waba_id ? { waba_id: data.waba_id } : {}),
      },
    });
    return plainToInstance(
      InboxResponseDto,
      { ...revived, data: revived.data.toISOString() },
      { excludeExtraneousValues: true },
    );
  }

  async create(data: CreateInboxDto): Promise<InboxResponseDto> {
    const ambiente = await this.prisma.ambiente.findUnique({
      where: { id: data.id_ambiente, del: false },
    });
    if (!ambiente) {
      throw new BadRequestException(
        `Ambiente ${data.id_ambiente} não encontrado ou inativo.`,
      );
    }
    const record = await this.prisma.inboxes.create({
      data: {
        id_ambiente: data.id_ambiente,
        pid: data.pid,
        nome: data.nome,
        waba_id: data.waba_id ?? null,
      },
    });
    return plainToInstance(
      InboxResponseDto,
      { ...record, data: record.data.toISOString() },
      { excludeExtraneousValues: true },
    );
  }

  async update(id: string, data: UpdateInboxDto): Promise<InboxResponseDto> {
    const record = await this.prisma.inboxes.update({
      where: { id },
      data: {
        nome: data.nome,
        id_ambiente: data.id_ambiente,
        waba_id: data.waba_id,
      },
    });
    return plainToInstance(
      InboxResponseDto,
      { ...record, data: record.data.toISOString() },
      { excludeExtraneousValues: true },
    );
  }

  async softDelete(id: string): Promise<InboxResponseDto> {
    const record = await this.prisma.inboxes.update({
      where: { id },
      data: { del: true },
    });
    return plainToInstance(
      InboxResponseDto,
      { ...record, data: record.data.toISOString() },
      { excludeExtraneousValues: true },
    );
  }
}
