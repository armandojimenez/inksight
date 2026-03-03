export class UploadResponseDto {
  id!: string;
  filename!: string;
  mimeType!: string;
  size!: number;
  analysis!: string | null;
}
