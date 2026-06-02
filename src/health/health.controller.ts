import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';
import { HealthResponseDto } from './dto/health-response.dto';
import { RabbitMQHealthIndicator } from './rabbitmq.health';

/**
 * Healthcheck de readiness (FR-14). Sem autenticação. Checa conectividade de
 * banco de dados e broker.
 */
@ApiTags('Saúde')
@Controller()
export class HealthController {
  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly prismaHealthIndicator: PrismaHealthIndicator,
    private readonly prismaService: PrismaService,
    private readonly rabbitMQHealthIndicator: RabbitMQHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Verifica a prontidão da aplicação',
    description:
      'Checa a conectividade com o banco de dados e o broker RabbitMQ.',
  })
  @ApiResponse({
    status: 200,
    description: 'Aplicação pronta (banco e broker saudáveis).',
    type: HealthResponseDto,
  })
  @ApiResponse({
    status: 503,
    description: 'Algum indicador de saúde falhou.',
  })
  async getHealth(): Promise<HealthResponseDto> {
    const result = await this.healthCheckService.check([
      () =>
        this.prismaHealthIndicator.pingCheck('database', this.prismaService),
      () => this.rabbitMQHealthIndicator.isHealthy('broker'),
    ]);

    return {
      status: result.status === 'ok' ? 'ok' : result.status,
      timestamp: new Date().toISOString(),
      checks: result.details,
    };
  }
}
