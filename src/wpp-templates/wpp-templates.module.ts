import { Module } from '@nestjs/common';
import { WppModule } from '../wpp/wpp.module';
import { WppTemplatesController } from './wpp-templates.controller';

@Module({
  imports: [WppModule],
  controllers: [WppTemplatesController],
})
export class WppTemplatesModule {}
