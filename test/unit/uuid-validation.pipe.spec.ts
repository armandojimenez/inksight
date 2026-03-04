import { BadRequestException } from '@nestjs/common';
import { UuidValidationPipe } from '@/common/pipes/uuid-validation.pipe';

function captureError(fn: () => void): Error {
  try {
    fn();
    throw new Error('Expected function to throw');
  } catch (error) {
    return error as Error;
  }
}

describe('UuidValidationPipe', () => {
  let pipe: UuidValidationPipe;

  beforeEach(() => {
    pipe = new UuidValidationPipe();
  });

  it('should accept a valid UUID v4', () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(pipe.transform(validUuid)).toBe(validUuid);
  });

  it('should accept a valid UUID v4 with lowercase hex', () => {
    const validUuid = 'a1b2c3d4-e5f6-4890-abcd-ef1234567890';
    expect(pipe.transform(validUuid)).toBe(validUuid);
  });

  it('should reject a non-UUID string with INVALID_UUID code', () => {
    expect(() => pipe.transform('not-a-uuid')).toThrow(BadRequestException);

    const error = captureError(() => pipe.transform('not-a-uuid'));
    const response = (error as BadRequestException).getResponse() as Record<
      string,
      unknown
    >;
    expect(response.code).toBe('INVALID_UUID');
    expect(response.message).toBe('Invalid UUID format');
  });

  it('should reject a UUID v1', () => {
    const uuidV1 = '550e8400-e29b-11d4-a716-446655440000';
    expect(() => pipe.transform(uuidV1)).toThrow(BadRequestException);
  });

  it('should reject an empty string', () => {
    expect(() => pipe.transform('')).toThrow(BadRequestException);
  });

  it('should not reflect user input in error message', () => {
    const maliciousInput = '<script>alert("xss")</script>';
    const error = captureError(() => pipe.transform(maliciousInput));
    const response = (error as BadRequestException).getResponse() as Record<
      string,
      unknown
    >;
    expect(response.message).toBe('Invalid UUID format');
    expect(String(response.message)).not.toContain(maliciousInput);
  });
});
