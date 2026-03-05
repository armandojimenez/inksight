import { IsString, IsNotEmpty, MaxLength, Validate } from 'class-validator';
import { Transform } from 'class-transformer';
import { NoNullBytesValidator } from '@/common/validators/no-null-bytes.validator';

// Strip control chars U+0001-U+001F except tab (0x09), newline (0x0A), carriage return (0x0D)
function sanitizeControlChars(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

export class ChatRequestDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? sanitizeControlChars(value.trim()) : value,
  )
  @IsString()
  @Validate(NoNullBytesValidator)
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;
}
