import { Module } from '@nestjs/common';
import { WppModule } from '../wpp/wpp.module';
import { WppAnalyticsController } from './wpp-analytics.controller';
import { WppBillingController } from './wpp-billing.controller';
import { WppBlockUsersController } from './wpp-block-users.controller';
import { WppCommerceController } from './wpp-commerce.controller';
import { WppComplianceController } from './wpp-compliance.controller';
import { WppQrCodeController } from './wpp-qrcode.controller';

@Module({
  imports: [WppModule],
  controllers: [
    WppQrCodeController,
    WppAnalyticsController,
    WppBillingController,
    WppCommerceController,
    WppBlockUsersController,
    WppComplianceController,
  ],
})
export class WppMiscModule {}
