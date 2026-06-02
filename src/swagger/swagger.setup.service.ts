import { Injectable, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { OpenAPIObject } from '@nestjs/swagger';
import type { Response } from 'express';
import * as swaggerUiDist from 'swagger-ui-dist';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSwaggerConfig } from './swagger.document';
import {
  SWAGGER_JSON_PATH,
  SWAGGER_PATH,
} from './constants/swagger-paths.constants';

/**
 * Registra a UI do Swagger em `/docs` e o documento OpenAPI em `/docs-json`
 * no bootstrap da aplicação (FR-13). Usa o HTTP adapter para servir sem
 * depender da instância de INestApplication, permitindo que o documento exista
 * sempre que o AppModule for inicializado.
 */
@Injectable()
export class SwaggerSetupService implements OnModuleInit {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  onModuleInit(): void {
    const httpAdapter = this.httpAdapterHost.httpAdapter;
    if (!httpAdapter) {
      return;
    }

    const document = buildSwaggerConfig() as OpenAPIObject;
    document.paths = document.paths ?? {};
    const json = JSON.stringify(document);

    httpAdapter.get(SWAGGER_JSON_PATH, (_req: unknown, res: Response) => {
      res.type('application/json');
      res.send(json);
    });

    const html = this.buildHtml();
    httpAdapter.get(SWAGGER_PATH, (_req: unknown, res: Response) => {
      res.type('text/html');
      res.send(html);
    });
  }

  private buildHtml(): string {
    const uiAssetPath: string = (
      swaggerUiDist as { getAbsoluteFSPath: () => string }
    ).getAbsoluteFSPath();
    const css = readFileSync(join(uiAssetPath, 'swagger-ui.css'), 'utf8');
    const bundle = readFileSync(
      join(uiAssetPath, 'swagger-ui-bundle.js'),
      'utf8',
    );
    const preset = readFileSync(
      join(uiAssetPath, 'swagger-ui-standalone-preset.js'),
      'utf8',
    );

    return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Whiz Gateway - Swagger UI</title>
    <style>${css}</style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script>${bundle}</script>
    <script>${preset}</script>
    <script>
      window.onload = function () {
        window.ui = SwaggerUIBundle({
          url: '${SWAGGER_JSON_PATH}',
          dom_id: '#swagger-ui',
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          layout: 'StandaloneLayout',
        });
      };
    </script>
    <!-- Swagger UI -->
  </body>
</html>`;
  }
}
