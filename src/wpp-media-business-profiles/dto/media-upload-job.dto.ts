export class MediaUploadJobDto {
  jobId: string;
  type: 'media' | 'resumable-binary';
  subPath: string;
  tmpFilePath: string;
  contentType: string;
  messagingProduct?: string;
  /**
   * Offset do chunk, já resolvido pelo controller (query param → header →
   * `"0"`). Opcional só por compatibilidade com jobs antigos ainda na fila:
   * jobs novos sempre têm valor.
   */
  fileOffset?: string;
  callbackUrl?: string;
  /**
   * Nome do arquivo no multipart ORIGINAL (ex.: `audio.m4a`). O tmp em disco se
   * chama `jobId` — UUID sem extensão — e a Meta usa a extensão para confirmar o
   * mime: sem ela, áudio aceito no upload volta como 131053
   * ("on processing it is of type application/octet-stream").
   */
  filename?: string;
  /** Campo `type` do multipart original (ex.: `audio/mp4`). Mesma razão. */
  mediaType?: string;
}
