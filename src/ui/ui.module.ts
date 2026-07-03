import { Module } from '@nestjs/common';
import { UiController } from './ui.controller';

/**
 * Módulo do painel administrativo estático (`/ui`).
 */
@Module({
  controllers: [UiController],
})
export class UiModule {}
