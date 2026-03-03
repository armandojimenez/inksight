export interface UploadResponseDto {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  analysis: Record<string, unknown> | null;
}
