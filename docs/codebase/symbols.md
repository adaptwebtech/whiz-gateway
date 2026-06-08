# Símbolos

Mapa de símbolos exportados → arquivo + assinatura. Autoritativo para descoberta.

## gateway-foundation

| Símbolo | Tipo | Arquivo | Assinatura / Notas |
|---|---|---|---|
| `PrismaService` | classe (`@Injectable`) | `src/prisma/prisma.service.ts` | `extends PrismaClient implements OnModuleInit, OnModuleDestroy`; `$connect`/`$disconnect` |
| `PrismaModule` | módulo (`@Global`) | `src/prisma/prisma.module.ts` | provides/exports `PrismaService` |
| `RabbitMQService` | classe (`@Injectable`) | `src/rabbitmq/rabbitmq.service.ts` | implementa `IRabbitMQService`; `assertQueue`/`deleteQueue`/`startConsuming`/`stopConsuming`/`sendToQueue`/`publish` (delega a `sendToQueue`)/`isConnected`/`defaultDlqArgs` |
| `RabbitMQModule` | módulo (`@Global`) | `src/rabbitmq/rabbitmq.module.ts` | provê `RABBITMQ_SERVICE` (useExisting) + `RabbitMQService`; usado apenas para DLQ |
| `IRabbitMQService` | interface | `src/rabbitmq/interfaces/rabbitmq-service.interface.ts` | contrato do serviço de filas; inclui `publish(name, payload)` (serializa job como JSON) |
| `MEDIA_UPLOAD_QUEUE` | const | `src/rabbitmq/constants/rabbitmq-queue.constants.ts` | `'media.upload'` — fila estática de jobs de upload de mídia |
| `MessageHandler` | type | `src/rabbitmq/interfaces/rabbitmq-service.interface.ts` | `(payload: Buffer) => Promise<void> \| void` |
| `RABBITMQ_SERVICE` | token (Symbol) | `src/rabbitmq/constants/rabbitmq-tokens.constants.ts` | token de injeção de `IRabbitMQService` |
| `DLQ_NAME` | const | `src/rabbitmq/constants/rabbitmq-queue.constants.ts` | `'inbox.dead-letter'` |
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
| `buildSwaggerConfig` | função | `src/swagger/swagger.document.ts` | retorna `Omit<OpenAPIObject, 'paths'>` (PT-BR); registra dois esquemas: `bearer` (AdminKeyGuard) e `api-key` (ApiKeyGuard, `x-api-key` header) |
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
| `InboxModule` | módulo (não-global) | `src/inbox/inbox.module.ts` | importa `PrismaModule`, `LoggerModule`; exporta `INBOX_REPOSITORY`; registrado em `AppModule` |
| `InboxController` | controller | `src/inbox/inbox.controller.ts` | `@Controller('inboxes')`; `findAll`, `findById`, `create`, `update`, `softDelete` |
| `InboxService` | classe (`@Injectable`) | `src/inbox/inbox.service.ts` | injeta `INBOX_REPOSITORY`; CRUD puro sem ciclo de vida de filas |
| `IInboxRepository` | interface | `src/inbox/interfaces/inbox-repository.interface.ts` | `findAll / findById / findByPid / create / update / softDelete` |
| `InboxPrismaRepository` | classe (`@Injectable`) | `src/inbox/repositories/inbox.prisma.repository.ts` | implementa `IInboxRepository`; valida `id_ambiente` em `create` — lança `BadRequestException` se ambiente não encontrado ou `del=true` |
| `INBOX_REPOSITORY` | token (Symbol) | `src/inbox/constants/inbox-tokens.constants.ts` | token de injeção de `IInboxRepository` |
| `InboxResponseDto` | DTO | `src/inbox/dto/inbox-response.dto.ts` | `id, id_ambiente, pid, nome, del, data` — todos com `@Expose()`; `data` como ISO 8601 string |
| `CreateInboxDto` | DTO | `src/inbox/dto/create-inbox.dto.ts` | `id_ambiente: int(@IsInt,@IsPositive)`, `pid: string(@IsNotEmpty)`, `nome: string(@IsNotEmpty)` |
| `UpdateInboxDto` | DTO | `src/inbox/dto/update-inbox.dto.ts` | `nome?: string`, `id_ambiente?: int` — `pid` ausente intencionalmente (não atualizável) |

## fila-mensagens-mortas

| Símbolo | Tipo | Arquivo | Assinatura / Notas |
|---|---|---|---|
| `DeadLetterModule` | módulo (não-global) | `src/dead-letter/dead-letter.module.ts` | importa `PrismaModule`, `LoggerModule`; exporta `DeadLetterService`; registrado em `AppModule` |
| `DeadLetterController` | controller | `src/dead-letter/dead-letter.controller.ts` | `@Controller('dead-letter')`; `findMany`, `findById`, `softDelete` |
| `DeadLetterService` | classe (`@Injectable`) | `src/dead-letter/dead-letter.service.ts` | injeta `DEAD_LETTER_REPOSITORY` e `LoggerService`; `create(data)`, `findMany`, `findById`, `softDelete`, `markReenviado` |
| `DeadLetterConsumerService` | classe (`@Injectable`) | `src/dead-letter/dead-letter-consumer.service.ts` | implementa `OnApplicationBootstrap`; consome `DLQ_NAME`; parseia payload `{ message, id_inbox, status }` → `deadLetterService.create()`; lança em erro (RabbitMQService cuida do nack) |
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
| `WebhookModule` | módulo (não-global) | `src/webhook/webhook.module.ts` | importa `InboxModule`, `DispatchModule`; sem exports; registrado em `AppModule` |
| `WebhookController` | controller | `src/webhook/webhook.controller.ts` | `@Controller('webhook')`; `verify` (GET, sem guard) · `receive` (POST, `@UseGuards(MetaSignatureGuard)`, `@HttpCode(200)`) |
| `WebhookService` | classe (`@Injectable`) | `src/webhook/webhook.service.ts` | injeta `INBOX_REPOSITORY`, `RABBITMQ_SERVICE`, `DISPATCH_HANDLER`; `handleIncoming(payload: Record<string,unknown>): Promise<void>`; falha de PID/inbox → `mq.sendToQueue(DLQ_NAME, ...)`; inbox encontrada → `dispatchHandler.handle()` fire-and-forget; privado `extractPid(payload): string \| null` |
| `MetaSignatureGuard` | guard (`CanActivate`) | `src/webhook/guards/meta-signature.guard.ts` | valida `x-hub-signature-256` via `crypto.createHmac('sha256', META_APP_SECRET).update(rawBody)` + `crypto.timingSafeEqual`; lança `UnauthorizedException` em ausência ou mismatch |
| `WebhookVerifyQueryDto` | DTO | `src/webhook/dto/webhook-verify-query.dto.ts` | campos `hub.mode`, `hub.verify_token`, `hub.challenge` — tipagem sem class-validator; não usado via `@Body()` |
| `WebhookEventDto` | DTO | `src/webhook/dto/webhook-event.dto.ts` | classe vazia; passthrough intencional — payload Meta variável (FR-9) |

## despacho-mensagens

| Símbolo | Tipo | Arquivo | Assinatura / Notas |
|---|---|---|---|
| `DispatchModule` | módulo (não-global) | `src/dispatch/dispatch.module.ts` | importa `HttpModule`, `AmbienteModule`, `PrismaModule`; provê `InboxPrismaRepository`+`INBOX_REPOSITORY` localmente; exporta `DISPATCH_HANDLER`; registrado em `AppModule` e importado por `WebhookModule` |
| `DispatchHandlerService` | classe (`@Injectable`) | `src/dispatch/dispatch-handler.service.ts` | implementa `IDispatchHandler`; injeta `INBOX_REPOSITORY`, `AMBIENTE_REPOSITORY`, `HttpService`, `RABBITMQ_SERVICE`, `ConfigService`; retry exponencial; em falha → `mq.sendToQueue(DLQ_NAME, { message, id_inbox, status })` |
| `IDispatchHandler` | interface | `src/dispatch/interfaces/dispatch-handler.interface.ts` | `handle(inboxId: string, payload: unknown): Promise<void>` |
| `DISPATCH_HANDLER` | token (Symbol) | `src/dispatch/constants/dispatch-tokens.constants.ts` | token de injeção de `IDispatchHandler` |

## redis

| Símbolo | Tipo | Arquivo | Assinatura / Notas |
|---|---|---|---|
| `REDIS_CLIENT` | token (Symbol) | `src/redis/constants/redis-tokens.constants.ts` | token de injeção da instância `ioredis.Redis` |
| `RedisService` | classe (`@Injectable`) | `src/redis/redis.service.ts` | `hset(key,field,value)` · `hgetall(key)` · `hdel(key,field)` · `del(key)` · `get(key)` · `set(key,value,ttlSeconds)` (adicionado em `wpp-flow-callbacks`) |
| `RedisModule` | módulo (`@Global`) | `src/redis/redis.module.ts` | factory `REDIS_CLIENT` via `ConfigService.getOrThrow('REDIS_URL')`; provê/exporta `REDIS_CLIENT` e `RedisService` |

## api-keys-foundation

| Símbolo | Tipo | Arquivo | Assinatura / Notas |
|---|---|---|---|
| `ApiKeysModule` | módulo (não-global) | `src/api-keys/api-keys.module.ts` | importa `PrismaModule`, `RedisModule`; exporta `AdminKeyGuard`, `ApiKeyGuard`, `AdminOrApiKeyGuard`; registrado em `AppModule` |
| `ApiKeysController` | controller | `src/api-keys/api-keys.controller.ts` | `@Controller('api-keys')` `@ApiTags('Chaves de API')` `@UseGuards(AdminKeyGuard)`; `create(dto)`, `findAll()`, `revoke(uid)` |
| `ApiKeysService` | classe (`@Injectable`) | `src/api-keys/api-keys.service.ts` | implementa `OnModuleInit`; injeta `API_KEYS_REPOSITORY`, `RedisService`, `ConfigService`, `Logger`; `onModuleInit` popula Redis com chaves ativas; `create/findAll/revoke` |
| `IApiKeysRepository` | interface | `src/api-keys/interfaces/api-keys-repository.interface.ts` | `create / findAll / findById / softDelete` |
| `ApiKeyEntity` | interface | `src/api-keys/interfaces/api-keys-repository.interface.ts` | `{ uid, name, key, salt, date, del }` — entidade interna do repositório |
| `ApiKeysPrismaRepository` | classe (`@Injectable`) | `src/api-keys/repositories/api-keys.prisma.repository.ts` | implementa `IApiKeysRepository`; `findAll` filtra `del:false`; `softDelete` atualiza `del:true` |
| `API_KEYS_REPOSITORY` | token (Symbol) | `src/api-keys/constants/api-keys-tokens.constants.ts` | token de injeção de `IApiKeysRepository` |
| `AdminKeyGuard` | guard (`CanActivate`) | `src/api-keys/guards/admin-key.guard.ts` | valida `Authorization: Bearer {ADMIN_API_KEY}` via `timingSafeEqual`; lança `UnauthorizedException` |
| `ApiKeyGuard` | guard (`CanActivate`) | `src/api-keys/guards/api-key.guard.ts` | lê `X-API-KEY`, faz `hgetall apikeys:valid`, valida `sha256(rawKey+salt)` via `timingSafeEqual`; lança `UnauthorizedException` |
| `AdminOrApiKeyGuard` | guard (`CanActivate`) | `src/api-keys/guards/admin-or-api-key.guard.ts` | guard composto: tenta `AdminKeyGuard` (síncrono, sem I/O) primeiro; em falha, delega a `ApiKeyGuard` (async, Redis); retorna `true` se qualquer um for válido; lança `UnauthorizedException` se ambos falharem; tokens de DI `ADMIN_OR_API_KEY_CONFIG` + `ADMIN_OR_API_KEY_REDIS` resolvidos via `useExisting` no `ApiKeysModule` |
| `ADMIN_OR_API_KEY_CONFIG` | token (string) | `src/api-keys/guards/admin-or-api-key.guard.ts` | `'ConfigService'` — alias de DI para `ConfigService` dentro do `AdminOrApiKeyGuard` |
| `ADMIN_OR_API_KEY_REDIS` | token (string) | `src/api-keys/guards/admin-or-api-key.guard.ts` | `'RedisService'` — alias de DI para `RedisService` dentro do `AdminOrApiKeyGuard` |
| `CreateApiKeyDto` | DTO | `src/api-keys/dto/create-api-key.dto.ts` | `name: string (@IsString @IsNotEmpty @MinLength(1) @MaxLength(120))` |
| `ApiKeyResponseDto` | DTO | `src/api-keys/dto/api-key-response.dto.ts` | `{ uid, name, date }` — nunca expõe `key`, `salt` ou `apiKey` |
| `ApiKeyCreatedResponseDto` | DTO | `src/api-keys/dto/api-key-created-response.dto.ts` | `{ uid, name, apiKey, date }` — `apiKey` = rawKey, exibido apenas na resposta do POST |

## wpp-adapter-core

| Símbolo | Tipo | Arquivo | Assinatura / Notas |
|---|---|---|---|
| `WppModule` | módulo (não-global) | `src/wpp/wpp.module.ts` | importa `HttpModule`; exporta `WppService`; registrado em `AppModule` |
| `WppController` | controller | `src/wpp/wpp.controller.ts` | `@Controller('wpp')`; `@UseGuards(ApiKeyGuard)`; `GET /wpp/debug_token` |
| `WppService` | classe (`@Injectable`) | `src/wpp/wpp.service.ts` | `forward(method, path, opts): Promise<WppForwardResult>` · `forwardMultipart(subPath, tmpFilePath, contentType, messagingProduct): Promise<WppForwardResult>` (lê arquivo do disco, monta `form-data` com `messaging_product`+`file`) · `forwardBinary(subPath, tmpFilePath, contentType, fileOffset): Promise<WppForwardResult>` (POST binário com headers `Content-Type`+`file_offset`) |
| `WppForwardOptions` | interface | `src/wpp/wpp.service.ts` | `{ query?, body?, headers?, contentType? }` |
| `WppForwardResult` | interface | `src/wpp/wpp.service.ts` | `{ status: number, data: unknown }` |
| `WppAuthFilter` | filtro (`@Catch(ForbiddenException)`) | `src/wpp/filters/wpp-auth.filter.ts` | converte `ForbiddenException` → `UnauthorizedException` (401) |

## wpp-templates

| Símbolo | Tipo | Arquivo | Assinatura / Notas |
|---|---|---|---|
| `WppTemplatesModule` | módulo (não-global) | `src/wpp-templates/wpp-templates.module.ts` | importa `WppModule`; declara `WppTemplatesController`; sem exports próprios |
| `WppTemplatesController` | controller | `src/wpp-templates/wpp-templates.controller.ts` | `@Controller('wpp')` `@ApiTags('WhatsApp Meta Adapter — Templates')` `@ApiBearerAuth('bearer')` `@UseGuards(ApiKeyGuard)` `@UseFilters(WppAuthFilter)` `@UsePipes(ValidationPipe({whitelist:false,transform:true}))`; handlers: `getById`, `getTemplates`, `create`, `edit`, `deleteTemplates` |
| `CreateTemplateDto` | DTO | `src/wpp-templates/dto/create-template.dto.ts` | `name: string (@IsString)`, `language: string (@IsString)`, `category: string (@IsString)`, `components: object[] (@IsArray)` — passthrough, sem validação de shape interno |
| `EditTemplateDto` | DTO | `src/wpp-templates/dto/edit-template.dto.ts` | `name?: string (@IsOptional @IsString)`, `components?: object[] (@IsOptional @IsArray)`, `language?: string (@IsOptional @IsString)`, `category?: string (@IsOptional @IsString)` — todos opcionais, passthrough |

## wpp-phone-numbers

| Símbolo | Tipo | Arquivo | Assinatura / Notas |
|---|---|---|---|
| `WppPhoneNumbersModule` | módulo (não-global) | `src/wpp-phone-numbers/wpp-phone-numbers.module.ts` | importa `WppModule`; declara 5 controllers; sem exports próprios; registrado em `AppModule` |
| `WppPhoneNumbersController` | controller | `src/wpp-phone-numbers/wpp-phone-numbers.controller.ts` | `@Controller('wpp')` `@ApiTags('WhatsApp — Números de Telefone')`; handlers: listar números por WABA, buscar por ID opaco, request_code, verify_code, set 2-step PIN |
| `WppRegistrationController` | controller | `src/wpp-phone-numbers/wpp-registration.controller.ts` | `@ApiTags('WhatsApp — Registro de Número')`; handlers: register, deregister |
| `WppWabaController` | controller | `src/wpp-phone-numbers/wpp-waba.controller.ts` | `@ApiTags('WhatsApp — WABA')`; handlers: owned_whatsapp_business_accounts, client_whatsapp_business_accounts |
| `WppSubscriptionsController` | controller | `src/wpp-phone-numbers/wpp-subscriptions.controller.ts` | `@ApiTags('WhatsApp — Inscrições de App')`; handlers: POST/GET/DELETE subscribed_apps |
| `WppGetStartedController` | controller | `src/wpp-phone-numbers/wpp-get-started.controller.ts` | `@ApiTags('WhatsApp — Debug Token')`; handler: GET debug_token |
| `RequestCodeDto` | DTO | `src/wpp-phone-numbers/dto/request-code.dto.ts` | `code_method: string`, `locale: string` |
| `VerifyCodeDto` | DTO | `src/wpp-phone-numbers/dto/verify-code.dto.ts` | `code: string` |
| `SetTwoStepPinDto` | DTO | `src/wpp-phone-numbers/dto/set-two-step-pin.dto.ts` | `pin: string` |
| `RegisterPhoneDto` | DTO | `src/wpp-phone-numbers/dto/register-phone.dto.ts` | `messaging_product: string`, `pin: string` |
| `OverrideCallbackDto` | DTO | `src/wpp-phone-numbers/dto/override-callback.dto.ts` | `override_callback_uri?: string`, `verify_token?: string` |

## wpp-media-business-profiles

| Símbolo | Tipo | Arquivo | Assinatura / Notas |
|---|---|---|---|
| `WppMediaBusinessProfilesModule` | módulo (não-global) | `src/wpp-media-business-profiles/wpp-media-business-profiles.module.ts` | importa `WppModule`, `ApiKeysModule`, `ScheduleModule.forRoot()`; declara 3 controllers; provê consumer + cleanup; registrado em `AppModule` |
| `WppMediaController` | controller | `src/wpp-media-business-profiles/wpp-media.controller.ts` | `@Controller('wpp')` `@ApiTags('Mídia WhatsApp')` `@UseGuards(ApiKeyGuard)` `@UseFilters(WppAuthFilter)`; injeta `WppService` + `RABBITMQ_SERVICE`; handlers: `uploadMedia` (POST `:phoneNumberId/media`, 202, busboy) · `getMedia` (GET `:mediaId`) · `deleteMedia` (DELETE `:mediaId`) |
| `WppResumableUploadController` | controller | `src/wpp-media-business-profiles/wpp-resumable-upload.controller.ts` | `@Controller('wpp')` `@ApiTags('Upload Resumível WhatsApp')`; injeta `WppService` + `RABBITMQ_SERVICE`; handlers: `createUploadSession` (POST `app/uploads`) · `uploadBinary` (POST `uploads/:uploadId`, 202, corpo binário) · `getUploadStatus` (GET `uploads/:uploadId`) |
| `WppBusinessProfileController` | controller | `src/wpp-media-business-profiles/wpp-business-profile.controller.ts` | `@Controller('wpp')` `@ApiTags('Perfil de Negócio WhatsApp')`; injeta `WppService`; handlers: `getBusinessProfile` (GET) · `updateBusinessProfile` (POST `UpdateBusinessProfileDto`) |
| `WppMediaUploadConsumerService` | classe (`@Injectable`) | `src/wpp-media-business-profiles/wpp-media-upload-consumer.service.ts` | implementa `OnApplicationBootstrap`; `@Optional() @Inject(RABBITMQ_SERVICE)`; consome `MEDIA_UPLOAD_QUEUE`; `handleJob` → `forwardMultipart`/`forwardBinary`, `unlink` em `finally`, webhook se `callbackUrl`; `fireWebhookWithRetry` (5 retries, backoff 1 s→16 s, `fetch`) |
| `WppMediaCleanupService` | classe (`@Injectable`) | `src/wpp-media-business-profiles/wpp-media-cleanup.service.ts` | `@Cron('0 * * * *')` `cleanup()`; remove arquivos em `/tmp/wpp-uploads` com `mtime` > 1 h; loga nome |
| `MediaUploadJobDto` | DTO (payload de fila) | `src/wpp-media-business-profiles/dto/media-upload-job.dto.ts` | `jobId`, `type: 'media' \| 'resumable-binary'`, `subPath`, `tmpFilePath`, `contentType`, `messagingProduct?`, `fileOffset?`, `callbackUrl?` |
| `UpdateBusinessProfileDto` | DTO | `src/wpp-media-business-profiles/dto/update-business-profile.dto.ts` | `messaging_product: string`; opcionais `about?`, `address?`, `description?`, `email?`, `websites?: string[]`, `vertical?`, `profile_picture_handle?` |
| `UploadMediaDto` | DTO | `src/wpp-media-business-profiles/dto/upload-media.dto.ts` | `messaging_product: string`, `callback_url?: string` — documentação Swagger do form-data |
| `WebhookCallbackDto` | DTO | `src/wpp-media-business-profiles/dto/webhook-callback.dto.ts` | `jobId`, `status: 'done' \| 'failed'`, `payload?`, `error?` |

## wpp-flow-callbacks

| Símbolo | Tipo | Arquivo | Assinatura / Notas |
|---|---|---|---|
| `WppFlowCallbacksModule` | módulo (não-global) | `src/wpp-flow-callbacks/wpp-flow-callbacks.module.ts` | importa `PrismaModule`, `RedisModule`, `ApiKeysModule`; exporta `WppFlowCallbacksService`; registrado em `AppModule` |
| `WppFlowCallbacksController` | controller | `src/wpp-flow-callbacks/wpp-flow-callbacks.controller.ts` | `@Controller('wpp-flow-callbacks')` `@ApiTags('Flow Callbacks')` `@ApiBearerAuth('bearer')` `@UseGuards(ApiKeyGuard)` `@UseFilters(WppAuthFilter)`; `create`, `findAll`, `findOne`, `update`, `remove` |
| `WppFlowCallbacksService` | classe (`@Injectable`) | `src/wpp-flow-callbacks/wpp-flow-callbacks.service.ts` | injeta `WPP_FLOW_CALLBACKS_REPOSITORY`, `RedisService`, `Logger`; `create(dto)` · `findAll()` · `findOne(uid)` · `update(uid,dto)` · `remove(uid)` · `getUrl(uid): Promise<string\|null>` (exportado para `wpp-flows`) |
| `IWppFlowCallbacksRepository` | interface | `src/wpp-flow-callbacks/interfaces/wpp-flow-callbacks-repository.interface.ts` | `create(data) / findAll() / findByUid(uid) / update(uid,url) / softDelete(uid)` |
| `FlowCallbackEntity` | interface | `src/wpp-flow-callbacks/interfaces/wpp-flow-callbacks-repository.interface.ts` | `{ uid: string, url: string, date: Date, del: boolean }` |
| `WppFlowCallbacksPrismaRepository` | classe (`@Injectable`) | `src/wpp-flow-callbacks/repositories/wpp-flow-callbacks.prisma.repository.ts` | implementa `IWppFlowCallbacksRepository`; `findAll` filtra `del:false`, ordena por `date:desc`; `softDelete` seta `del:true` |
| `WPP_FLOW_CALLBACKS_REPOSITORY` | token (string) | `src/wpp-flow-callbacks/constants/wpp-flow-callbacks-tokens.constants.ts` | `'WPP_FLOW_CALLBACKS_REPOSITORY'` — token de injeção de `IWppFlowCallbacksRepository` |
| `CreateFlowCallbackDto` | DTO | `src/wpp-flow-callbacks/dto/create-flow-callback.dto.ts` | `url: string (@IsUrl({ protocols: ['http','https'], require_protocol: true }))` |
| `UpdateFlowCallbackDto` | DTO | `src/wpp-flow-callbacks/dto/update-flow-callback.dto.ts` | `url: string (@IsUrl({ protocols: ['http','https'], require_protocol: true }))` |
| `FlowCallbackResponseDto` | DTO | `src/wpp-flow-callbacks/dto/flow-callback-response.dto.ts` | `{ uid: string, url: string, date: string (ISO 8601), del: boolean }` |

## wpp-flows

| Símbolo | Tipo | Arquivo | Assinatura / Notas |
|---|---|---|---|
| `WppFlowsModule` | módulo (não-global) | `src/wpp-flows/wpp-flows.module.ts` | importa `WppModule`, `ApiKeysModule`, `WppFlowCallbacksModule`; declara `WppFlowsController`, `WppFlowsEndpointController`; provê `WppFlowsEndpointService`; sem exports |
| `WppFlowsController` | controller | `src/wpp-flows/wpp-flows.controller.ts` | `@Controller('wpp')` `@ApiTags('Flows')` `@ApiBearerAuth('bearer')` `@UseGuards(ApiKeyGuard)` `@UseFilters(WppAuthFilter)`; injeta `WppService`, `WppFlowCallbacksService`, `ConfigService`; 14 handlers de proxy + 3 variantes `:uid` (`createFlowWithUid`, `migrateFlowsWithUid`, `updateFlowMetadataWithUid`) que injetam `endpoint_uri = GATEWAY_PUBLIC_URL/wpp/flows/endpoint/:uid` antes do forward |
| `WppFlowsEndpointController` | controller | `src/wpp-flows/wpp-flows-endpoint.controller.ts` | `@Controller('wpp/flows')` `@ApiTags('Flows Endpoint')`; sem `ApiKeyGuard`; handler: `handleEndpoint(uid, body: FlowEndpointRequestDto, req, signature): Promise<{ encrypted_flow_data: string }>` — delega a `WppFlowsEndpointService.handle` |
| `WppFlowsEndpointService` | classe (`@Injectable`) | `src/wpp-flows/wpp-flows-endpoint.service.ts` | injeta `ConfigService`, `WppFlowCallbacksService`; métodos públicos: `handle(uid, body, rawBody, signature): Promise<{ encrypted_flow_data: string }>` · `verifySignature(rawBody, signature): boolean`; privados: `decryptAesKey(encryptedKey): Buffer` (RSA-OAEP, `FLOWS_PRIVATE_KEY`) · `decryptPayload(data, aesKey, iv): object` (AES-256-GCM, últimos 16 bytes = auth tag) · `encryptResponse(payload, aesKey, iv): string` (AES-256-GCM, IV com XOR `0x01` no primeiro byte) · `forwardToClient(url, payload): Promise<object>` (fetch POST JSON + `Authorization: Bearer META_ACCESS_TOKEN`) |
| `FlowEndpointRequestDto` | DTO | `src/wpp-flows/dto/flow-endpoint-request.dto.ts` | `encrypted_flow_data: string (@IsString)`, `encrypted_aes_key: string (@IsString)`, `initial_vector: string (@IsString)` — todos base64 |
| `FlowEndpointResponseDto` | DTO | `src/wpp-flows/dto/flow-endpoint-response.dto.ts` | `encrypted_flow_data: string` — base64, resposta re-criptografada para a Meta |

## wpp-misc

| Símbolo | Tipo | Arquivo | Assinatura / Notas |
|---|---|---|---|
| `WppMiscModule` | módulo (não-global) | `src/wpp-misc/wpp-misc.module.ts` | importa `WppModule`; declara 6 controllers; sem service próprio; registrado em `AppModule` |
| `WppQrCodeController` | controller | `src/wpp-misc/wpp-qrcode.controller.ts` | `@Controller('wpp')` `@ApiTags('WhatsApp — QR Codes')`; `getQrCode`, `listQrCodes`, `createOrUpdateQrCode`, `deleteQrCode` |
| `WppAnalyticsController` | controller | `src/wpp-misc/wpp-analytics.controller.ts` | `@Controller('wpp')` `@ApiTags('WhatsApp — Analytics')`; `getAnalytics(wabaId, query)` — serve `analytics` e `conversation_analytics` via `fields` |
| `WppBillingController` | controller | `src/wpp-misc/wpp-billing.controller.ts` | `@Controller('wpp')` `@ApiTags('WhatsApp — Billing')`; `getExtendedCredits(businessId, query)` |
| `WppCommerceController` | controller | `src/wpp-misc/wpp-commerce.controller.ts` | `@Controller('wpp')` `@ApiTags('WhatsApp — Commerce Settings')`; `getCommerceSettings`, `updateCommerceSettings` (query passthrough) |
| `WppBlockUsersController` | controller | `src/wpp-misc/wpp-block-users.controller.ts` | `@Controller('wpp')` `@ApiTags('WhatsApp — Block Users')`; `listBlockedUsers`, `blockUsers(dto: BlockUsersDto)`, `unblockUsers(dto: BlockUsersDto)` |
| `WppComplianceController` | controller | `src/wpp-misc/wpp-compliance.controller.ts` | `@Controller('wpp')` `@ApiTags('WhatsApp — Business Compliance')`; `getComplianceInfo`, `postComplianceInfo(dto: BusinessComplianceDto)` |
| `CreateOrUpdateQrCodeDto` | DTO | `src/wpp-misc/dto/create-or-update-qr-code.dto.ts` | `prefilled_message: string`, `generate_qr_image?: string`, `code?: string` |
| `BlockUsersDto` | DTO | `src/wpp-misc/dto/block-users.dto.ts` | `messaging_product: string`, `block_users: BlockUserItemDto[]` |
| `BlockUserItemDto` | DTO | `src/wpp-misc/dto/block-users.dto.ts` | `user: string` (número com DDI) |
| `BusinessComplianceDto` | DTO | `src/wpp-misc/dto/business-compliance.dto.ts` | `messaging_product`, `entity_name`, `entity_type`, `is_registered: boolean`, `grievance_officer_details: GrievanceOfficerDetailsDto` |
| `GrievanceOfficerDetailsDto` | DTO | `src/wpp-misc/dto/business-compliance.dto.ts` | `name`, `email`, `landline_number?`, `mobile_number?` |

## reenvio-mensagens

| Símbolo | Tipo | Arquivo | Assinatura / Notas |
|---|---|---|---|
| `ResendModule` | módulo (não-global) | `src/resend/resend.module.ts` | importa `DeadLetterModule`, `InboxModule`, `DispatchModule`; provê `ResendService`; declara `ResendController`; registrado em `AppModule` |
| `ResendController` | controller | `src/resend/resend.controller.ts` | `@Controller('messages')` `@ApiTags('Reenvio de Mensagens')` `@ApiBearerAuth('bearer')`; `POST resend → resend(dto: ResendRequestDto): Promise<ResendResultDto>` `@HttpCode(200)` |
| `ResendService` | classe (`@Injectable`) | `src/resend/resend.service.ts` | injeta `DEAD_LETTER_REPOSITORY`, `DISPATCH_HANDLER`, `INBOX_REPOSITORY`, `LoggerService`; `resend(input: ResendInput): Promise<ResendResultDto>` — resolve inbox por pid, seleciona mensagens mortas, despacha via `IDispatchHandler.handle`, marca `reenviado` em sucesso, conta falhas |
| `ResendInput` | interface | `src/resend/resend.service.ts` | `{ pid?: string; dataInicio?: string; dataFim?: string; forcarReenviadas?: boolean }` — forma interna recebida pelo `ResendService.resend` |
| `ResendRequestDto` | DTO | `src/resend/dto/resend-request.dto.ts` | `pid?: string (@IsOptional @IsString)`, `dataInicio?: string (@IsOptional @IsISO8601)`, `dataFim?: string (@IsOptional @IsISO8601)`, `forcarReenviadas: boolean = false (@IsBoolean @HasValidCriteria @Transform)`; validador customizado `HasValidCriteria` exige pid ou (dataInicio+dataFim) e rejeita dataInicio > dataFim |
| `ResendResultDto` | DTO | `src/resend/dto/resend-result.dto.ts` | `total: number`, `reenviadas: number`, `falhas: number` — todos com `@Expose() @ApiProperty`; retornado via `plainToInstance` com `excludeExtraneousValues` |

## redirecionamentos-webhooks

| Símbolo | Tipo | Arquivo | Assinatura / Notas |
|---|---|---|---|
| `RedirecionamentosWebhooksModule` | módulo (não-global) | `src/redirecionamentos-webhooks/redirecionamentos-webhooks.module.ts` | importa `PrismaModule`, `ApiKeysModule`, `HttpModule`, `InboxModule`, `ConfigModule`; sem exports; registrado em `AppModule` |
| `RedirecionamentosWebhooksController` | controller | `src/redirecionamentos-webhooks/redirecionamentos-webhooks.controller.ts` | `@Controller('redirecionamentos-webhooks')` `@ApiTags('Redirecionamentos Webhooks')` `@ApiBearerAuth('bearer')` `@UseGuards(ApiKeyGuard)` `@UseFilters(WppAuthFilter)`; handlers: `create` (POST, 201) · `dispatch` (POST /dispatch, 202) · `findAll` (GET, 200) · `findOne` (GET /:uid, 200) · `update` (PATCH /:uid, 200) · `remove` (DELETE /:uid, 200) |
| `RedirecionamentosWebhooksService` | classe (`@Injectable`) | `src/redirecionamentos-webhooks/redirecionamentos-webhooks.service.ts` | injeta `REDIRECIONAMENTOS_WEBHOOKS_REPOSITORY`, `INBOX_REPOSITORY`, `HttpService`, `Logger`, `ConfigService (@Optional)`; `create/findAll/findOne/update/remove/dispatch`; privados: `extractPid`, `sendWithRetry` (5 tentativas, backoff `baseMs * 2^(attempt-1)`), `toDto`, `sleep` |
| `IRedirecionamentosWebhooksRepository` | interface | `src/redirecionamentos-webhooks/interfaces/redirecionamentos-webhooks-repository.interface.ts` | `create / findAll / findByUid / update / softDelete / findActiveByAmbiente(idAmbiente: number\|null)` |
| `RedirecionamentoWebhookEntity` | interface | `src/redirecionamentos-webhooks/interfaces/redirecionamentos-webhooks-repository.interface.ts` | `{ uid: string, url: string, data_expiracao: Date\|null, id_ambiente: number\|null, data: Date, del: boolean }` |
| `RedirecionamentosWebhooksPrismaRepository` | classe (`@Injectable`) | `src/redirecionamentos-webhooks/repositories/redirecionamentos-webhooks.prisma.repository.ts` | implementa `IRedirecionamentosWebhooksRepository`; `findActiveByAmbiente` filtra `del=false AND (data_expiracao IS NULL OR data_expiracao > now()) AND (id_ambiente = X OR id_ambiente IS NULL)` |
| `REDIRECIONAMENTOS_WEBHOOKS_REPOSITORY` | token (string) | `src/redirecionamentos-webhooks/constants/redirecionamentos-webhooks-tokens.constants.ts` | `'REDIRECIONAMENTOS_WEBHOOKS_REPOSITORY'` — token de injeção de `IRedirecionamentosWebhooksRepository` |
| `CreateRedirecionamentoWebhookDto` | DTO | `src/redirecionamentos-webhooks/dto/create-redirecionamento-webhook.dto.ts` | `url: string (@IsUrl)`, `id_ambiente?: number\|null (@IsOptional @IsInt)`, `data_expiracao?: Date\|null (@IsOptional @ValidateIf(!=null) @IsDateString @Allow)` |
| `UpdateRedirecionamentoWebhookDto` | DTO | `src/redirecionamentos-webhooks/dto/update-redirecionamento-webhook.dto.ts` | `extends PartialType(CreateRedirecionamentoWebhookDto)` — todos os campos opcionais |
| `RedirecionamentoWebhookResponseDto` | DTO | `src/redirecionamentos-webhooks/dto/redirecionamento-webhook-response.dto.ts` | `uid, url, data_expiracao (string\|null), id_ambiente (number\|null), data (string ISO 8601), del` — todos com `@Expose()` |
| `DispatchResultDto` | DTO | `src/redirecionamentos-webhooks/dto/dispatch-result.dto.ts` | `dispatched: number` com `@Expose()` — número de URLs para as quais o dispatch foi iniciado |
