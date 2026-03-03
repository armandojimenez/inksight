import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileValidationPipe } from '@/common/pipes/file-validation.pipe';
import {
  createMinimalPng,
  createMinimalJpeg,
  createMinimalGif,
  createPngOfSize,
  createFakeImageBuffer,
  createExeBuffer,
} from '../../test/fixtures/image-buffers';

const MAX_FILE_SIZE = 16 * 1024 * 1024; // 16MB

function createMockConfigService(
  maxFileSize: number = MAX_FILE_SIZE,
): ConfigService {
  return {
    get: jest.fn((key: string) => {
      if (key === 'MAX_FILE_SIZE') return maxFileSize;
      return undefined;
    }),
  } as unknown as ConfigService;
}

function createMockFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    fieldname: 'image',
    originalname: 'test.png',
    encoding: '7bit',
    mimetype: 'image/png',
    buffer: createMinimalPng(),
    size: createMinimalPng().length,
    destination: '',
    filename: '',
    path: '',
    stream: null as never,
    ...overrides,
  };
}

/** Helper to extract error response code from a NestJS exception */
function getErrorCode(fn: () => void): string {
  try {
    fn();
    throw new Error('Expected function to throw');
  } catch (e) {
    if (
      e instanceof BadRequestException ||
      e instanceof UnsupportedMediaTypeException ||
      e instanceof PayloadTooLargeException
    ) {
      const response = e.getResponse() as Record<string, unknown>;
      return response.code as string;
    }
    throw e;
  }
}

describe('FileValidationPipe', () => {
  let pipe: FileValidationPipe;

  beforeEach(() => {
    pipe = new FileValidationPipe(createMockConfigService());
  });

  describe('valid files', () => {
    it('should accept a valid PNG file', () => {
      const file = createMockFile({
        originalname: 'photo.png',
        mimetype: 'image/png',
        buffer: createMinimalPng(),
        size: createMinimalPng().length,
      });
      expect(pipe.transform(file)).toBe(file);
    });

    it('should accept a valid JPG file', () => {
      const buffer = createMinimalJpeg();
      const file = createMockFile({
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        buffer,
        size: buffer.length,
      });
      expect(pipe.transform(file)).toBe(file);
    });

    it('should accept a valid JPEG file', () => {
      const buffer = createMinimalJpeg();
      const file = createMockFile({
        originalname: 'photo.jpeg',
        mimetype: 'image/jpeg',
        buffer,
        size: buffer.length,
      });
      expect(pipe.transform(file)).toBe(file);
    });

    it('should accept a valid GIF file', () => {
      const buffer = createMinimalGif();
      const file = createMockFile({
        originalname: 'animation.gif',
        mimetype: 'image/gif',
        buffer,
        size: buffer.length,
      });
      expect(pipe.transform(file)).toBe(file);
    });

    it('should accept uppercase extensions', () => {
      const file = createMockFile({
        originalname: 'PHOTO.PNG',
        mimetype: 'image/png',
        buffer: createMinimalPng(),
        size: createMinimalPng().length,
      });
      expect(pipe.transform(file)).toBe(file);
    });

    it('should accept mixed-case extensions', () => {
      const file = createMockFile({
        originalname: 'photo.JpG',
        mimetype: 'image/jpeg',
        buffer: createMinimalJpeg(),
        size: createMinimalJpeg().length,
      });
      expect(pipe.transform(file)).toBe(file);
    });

    it('should accept a file exactly at the size limit', () => {
      const buffer = createPngOfSize(MAX_FILE_SIZE);
      const file = createMockFile({
        originalname: 'large.png',
        buffer,
        size: MAX_FILE_SIZE,
      });
      expect(pipe.transform(file)).toBe(file);
    });
  });

  describe('missing file', () => {
    it('should reject null file with MISSING_FILE code', () => {
      expect(() => pipe.transform(null as never)).toThrow(BadRequestException);
      expect(getErrorCode(() => pipe.transform(null as never))).toBe(
        'MISSING_FILE',
      );
    });

    it('should reject undefined file with MISSING_FILE code', () => {
      expect(() => pipe.transform(undefined as never)).toThrow(
        BadRequestException,
      );
      expect(getErrorCode(() => pipe.transform(undefined as never))).toBe(
        'MISSING_FILE',
      );
    });
  });

  describe('invalid extensions', () => {
    it('should reject .bmp extension with UnsupportedMediaTypeException', () => {
      const file = createMockFile({ originalname: 'image.bmp' });
      expect(() => pipe.transform(file)).toThrow(UnsupportedMediaTypeException);
      expect(getErrorCode(() => pipe.transform(file))).toBe(
        'INVALID_FILE_TYPE',
      );
    });

    it('should reject .exe extension with UnsupportedMediaTypeException', () => {
      const file = createMockFile({
        originalname: 'virus.exe',
        buffer: createExeBuffer(),
      });
      expect(() => pipe.transform(file)).toThrow(UnsupportedMediaTypeException);
      expect(getErrorCode(() => pipe.transform(file))).toBe(
        'INVALID_FILE_TYPE',
      );
    });

    it('should reject .txt extension with UnsupportedMediaTypeException', () => {
      const file = createMockFile({ originalname: 'readme.txt' });
      expect(() => pipe.transform(file)).toThrow(UnsupportedMediaTypeException);
      expect(getErrorCode(() => pipe.transform(file))).toBe(
        'INVALID_FILE_TYPE',
      );
    });

    it('should reject a file with no extension', () => {
      const file = createMockFile({ originalname: 'noextension' });
      expect(() => pipe.transform(file)).toThrow(UnsupportedMediaTypeException);
      expect(getErrorCode(() => pipe.transform(file))).toBe(
        'INVALID_FILE_TYPE',
      );
    });
  });

  describe('magic byte mismatch', () => {
    it('should reject PNG extension with JPEG magic bytes', () => {
      const file = createMockFile({
        originalname: 'fake.png',
        mimetype: 'image/png',
        buffer: createMinimalJpeg(),
        size: createMinimalJpeg().length,
      });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
      expect(getErrorCode(() => pipe.transform(file))).toBe(
        'FILE_CONTENT_MISMATCH',
      );
    });

    it('should reject JPG extension with PNG magic bytes', () => {
      const file = createMockFile({
        originalname: 'fake.jpg',
        mimetype: 'image/jpeg',
        buffer: createMinimalPng(),
        size: createMinimalPng().length,
      });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
      expect(getErrorCode(() => pipe.transform(file))).toBe(
        'FILE_CONTENT_MISMATCH',
      );
    });

    it('should reject PNG extension with random bytes', () => {
      const file = createMockFile({
        originalname: 'random.png',
        buffer: createFakeImageBuffer(),
        size: createFakeImageBuffer().length,
      });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
      expect(getErrorCode(() => pipe.transform(file))).toBe(
        'FILE_CONTENT_MISMATCH',
      );
    });

    it('should reject a zero-byte file', () => {
      const file = createMockFile({
        originalname: 'empty.png',
        buffer: Buffer.alloc(0),
        size: 0,
      });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
      expect(getErrorCode(() => pipe.transform(file))).toBe(
        'FILE_CONTENT_MISMATCH',
      );
    });

    it('should reject a truncated header (too short for magic bytes)', () => {
      const file = createMockFile({
        originalname: 'truncated.png',
        buffer: Buffer.from([0x89, 0x50]),
        size: 2,
      });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
      expect(getErrorCode(() => pipe.transform(file))).toBe(
        'FILE_CONTENT_MISMATCH',
      );
    });
  });

  describe('file size', () => {
    it('should reject a file exceeding MAX_FILE_SIZE', () => {
      const buffer = createPngOfSize(MAX_FILE_SIZE + 1);
      const file = createMockFile({
        originalname: 'huge.png',
        buffer,
        size: MAX_FILE_SIZE + 1,
      });
      expect(() => pipe.transform(file)).toThrow(PayloadTooLargeException);
      expect(getErrorCode(() => pipe.transform(file))).toBe('FILE_TOO_LARGE');
    });

    it('should check size before magic bytes (rejects oversized file without FILE_CONTENT_MISMATCH)', () => {
      // File has wrong magic bytes AND is oversized — should get FILE_TOO_LARGE, not FILE_CONTENT_MISMATCH
      const file = createMockFile({
        originalname: 'oversized-wrong-magic.png',
        buffer: Buffer.alloc(MAX_FILE_SIZE + 1, 0x00),
        size: MAX_FILE_SIZE + 1,
      });
      expect(() => pipe.transform(file)).toThrow(PayloadTooLargeException);
      expect(getErrorCode(() => pipe.transform(file))).toBe('FILE_TOO_LARGE');
    });
  });

  describe('filename sanitization', () => {
    it('should sanitize forward slash path traversal', () => {
      const file = createMockFile({
        originalname: '../../etc/passwd.png',
        buffer: createMinimalPng(),
        size: createMinimalPng().length,
      });
      const result = pipe.transform(file);
      expect(result.originalname).not.toContain('..');
      expect(result.originalname).not.toContain('/');
      expect(result.originalname).toBe('passwd.png');
    });

    it('should sanitize backslash path traversal', () => {
      const file = createMockFile({
        originalname: '..\\..\\etc\\passwd.png',
        buffer: createMinimalPng(),
        size: createMinimalPng().length,
      });
      const result = pipe.transform(file);
      expect(result.originalname).not.toContain('..');
      expect(result.originalname).not.toContain('\\');
      expect(result.originalname).toBe('passwd.png');
    });

    it('should sanitize special characters', () => {
      const file = createMockFile({
        originalname: 'my photo (1) [final].png',
        buffer: createMinimalPng(),
        size: createMinimalPng().length,
      });
      const result = pipe.transform(file);
      expect(result.originalname).toMatch(/^[a-zA-Z0-9._-]+$/);
    });

    it('should preserve valid filenames', () => {
      const file = createMockFile({
        originalname: 'my-photo_2024.png',
        buffer: createMinimalPng(),
        size: createMinimalPng().length,
      });
      const result = pipe.transform(file);
      expect(result.originalname).toBe('my-photo_2024.png');
    });

    it('should strip null bytes from filename', () => {
      const file = createMockFile({
        originalname: 'photo\0.png',
        buffer: createMinimalPng(),
        size: createMinimalPng().length,
      });
      const result = pipe.transform(file);
      expect(result.originalname).not.toContain('\0');
      expect(result.originalname).toBe('photo.png');
    });

    it('should truncate filenames exceeding 255 characters', () => {
      const longName = 'a'.repeat(260) + '.png';
      const file = createMockFile({
        originalname: longName,
        buffer: createMinimalPng(),
        size: createMinimalPng().length,
      });
      const result = pipe.transform(file);
      expect(result.originalname.length).toBeLessThanOrEqual(255);
      expect(result.originalname).toMatch(/\.png$/);
    });

    it('should fall back to "unnamed" for dots-only filename base', () => {
      const file = createMockFile({
        originalname: '...png',
        buffer: createMinimalPng(),
        size: createMinimalPng().length,
      });
      const result = pipe.transform(file);
      expect(result.originalname).toBe('unnamed.png');
    });

    it('should reject dotfile-only filename after sanitization (/.png → .png → unnamed → no ext)', () => {
      // /.png after path strip = .png, extname('.png') = '' (Node treats as dotfile)
      // Fallback produces 'unnamed' which has no extension → correctly rejected
      const file = createMockFile({
        originalname: '/.png',
        buffer: createMinimalPng(),
        size: createMinimalPng().length,
      });
      expect(() => pipe.transform(file)).toThrow(UnsupportedMediaTypeException);
      expect(getErrorCode(() => pipe.transform(file))).toBe(
        'INVALID_FILE_TYPE',
      );
    });

    it('should fall back to "unnamed" when base is only dots', () => {
      // "..photo.png" has base "..photo" after sanitization which is "..photo"
      // "....png" → base is "..." → dots-only → fallback to "unnamed.png"
      const file = createMockFile({
        originalname: '....png',
        buffer: createMinimalPng(),
        size: createMinimalPng().length,
      });
      const result = pipe.transform(file);
      expect(result.originalname).toBe('unnamed.png');
    });
  });

  describe('MIME type derivation', () => {
    it('should override client-declared mimetype based on validated extension', () => {
      const file = createMockFile({
        originalname: 'photo.png',
        mimetype: 'application/octet-stream', // wrong mimetype from client
        buffer: createMinimalPng(),
        size: createMinimalPng().length,
      });
      const result = pipe.transform(file);
      expect(result.mimetype).toBe('image/png');
    });

    it('should set correct mimetype for jpg extension', () => {
      const buffer = createMinimalJpeg();
      const file = createMockFile({
        originalname: 'photo.jpg',
        mimetype: 'image/png', // deliberately wrong
        buffer,
        size: buffer.length,
      });
      const result = pipe.transform(file);
      expect(result.mimetype).toBe('image/jpeg');
    });

    it('should set correct mimetype for gif extension', () => {
      const buffer = createMinimalGif();
      const file = createMockFile({
        originalname: 'anim.gif',
        mimetype: 'application/octet-stream',
        buffer,
        size: buffer.length,
      });
      const result = pipe.transform(file);
      expect(result.mimetype).toBe('image/gif');
    });
  });
});
