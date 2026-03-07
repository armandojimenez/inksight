import { ApiProperty } from '@nestjs/swagger';

export class ReanalyzeResponseDto {
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
    description: 'Updated AI analysis (OpenAI Chat Completion format)',
    nullable: true,
  })
  analysis!: Record<string, unknown> | null;

  @ApiProperty({
    description: 'Entity version after update (optimistic locking)',
    example: 2,
  })
  version!: number;
}
