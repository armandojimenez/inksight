import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseSchema {
  @ApiProperty({ description: 'HTTP status code', example: 400 })
  statusCode!: number;

  @ApiProperty({ description: 'HTTP status text', example: 'Bad Request' })
  error!: string;

  @ApiProperty({
    description:
      'Machine-readable error code. Additional codes derived from HTTP status text may appear for framework-level errors.',
    example: 'INVALID_UUID',
    enum: [
      'MISSING_FILE',
      'INVALID_FILE_TYPE',
      'FILE_CONTENT_MISMATCH',
      'FILE_TOO_LARGE',
      'INVALID_UUID',
      'INVALID_MESSAGE',
      'VALIDATION_ERROR',
      'IMAGE_NOT_FOUND',
      'IMAGE_FILE_NOT_FOUND',
      'RATE_LIMIT_EXCEEDED',
      'SSE_CONNECTION_LIMIT',
      'INVALID_JSON',
      'PAYLOAD_TOO_LARGE',
      'BODY_VERIFY_FAILED',
      'UNSUPPORTED_CHARSET',
      'UNSUPPORTED_ENCODING',
      'INTERNAL_ERROR',
    ],
  })
  code!: string;

  @ApiProperty({
    description: 'Human-readable error message',
    example: 'Invalid UUID format',
  })
  message!: string;

  @ApiProperty({
    description: 'ISO 8601 timestamp',
    example: '2026-03-04T10:30:00.000Z',
  })
  timestamp!: string;

  @ApiProperty({ description: 'Request path', example: '/api/upload' })
  path!: string;

  @ApiProperty({
    description: 'Request correlation ID (from X-Request-Id header or auto-generated UUID v4)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  requestId!: string;
}
