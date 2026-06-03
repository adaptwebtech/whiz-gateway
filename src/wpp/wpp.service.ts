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
}
