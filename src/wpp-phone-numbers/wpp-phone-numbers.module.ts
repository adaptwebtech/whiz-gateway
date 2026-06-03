import { Module } from '@nestjs/common';
import { WppModule } from '../wpp/wpp.module';
import { WppGetStartedController } from './wpp-get-started.controller';
import { WppPhoneNumbersController } from './wpp-phone-numbers.controller';
import { WppRegistrationController } from './wpp-registration.controller';
import { WppSubscriptionsController } from './wpp-subscriptions.controller';
import { WppWabaController } from './wpp-waba.controller';

@Module({
  imports: [WppModule],
  controllers: [
    WppGetStartedController,
    WppPhoneNumbersController,
    WppRegistrationController,
    WppWabaController,
    WppSubscriptionsController,
  ],
})
export class WppPhoneNumbersModule {}
