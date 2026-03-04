import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

// UUID v4: version nibble = 4, variant nibble = 8/9/a/b
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class UuidValidationPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!UUID_V4_REGEX.test(value)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Invalid UUID format',
        code: 'INVALID_UUID',
      });
    }
    return value;
  }
}
