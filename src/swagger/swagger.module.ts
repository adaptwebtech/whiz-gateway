import { Module } from '@nestjs/common';
import { SwaggerSetupService } from './swagger.setup.service';

/**
 * Registra a documentação Swagger no bootstrap (FR-13).
 */
@Module({
  providers: [SwaggerSetupService],
})
export class AppSwaggerModule {}
