# WppMediaBusinessProfiles

Contexto de upload assíncrono de mídia e gestão do perfil público de negócio WhatsApp. Recebe corpo binário, persiste em disco temporário, enfileira o processamento e devolve o resultado ao cliente via webhook. Encaminha à Meta Cloud API via `WppService`.

## Language

**Media ID**:
ID Meta opaco que identifica um arquivo de mídia já enviado. Não é conhecido na requisição de upload — é entregue pelo consumer via webhook (`payload.id`) após a conclusão. Usado em `GET`/`DELETE /wpp/:mediaId`.
_Avoid_: id da mídia, file id, anexo

**Upload Session ID**:
Identificador de uma sessão de upload resumível, retornado sincronamente por `POST /wpp/app/uploads`. Usado como `:uploadId` no passo binário e na consulta de status.
_Avoid_: session, uploadId genérico, id de sessão

**Upload resumível**:
Fluxo Meta de três passos para enviar binário (notadamente foto de perfil): criar sessão, enviar binário, consultar status. O passo binário é assíncrono no gateway.
_Avoid_: resumable, upload em partes, upload retomável

**profile_picture_handle**:
Handle devolvido pela Meta ao concluir o passo binário do upload resumível (`payload.h` no webhook). Informado em `UpdateBusinessProfileDto` para definir a foto de perfil.
_Avoid_: handle da foto, picture handle, h

**Business Profile**:
Perfil público de negócio de um número WhatsApp (about, endereço, e-mail, sites, vertical, foto). Lido e atualizado de forma síncrona via `/wpp/:phoneNumberId/whatsapp_business_profile`.
_Avoid_: perfil, profile, conta de negócio

**media.upload**:
Fila RabbitMQ estática que serializa os jobs de upload. Consumida por `WppMediaUploadConsumerService`, um job por vez; falha roteia para a DLQ `inbox.dead-letter`.
_Avoid_: fila de upload, queue de mídia, upload queue

**Arquivo temporário**:
Binário do upload gravado em `/tmp/wpp-uploads/<jobId>` enquanto o job aguarda e durante o forward à Meta. Deletado pelo consumer ao final do processamento; órfãos de crash são removidos pelo cron de limpeza após 1 hora.
_Avoid_: tmp, arquivo em disco, staging file

**Webhook de retorno**:
`POST` disparado pelo consumer para a `callback_url` do cliente ao concluir o job, com `WebhookCallbackDto` (`status: 'done' | 'failed'`). Possui retentativa com exponential backoff.
_Avoid_: callback, retorno, notificação
</content>
