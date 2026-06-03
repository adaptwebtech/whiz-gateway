import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { WppAuthFilter } from './filters/wpp-auth.filter';
import { WppController } from './wpp.controller';
import { WppService } from './wpp.service';

@Module({
  imports: [HttpModule],
  controllers: [WppController],
  providers: [WppService, WppAuthFilter],
  exports: [WppService],
})
export class WppModule {}
