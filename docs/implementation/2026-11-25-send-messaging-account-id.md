# `messaging_account_id` no envio de mensagem — 2026-11-25

## Problema

O whiz server (chave WAME `messagingAccountIdNoEnvio`) passou a mandar `messaging_account_id` no corpo de
`POST /wpp/:phoneNumberId/messages`. O `SendMessageDto` não declarava o campo, e o `ValidationPipe` global
(`whitelist` + `forbidNonWhitelisted`) respondia `400 property messaging_account_id should not exist`. A
requisição nem chegava à Meta.

O campo é a saída para um número cuja conta paga padrão é outra WABA. Caso real: o mesmo PID onboardado em duas
WABAs. Sem o campo, a Meta usa a conta padrão do número e o envio de texto falha com
`#10 Viewer cannot access the provided Paid Message Account <outra WABA>` quando o token não alcança essa conta.

## Mudança

- `src/wpp-messages/dto/send-message.dto.ts`: `messaging_account_id?: string` (`@IsOptional @IsString`), com Swagger.
  O controller já repassa o DTO inteiro, então não mudou.
- Teste: `wpp-messages.controller.spec.ts`, AC-26 (campo repassado íntegro; valor não-string → 400).
- Spec: `docs/specs/2026-06-03-wpp-messages.md` (campo comum + AC-26).

Sem mudança de rota, guard, roteamento de webhook, env ou schema: `docs/GUIA-GATEWAY.md` e o painel `/ui` não
são afetados (o painel não expõe envio de mensagem).
