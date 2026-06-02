# Símbolos

Mapa de símbolos exportados → arquivo + assinatura. Autoritativo para descoberta.

## gateway-foundation

| Símbolo | Tipo | Arquivo | Assinatura / Notas |
|---|---|---|---|
| `PrismaService` | classe (`@Injectable`) | `src/prisma/prisma.service.ts` | `extends PrismaClient implements OnModuleInit, OnModuleDestroy`; `$connect`/`$disconnect` |
| `PrismaModule` | módulo (`@Global`) | `src/prisma/prisma.module.ts` | provides/exports `PrismaService` |
| `RabbitMQService` | classe (`@Injectable`) | `src/rabbitmq/rabbitmq.service.ts` | implementa `IRabbitMQService`; `assertQueue`/`deleteQueue`/`startConsuming`/`stopConsuming`/`sendToQueue`/`isConnected`/`defaultDlqArgs` |
| `RabbitMQModule` | módulo (`@Global`) | `src/rabbitmq/rabbitmq.module.ts` | provê `RABBITMQ_SERVICE` (useExisting) + `RabbitMQService` |
| `IRabbitMQService` | interface | `src/rabbitmq/interfaces/rabbitmq-service.interface.ts` | contrato do serviço de filas |
| `MessageHandler` | type | `src/rabbitmq/interfaces/rabbitmq-service.interface.ts` | `(payload: Buffer) => Promise<void> \| void` |
| `RABBITMQ_SERVICE` | token (Symbol) | `src/rabbitmq/constants/rabbitmq-tokens.constants.ts` | token de injeção de `IRabbitMQService` |
| `QueueNameFactory` | classe (static) | `src/rabbitmq/queue-name.factory.ts` | `inbox(id: string): string` → `inbox.<id>` |
| `DLQ_NAME` | const | `src/rabbitmq/constants/rabbitmq-queue.constants.ts` | `'inbox.dead-letter'` |
| `DEFAULT_DLQ_ARGS` | const | `src/rabbitmq/constants/rabbitmq-queue.constants.ts` | `{ 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': 'inbox.dead-letter' }` |
| `GlobalExceptionFilter` | classe (`@Catch()`) | `src/common/filters/global-exception.filter.ts` | `catch(exception, host)`; resolve status/message/details |
| `ErrorResponseDto` | DTO | `src/common/dto/error-response.dto.ts` | `{ statusCode, timestamp, message, details? }` |
| `LoggerService` | classe (`@Injectable`) | `src/logger/logger.service.ts` | Winston console-only; `implements NestLoggerService` |
| `LoggerModule` | módulo (`@Global`) | `src/logger/logger.module.ts` | provides/exports `LoggerService` |
| `HealthController` | controller | `src/health/health.controller.ts` | `GET /` → `getHealth(): HealthResponseDto` (readiness) |
| `HealthResponseDto` | DTO | `src/health/dto/health-response.dto.ts` | `{ status, timestamp, checks }` |
| `RabbitMQHealthIndicator` | classe (`@Injectable`) | `src/health/rabbitmq.health.ts` | `isHealthy(key): HealthIndicatorResult` |
| `HealthModule` | módulo | `src/health/health.module.ts` | importa `TerminusModule` |
| `configValidationSchema` | const (Joi) | `src/config/config.validation.ts` | schema das envs |
| `AppConfigModule` | módulo (global) | `src/config/config.module.ts` | `ConfigModule.forRoot({ isGlobal, validationSchema })` |
| `buildSwaggerConfig` | função | `src/swagger/swagger.document.ts` | retorna `Omit<OpenAPIObject, 'paths'>` (PT-BR, bearer) |
| `SwaggerSetupService` | classe (`@Injectable`) | `src/swagger/swagger.setup.service.ts` | registra `/docs` + `/docs-json` no `onModuleInit` |
| `AppSwaggerModule` | módulo | `src/swagger/swagger.module.ts` | provê `SwaggerSetupService` |
| `SWAGGER_PATH` / `SWAGGER_JSON_PATH` | const | `src/swagger/constants/swagger-paths.constants.ts` | `'/docs'` / `'/docs-json'` |
| `AppModule` | módulo raiz | `src/app.module.ts` | agrega a infraestrutura |

## cadastro-ambientes

| Símbolo | Tipo | Arquivo | Assinatura / Notas |
|---|---|---|---|
| `AmbienteModule` | módulo (não-global) | `src/ambiente/ambiente.module.ts` | importa `PrismaModule`; registrado em `AppModule` |
| `AmbienteController` | controller | `src/ambiente/ambiente.controller.ts` | `@Controller('ambientes')`; `findAll`, `findById`, `create`, `update`, `softDelete` |
| `AmbienteService` | classe (`@Injectable`) | `src/ambiente/ambiente.service.ts` | injeta `AMBIENTE_REPOSITORY`; usa `plainToInstance` com `excludeExtraneousValues` |
| `IAmbienteRepository` | interface | `src/ambiente/interfaces/ambiente-repository.interface.ts` | `findAll / findById / create / update / softDelete` |
| `AmbientePrismaRepository` | classe (`@Injectable`) | `src/ambiente/repositories/ambiente.prisma.repository.ts` | implementa `IAmbienteRepository`; usa `PrismaService` |
| `AMBIENTE_REPOSITORY` | token (Symbol) | `src/ambiente/constants/ambiente-tokens.constants.ts` | token de injeção de `IAmbienteRepository` |
| `CreateAmbienteDto` | DTO | `src/ambiente/dto/create-ambiente.dto.ts` | `id: int>=1`, `nome: string`, `url: string(@IsUrl)` |
| `UpdateAmbienteDto` | DTO | `src/ambiente/dto/update-ambiente.dto.ts` | `nome?: string`, `url?: string(@IsUrl)` — id não atualizável |
| `AmbienteResponseDto` | DTO | `src/ambiente/dto/ambiente-response.dto.ts` | `id, nome, url, del` todos com `@Expose()` |

## cadastro-inboxes

| Símbolo | Tipo | Arquivo | Assinatura / Notas |
|---|---|---|---|
| `InboxModule` | módulo (não-global) | `src/inbox/inbox.module.ts` | importa `PrismaModule`, `RabbitMQModule`, `LoggerModule`; exporta `INBOX_REPOSITORY`; registrado em `AppModule` |
| `InboxController` | controller | `src/inbox/inbox.controller.ts` | `@Controller('inboxes')`; `findAll`, `findById`, `create`, `update`, `softDelete` |
| `InboxService` | classe (`@Injectable`) | `src/inbox/inbox.service.ts` | implementa `OnApplicationBootstrap`; injeta `INBOX_REPOSITORY` e `RABBITMQ_SERVICE`; gerencia ciclo de vida de filas RabbitMQ |
| `IInboxRepository` | interface | `src/inbox/interfaces/inbox-repository.interface.ts` | `findAll / findById / findByPid / create / update / softDelete` |
| `InboxPrismaRepository` | classe (`@Injectable`) | `src/inbox/repositories/inbox.prisma.repository.ts` | implementa `IInboxRepository`; valida `id_ambiente` em `create` — lança `BadRequestException` se ambiente não encontrado ou `del=true` |
| `INBOX_REPOSITORY` | token (Symbol) | `src/inbox/constants/inbox-tokens.constants.ts` | token de injeção de `IInboxRepository` |
| `InboxResponseDto` | DTO | `src/inbox/dto/inbox-response.dto.ts` | `id, id_ambiente, pid, nome, del, data` — todos com `@Expose()`; `data` como ISO 8601 string |
| `CreateInboxDto` | DTO | `src/inbox/dto/create-inbox.dto.ts` | `id_ambiente: int(@IsInt,@IsPositive)`, `pid: string(@IsNotEmpty)`, `nome: string(@IsNotEmpty)` |
| `UpdateInboxDto` | DTO | `src/inbox/dto/update-inbox.dto.ts` | `nome?: string`, `id_ambiente?: int` — `pid` ausente intencionalmente (não atualizável) |

## fila-mensagens-mortas

| Símbolo | Tipo | Arquivo | Assinatura / Notas |
|---|---|---|---|
| `DeadLetterModule` | módulo (não-global) | `src/dead-letter/dead-letter.module.ts` | importa `PrismaModule`, `RabbitMQModule`, `LoggerModule`; exporta `DeadLetterService`; registrado em `AppModule` |
| `DeadLetterController` | controller | `src/dead-letter/dead-letter.controller.ts` | `@Controller('dead-letter')`; `findMany`, `findById`, `softDelete` |
| `DeadLetterService` | classe (`@Injectable`) | `src/dead-letter/dead-letter.service.ts` | injeta `DEAD_LETTER_REPOSITORY` e `LoggerService`; `register(payload, headers)`, `findMany`, `findById`, `softDelete`, `markReenviado`, `create(data: CreateDeadLetterData)`; extrai `id_inbox` via regex sobre `x-death[0].queue` |
| `DeadLetterConsumerService` | classe (`@Injectable`) | `src/dead-letter/dead-letter-consumer.service.ts` | implementa `OnApplicationBootstrap`; consome `DLQ_NAME` no bootstrap; `ack` após persistência, `nack(false,false)` em erro |
| `DeadLetterCleanupService` | classe (`@Injectable`) | `src/dead-letter/dead-letter-cleanup.service.ts` | `@Cron('0 3 * * *')`; hard-delete de registros com `data < now - 30d`; loga count |
| `IDeadLetterRepository` | interface | `src/dead-letter/interfaces/dead-letter-repository.interface.ts` | `create / findMany / findById / softDelete / markReenviado / hardDeleteOlderThan` |
| `CreateDeadLetterData` | interface | `src/dead-letter/interfaces/dead-letter-repository.interface.ts` | `{ message: unknown, id_inbox: string \| null, status: StatusFalhaMensagem }` |
| `DeadLetterPrismaRepository` | classe (`@Injectable`) | `src/dead-letter/repositories/dead-letter.prisma.repository.ts` | implementa `IDeadLetterRepository`; usa `plainToInstance` com `excludeExtraneousValues`; verifica existência antes do `softDelete` |
| `DEAD_LETTER_REPOSITORY` | token (Symbol) | `src/dead-letter/constants/dead-letter-tokens.constants.ts` | token de injeção de `IDeadLetterRepository`; provido via `useExisting: DeadLetterPrismaRepository` |
| `DeadLetterResponseDto` | DTO | `src/dead-letter/dto/dead-letter-response.dto.ts` | `id, message, id_inbox, status, reenviado, del, data` — todos com `@Expose()`; `data` como ISO 8601 string |
| `ListDeadLetterQueryDto` | DTO | `src/dead-letter/dto/list-dead-letter-query.dto.ts` | `pid?, id_inbox?, status?, reenviado?, dataInicio?, dataFim?, limit?(1-200,default 50), offset?(>=0,default 0)` |

## webhook-ingestao

| Símbolo | Tipo | Arquivo | Assinatura / Notas |
|---|---|---|---|
| `WebhookModule` | módulo (não-global) | `src/webhook/webhook.module.ts` | importa `InboxModule`, `DeadLetterModule`; sem exports; registrado em `AppModule` |
| `WebhookController` | controller | `src/webhook/webhook.controller.ts` | `@Controller('webhook')`; `verify` (GET, sem guard) · `receive` (POST, `@UseGuards(MetaSignatureGuard)`, `@HttpCode(200)`) |
| `WebhookService` | classe (`@Injectable`) | `src/webhook/webhook.service.ts` | injeta `INBOX_REPOSITORY`, `RABBITMQ_SERVICE`, `DeadLetterService`; `handleIncoming(payload: Record<string,unknown>, rawBody: Buffer): Promise<void>`; privado `extractPid(payload): string \| null` |
| `MetaSignatureGuard` | guard (`CanActivate`) | `src/webhook/guards/meta-signature.guard.ts` | valida `x-hub-signature-256` via `crypto.createHmac('sha256', META_APP_SECRET).update(rawBody)` + `crypto.timingSafeEqual`; lança `UnauthorizedException` em ausência ou mismatch |
| `WebhookVerifyQueryDto` | DTO | `src/webhook/dto/webhook-verify-query.dto.ts` | campos `hub.mode`, `hub.verify_token`, `hub.challenge` — tipagem sem class-validator; não usado via `@Body()` |
| `WebhookEventDto` | DTO | `src/webhook/dto/webhook-event.dto.ts` | classe vazia; passthrough intencional — payload Meta variável (FR-9) |

## despacho-mensagens

| Símbolo | Tipo | Arquivo | Assinatura / Notas |
|---|---|---|---|
| `DispatchModule` | módulo (não-global) | `src/dispatch/dispatch.module.ts` | importa `HttpModule`, `DeadLetterModule`, `AmbienteModule`, `PrismaModule`; provê `InboxPrismaRepository`+`INBOX_REPOSITORY` localmente; exporta `DISPATCH_HANDLER`; registrado em `AppModule` e importado por `InboxModule` |
| `DispatchHandlerService` | classe (`@Injectable`) | `src/dispatch/dispatch-handler.service.ts` | implementa `IDispatchHandler`; injeta `INBOX_REPOSITORY`, `AMBIENTE_REPOSITORY`, `HttpService`, `DeadLetterService`, `ConfigService`; retry exponencial; dead-letter em falha |
| `IDispatchHandler` | interface | `src/dispatch/interfaces/dispatch-handler.interface.ts` | `handle(inboxId: string, payload: unknown): Promise<void>` |
| `DISPATCH_HANDLER` | token (Symbol) | `src/dispatch/constants/dispatch-tokens.constants.ts` | token de injeção de `IDispatchHandler` |
