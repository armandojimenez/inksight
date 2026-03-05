import { ApiProperty } from '@nestjs/swagger';

export class GalleryImageResponse {
  @ApiProperty({
    description: 'Unique image identifier',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Original filename at upload time',
    example: 'mountain_view.png',
  })
  originalFilename!: string;

  @ApiProperty({
    description: 'Image MIME type',
    enum: ['image/png', 'image/jpeg', 'image/gif'],
    example: 'image/png',
  })
  mimeType!: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 245832,
  })
  size!: number;

  @ApiProperty({
    description: 'Number of chat messages associated with this image',
    example: 4,
  })
  messageCount!: number;

  @ApiProperty({
    description: 'ISO 8601 timestamp when the image was uploaded',
    example: '2026-03-04T10:30:00.000Z',
  })
  createdAt!: string;
}

export class GalleryResponse {
  @ApiProperty({
    description: 'Array of image metadata objects',
    type: [GalleryImageResponse],
  })
  images!: GalleryImageResponse[];

  @ApiProperty({
    description: 'Total number of images across all pages',
    example: 42,
  })
  total!: number;

  @ApiProperty({
    description: 'Current page number (1-indexed)',
    example: 1,
  })
  page!: number;

  @ApiProperty({
    description: 'Number of items per page',
    example: 20,
  })
  pageSize!: number;

  @ApiProperty({
    description: 'Total number of pages',
    example: 3,
  })
  totalPages!: number;
}
