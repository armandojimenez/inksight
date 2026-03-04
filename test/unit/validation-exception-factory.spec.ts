import { BadRequestException, ValidationError } from '@nestjs/common';
import { validationExceptionFactory } from '@/common/factories/validation-exception.factory';

describe('validationExceptionFactory', () => {
  it('should return INVALID_MESSAGE code when "message" property fails validation', () => {
    const errors: ValidationError[] = [
      {
        property: 'message',
        constraints: {
          isNotEmpty: 'message should not be empty',
        },
        children: [],
      },
    ];

    const exception = validationExceptionFactory(errors);
    expect(exception).toBeInstanceOf(BadRequestException);

    const response = exception.getResponse() as Record<string, unknown>;
    expect(response.code).toBe('INVALID_MESSAGE');
    expect(response.message).toBe('message should not be empty');
  });

  it('should return VALIDATION_ERROR code for non-message property failures', () => {
    const errors: ValidationError[] = [
      {
        property: 'page',
        constraints: {
          min: 'page must not be less than 1',
        },
        children: [],
      },
    ];

    const exception = validationExceptionFactory(errors);
    const response = exception.getResponse() as Record<string, unknown>;
    expect(response.code).toBe('VALIDATION_ERROR');
    expect(response.message).toBe('page must not be less than 1');
  });

  it('should join multiple error messages with semicolons', () => {
    const errors: ValidationError[] = [
      {
        property: 'page',
        constraints: {
          min: 'page must not be less than 1',
        },
        children: [],
      },
      {
        property: 'limit',
        constraints: {
          max: 'limit must not be greater than 50',
        },
        children: [],
      },
    ];

    const exception = validationExceptionFactory(errors);
    const response = exception.getResponse() as Record<string, unknown>;
    expect(response.code).toBe('VALIDATION_ERROR');
    expect(response.message).toBe(
      'page must not be less than 1; limit must not be greater than 50',
    );
  });

  it('should return VALIDATION_ERROR for whitelisted (unknown) properties', () => {
    const errors: ValidationError[] = [
      {
        property: 'unknownField',
        constraints: {
          whitelistValidation:
            'property unknownField should not exist',
        },
        children: [],
      },
    ];

    const exception = validationExceptionFactory(errors);
    const response = exception.getResponse() as Record<string, unknown>;
    expect(response.code).toBe('VALIDATION_ERROR');
  });
});
