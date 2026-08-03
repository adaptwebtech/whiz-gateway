// Precisa ser o primeiro import: instala a instrumentação Sentry/OpenTelemetry
// antes de qualquer módulo da aplicação ser carregado.
import './instrument';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { LoggerService } from './logger/logger.service';
import { MetaTokenMiddleware } from './meta-token/meta-token.middleware';
import { SentryService } from './sentry/sentry.service';
import { buildSwaggerConfig } from './swagger/swagger.document';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const loggerService = app.get(LoggerService);
  const sentryService = app.get(SentryService);
  app.useLogger(loggerService);
  // Necessário para o flush de eventos Sentry no encerramento (FR-17).
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(
    new GlobalExceptionFilter(configService, loggerService, sentryService),
  );

  // Captura X-Meta-Access-Token (token por-inbox) no contexto assíncrono antes
  // do pipeline Nest, para WppService resolver o Bearer por-requisição.
  const metaTokenMiddleware = app.get(MetaTokenMiddleware);
  app.use((req: Request, res: Response, next: NextFunction) =>
    metaTokenMiddleware.use(req, res, next),
  );

  const swaggerConfig = buildSwaggerConfig();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = configService.get<number>('PORT') ?? 3000;
  await app.listen(port);
}

void bootstrap();
