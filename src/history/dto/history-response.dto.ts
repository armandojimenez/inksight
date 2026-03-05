import { ApiProperty } from '@nestjs/swagger';

export class HistoryMessageResponse {
  @ApiProperty({
    description: 'Unique message identifier',
    format: 'uuid',
    example: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
  })
  id!: string;

  @ApiProperty({
    description: 'Message author role',
    enum: ['user', 'assistant'],
    example: 'user',
  })
  role!: string;

  @ApiProperty({
    description: 'Message content text',
    example: 'What objects can you identify in this image?',
  })
  content!: string;

  @ApiProperty({
    description: 'ISO 8601 timestamp when the message was created',
    example: '2026-03-04T10:30:00.000Z',
  })
  timestamp!: string;
}

export class HistoryResponse {
  @ApiProperty({
    description: 'Image identifier this conversation belongs to',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  imageId!: string;

  @ApiProperty({
    description: 'Array of chat messages ordered by creation time',
    type: [HistoryMessageResponse],
  })
  messages!: HistoryMessageResponse[];

  @ApiProperty({
    description: 'Total number of messages across all pages',
    example: 12,
  })
  totalMessages!: number;

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
    example: 1,
  })
  totalPages!: number;
}
