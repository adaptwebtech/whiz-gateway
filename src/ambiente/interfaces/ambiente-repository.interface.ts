import { AmbienteResponseDto } from '../dto/ambiente-response.dto';
import { CreateAmbienteDto } from '../dto/create-ambiente.dto';
import { UpdateAmbienteDto } from '../dto/update-ambiente.dto';

export interface IAmbienteRepository {
  findAll(): Promise<AmbienteResponseDto[]>;
  findById(id: number): Promise<AmbienteResponseDto | null>;
  create(data: CreateAmbienteDto): Promise<AmbienteResponseDto>;
  update(id: number, data: UpdateAmbienteDto): Promise<AmbienteResponseDto>;
  softDelete(id: number): Promise<void>;
}
