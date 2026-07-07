import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { join } from 'path';

/**
 * Serve o painel administrativo estático (CRUD) em `/ui`.
 *
 * A página é um SPA autocontido (Alpine.js + Pico CSS) que consome os próprios
 * endpoints REST do gateway. Não possui guard: a autenticação é feita pelo
 * navegador, que anexa `Authorization: Bearer` e `x-api-key` em cada chamada.
 *
 * IMPORTANTE: ao alterar schema/rotas/DTOs de um recurso, atualize também
 * `src/ui/public/index.html` (ver seção "Admin UI" em README.md / CLAUDE.md).
 */
@ApiExcludeController()
@Controller('ui')
export class UiController {
  @Get()
  index(@Res() res: Response): void {
    res.sendFile(join(__dirname, 'public', 'index.html'));
  }

  @Get('whiz-badge.png')
  favicon(@Res() res: Response): void {
    res.sendFile(join(__dirname, 'public', 'whiz-badge.png'));
  }
}
