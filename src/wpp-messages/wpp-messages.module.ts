import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { WppAuthFilter } from '../wpp/filters/wpp-auth.filter';
import { WppModule } from '../wpp/wpp.module';
import { WppMessagesController } from './wpp-messages.controller';

@Module({
  imports: [WppModule, ApiKeysModule],
  controllers: [WppMessagesController],
  providers: [WppAuthFilter],
})
export class WppMessagesModule {}
