import { BadRequestException } from '@nestjs/common';
import { UuidValidationPipe } from '@/common/pipes/uuid-validation.pipe';

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

  it('should reject a non-UUID string', () => {
    expect(() => pipe.transform('not-a-uuid')).toThrow(BadRequestException);
    try {
      pipe.transform('not-a-uuid');
    } catch (error) {
      const response = (error as BadRequestException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response.code).toBe('INVALID_UUID');
    }
  });

  it('should reject a UUID v1', () => {
    // UUID v1: version nibble = 1 (third group starts with 1)
    const uuidV1 = '550e8400-e29b-11d4-a716-446655440000';
    expect(() => pipe.transform(uuidV1)).toThrow(BadRequestException);
  });

  it('should reject an empty string', () => {
    expect(() => pipe.transform('')).toThrow(BadRequestException);
  });

  it('should include INVALID_UUID code in error response', () => {
    try {
      pipe.transform('invalid');
      fail('Expected BadRequestException');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response.code).toBe('INVALID_UUID');
      expect(response.message).toBeDefined();
    }
  });
});
