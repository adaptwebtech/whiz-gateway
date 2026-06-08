import { PartialType } from '@nestjs/swagger';
import { CreateRedirecionamentoWebhookDto } from './create-redirecionamento-webhook.dto';

export class UpdateRedirecionamentoWebhookDto extends PartialType(
  CreateRedirecionamentoWebhookDto,
) {}
