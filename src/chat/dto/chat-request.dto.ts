import { IsString, IsNotEmpty, MaxLength, Validate } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { NoNullBytesValidator } from '@/common/validators/no-null-bytes.validator';

// Strip C0 control chars (except tab/LF/CR), DEL, and C1 control chars
function sanitizeControlChars(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F]/g, '');
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
  @IsString()
  @Validate(NoNullBytesValidator)
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;
}
