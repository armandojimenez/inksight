import { IsString, IsNotEmpty, MinLength, MaxLength, Validate } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { NoNullBytesValidator } from '@/common/validators/no-null-bytes.validator';

// Strip C0 control chars (except tab/LF/CR), DEL, and C1 control chars
const CONTROL_CHAR_PATTERN = /[\x01-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F]/g;
function sanitizeControlChars(value: string): string {
  return value.replace(CONTROL_CHAR_PATTERN, '');
}

export class ChatRequestDto {
  @ApiProperty({
    description: 'User message to send to the AI assistant',
    minLength: 1,
    maxLength: 2000,
    example: 'What objects can you identify in this image?',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? sanitizeControlChars(value.trim()) : value,
  )
  @IsString({ message: 'Message must be a string' })
  @Validate(NoNullBytesValidator, { message: 'Message contains null bytes' })
  @IsNotEmpty({ message: 'Message cannot be empty' })
  @MinLength(1, { message: 'Message must be at least 1 character long' })
  @MaxLength(2000, { message: 'Message cannot exceed 2000 characters' })
  message!: string;
}
