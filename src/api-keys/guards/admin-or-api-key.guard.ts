import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AdminKeyGuard } from './admin-key.guard';
import { ApiKeyGuard } from './api-key.guard';

@Injectable()
export class AdminOrApiKeyGuard implements CanActivate {
  constructor(
    private readonly adminKeyGuard: AdminKeyGuard,
    private readonly apiKeyGuard: ApiKeyGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const result = this.adminKeyGuard.canActivate(context);
      if (result) return true;
    } catch {
      // fall through to ApiKeyGuard
    }
    return this.apiKeyGuard.canActivate(context);
  }
}
