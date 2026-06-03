import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ResendRequestDto } from './dto/resend-request.dto';
import { ResendResultDto } from './dto/resend-result.dto';
import { ResendService } from './resend.service';

/**
 * Controller de reenvio de mensagens mortas (reenvio-mensagens, Feature 7).
 */
@ApiTags('Reenvio de Mensagens')
@ApiBearerAuth('bearer')
@Controller('messages')
export class ResendController {
  constructor(private readonly resendService: ResendService) {}

  @Post('resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reenvio de mensagens mortas',
    description:
      'Re-despacha mensagens mortas filtradas por PID ou intervalo de data.',
  })
  @ApiResponse({
    status: 200,
    description: 'Resultado do reenvio com totais de sucesso e falha.',
    type: ResendResultDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Parâmetros inválidos: critério ausente ou dataInicio > dataFim.',
  })
  async resend(@Body() dto: ResendRequestDto): Promise<ResendResultDto> {
    return this.resendService.resend(dto);
  }
}
