import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { WppModule } from '../wpp/wpp.module';
import { WppBusinessProfileController } from './wpp-business-profile.controller';
import { WppMediaController } from './wpp-media.controller';
import { WppMediaCleanupService } from './wpp-media-cleanup.service';
import { WppMediaUploadConsumerService } from './wpp-media-upload-consumer.service';
import { WppResumableUploadController } from './wpp-resumable-upload.controller';

@Module({
  imports: [WppModule, ApiKeysModule, ScheduleModule.forRoot()],
  controllers: [
    WppMediaController,
    WppResumableUploadController,
    WppBusinessProfileController,
  ],
  providers: [WppMediaUploadConsumerService, WppMediaCleanupService],
})
export class WppMediaBusinessProfilesModule {}
