export class MediaUploadJobDto {
  jobId: string;
  type: 'media' | 'resumable-binary';
  subPath: string;
  tmpFilePath: string;
  contentType: string;
  messagingProduct?: string;
  fileOffset?: string;
  callbackUrl?: string;
}
