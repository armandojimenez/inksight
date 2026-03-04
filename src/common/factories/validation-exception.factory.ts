import { BadRequestException, ValidationError } from '@nestjs/common';

export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  const messages: string[] = [];
  let hasMessageProperty = false;

  for (const error of errors) {
    if (error.property === 'message') {
      hasMessageProperty = true;
    }
    if (error.constraints) {
      messages.push(...Object.values(error.constraints));
    }
  }

  const code = hasMessageProperty ? 'INVALID_MESSAGE' : 'VALIDATION_ERROR';
  const message = messages.join('; ');

  return new BadRequestException({ statusCode: 400, message, code });
}
