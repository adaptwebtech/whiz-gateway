import * as fs from 'fs';
import * as path from 'path';
import { HttpService } from '@nestjs/axios';
import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

export interface WppForwardOptions {
  query?: Record<string, string | string[]>;
  body?: unknown;
  headers?: Record<string, string>;
  contentType?: string;
}

export interface WppForwardResult {
  status: number;
  data: unknown;
}

@Injectable()
export class WppService {
  private readonly logger = new Logger(WppService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async forward(
    method: string,
    path: string,
    opts: WppForwardOptions,
  ): Promise<WppForwardResult> {
    const baseUrl = this.configService.get<string>('META_GRAPH_URL')!;
    const token = this.configService.get<string>('META_ACCESS_TOKEN')!;

    // Normalize: strip leading slash from path to avoid double-slash
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    const url = `${baseUrl}/${normalizedPath}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': opts.contentType ?? 'application/json',
      ...opts.headers,
    };

    this.logger.log(`forward ${method} ${normalizedPath}`);

    try {
      const response = await firstValueFrom(
        this.httpService.request({
          method,
          url,
          params: opts.query ?? undefined,
          data: opts.body,
          headers,
        }),
      );
      this.logger.log(
        `forward ${method} ${normalizedPath} → ${response.status}`,
      );
      return { status: response.status, data: response.data };
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (axiosErr.response) {
        // Meta returned an HTTP error (4xx/5xx) — pass through transparently
        this.logger.log(
          `forward ${method} ${normalizedPath} → ${axiosErr.response.status} (Meta error passthrough)`,
        );
        return {
          status: axiosErr.response.status,
          data: axiosErr.response.data,
        };
      }
      // Transport error (timeout, network) → 502
      this.logger.error(
        `forward ${method} ${normalizedPath} → transport error: ${String(err)}`,
      );
      throw new BadGatewayException(
        'Erro de transporte ao contatar a Meta API',
      );
    }
  }

  async forwardMultipart(
    subPath: string,
    tmpFilePath: string,
    contentType: string,
    messagingProduct: string,
  ): Promise<WppForwardResult> {
    const fileBuffer = await fs.promises.readFile(tmpFilePath);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FormData = require('form-data') as typeof import('form-data');
    const form = new FormData();
    form.append('messaging_product', messagingProduct);
    form.append('file', fileBuffer, {
      filename: path.basename(tmpFilePath),
      contentType,
    });

    const baseUrl = this.configService.get<string>('META_GRAPH_URL')!;
    const token = this.configService.get<string>('META_ACCESS_TOKEN')!;
    const normalizedPath = subPath.startsWith('/') ? subPath.slice(1) : subPath;
    const url = `${baseUrl}/${normalizedPath}`;

    this.logger.log(`forwardMultipart POST ${normalizedPath}`);
    try {
      const response = await firstValueFrom(
        this.httpService.request({
          method: 'POST',
          url,
          data: form,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(form.getHeaders() as Record<string, string>),
          },
        }),
      );
      this.logger.log(
        `forwardMultipart POST ${normalizedPath} → ${response.status}`,
      );
      return { status: response.status, data: response.data };
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (axiosErr.response) {
        this.logger.log(
          `forwardMultipart POST ${normalizedPath} → ${axiosErr.response.status} (Meta error passthrough)`,
        );
        return {
          status: axiosErr.response.status,
          data: axiosErr.response.data,
        };
      }
      this.logger.error(
        `forwardMultipart POST ${normalizedPath} → transport error: ${String(err)}`,
      );
      throw new BadGatewayException(
        'Erro de transporte ao contatar a Meta API',
      );
    }
  }

  async forwardBinary(
    subPath: string,
    tmpFilePath: string,
    contentType: string,
    fileOffset: string,
  ): Promise<WppForwardResult> {
    const fileBuffer = await fs.promises.readFile(tmpFilePath);
    const baseUrl = this.configService.get<string>('META_GRAPH_URL')!;
    const token = this.configService.get<string>('META_ACCESS_TOKEN')!;
    const normalizedPath = subPath.startsWith('/') ? subPath.slice(1) : subPath;
    const url = `${baseUrl}/${normalizedPath}`;

    this.logger.log(`forwardBinary POST ${normalizedPath}`);
    try {
      const response = await firstValueFrom(
        this.httpService.request({
          method: 'POST',
          url,
          data: fileBuffer,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': contentType,
            file_offset: fileOffset,
          },
        }),
      );
      this.logger.log(
        `forwardBinary POST ${normalizedPath} → ${response.status}`,
      );
      return { status: response.status, data: response.data };
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (axiosErr.response) {
        this.logger.log(
          `forwardBinary POST ${normalizedPath} → ${axiosErr.response.status} (Meta error passthrough)`,
        );
        return {
          status: axiosErr.response.status,
          data: axiosErr.response.data,
        };
      }
      this.logger.error(
        `forwardBinary POST ${normalizedPath} → transport error: ${String(err)}`,
      );
      throw new BadGatewayException(
        'Erro de transporte ao contatar a Meta API',
      );
    }
  }
}
