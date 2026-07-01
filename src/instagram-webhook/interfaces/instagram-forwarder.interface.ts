import type { InboxResponseDto } from '../../inbox/dto/inbox-response.dto';

/**
 * Contrato do serviço de forward de webhooks de Instagram.
 * Encaminha o corpo cru (byte-idêntico) para o sub-caminho de destino no
 * `ambiente.url` resolvido a partir da inbox.
 */
export interface IInstagramForwarder {
  /**
   * Encaminha o payload cru para `{ambiente.url}{subPath}`.
   *
   * @param subPath sub-caminho de destino (`/webhooks/instagram` ou
   *   `/webhooks/instagram-login`).
   * @param inbox inbox resolvida (fornece `id_ambiente`).
   * @param rawBody bytes exatos recebidos da Meta (nunca reserializados).
   * @param signature valor original do header `x-hub-signature-256`.
   */
  forward(
    subPath: string,
    inbox: InboxResponseDto,
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<void>;
}
