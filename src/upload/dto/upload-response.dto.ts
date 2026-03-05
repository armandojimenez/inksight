import { ApiProperty } from '@nestjs/swagger';

export class UploadResponseDto {
  @ApiProperty({
    description: 'Unique image identifier',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Sanitized original filename',
    example: 'photo.jpg',
  })
  filename!: string;

  @ApiProperty({
    description: 'Image MIME type',
    enum: ['image/png', 'image/jpeg', 'image/gif'],
    example: 'image/jpeg',
  })
  mimeType!: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 245832,
  })
  size!: number;

  @ApiProperty({
    description: 'Initial AI analysis (OpenAI Chat Completion format), or null if analysis was skipped',
    nullable: true,
    example: {
      id: 'chatcmpl-abc123',
      object: 'chat.completion',
      created: 1709554800,
      model: 'gpt-5.2',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'This image shows a mountain landscape with a clear blue sky.',
          },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 255, completion_tokens: 50, total_tokens: 305 },
    },
  })
  analysis!: Record<string, unknown> | null;
}
