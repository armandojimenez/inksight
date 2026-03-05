import { NoNullBytesValidator } from '@/common/validators/no-null-bytes.validator';
import { ValidationArguments } from 'class-validator';

describe('NoNullBytesValidator', () => {
  let validator: NoNullBytesValidator;

  beforeEach(() => {
    validator = new NoNullBytesValidator();
  });

  it('should accept a normal string', () => {
    expect(validator.validate('hello world')).toBe(true);
  });

  it('should accept an empty string', () => {
    expect(validator.validate('')).toBe(true);
  });

  it('should reject a string containing a null byte', () => {
    expect(validator.validate('hello\0world')).toBe(false);
  });

  it('should reject a string that is only a null byte', () => {
    expect(validator.validate('\0')).toBe(false);
  });

  it('should pass non-string values through (validated elsewhere)', () => {
    expect(validator.validate(123)).toBe(true);
    expect(validator.validate(null)).toBe(true);
    expect(validator.validate(undefined)).toBe(true);
  });

  it('should return the correct default message', () => {
    const args = { property: 'message' } as ValidationArguments;
    expect(validator.defaultMessage(args)).toBe(
      'message must not contain null bytes',
    );
  });
});
