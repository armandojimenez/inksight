import {
  Injectable,
  PipeTransform,
  BadRequestException,
  UnsupportedMediaTypeException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extname } from 'path';

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif']);

const EXT_TO_MAGIC: Record<string, number[]> = {
  '.png': [0x89, 0x50, 0x4e, 0x47],
  '.jpg': [0xff, 0xd8, 0xff],
  '.jpeg': [0xff, 0xd8, 0xff],
  '.gif': [0x47, 0x49, 0x46],
};

const EXT_TO_MIMETYPE: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
};

const MAX_FILENAME_LENGTH = 255;

@Injectable()
export class FileValidationPipe implements PipeTransform<Express.Multer.File> {
  private readonly maxFileSize: number;

  constructor(private readonly configService: ConfigService) {
    this.maxFileSize = this.configService.get<number>(
      'MAX_FILE_SIZE',
      16 * 1024 * 1024,
    );
  }

  transform(file: Express.Multer.File): Express.Multer.File {
    if (!file) {
      throw new BadRequestException({
        message: 'No file provided',
        code: 'MISSING_FILE',
      });
    }

    // 1. Sanitize filename FIRST (before extension extraction)
    //    This ensures extension extraction operates on the cleaned name.
    file.originalname = this.sanitizeFilename(file.originalname);

    // 2. Validate extension (extracted from sanitized filename)
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new UnsupportedMediaTypeException({
        message: `File type not allowed. Accepted types: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
        code: 'INVALID_FILE_TYPE',
      });
    }

    // 3. Validate file size (cheapest check before magic byte inspection)
    if (file.size > this.maxFileSize) {
      throw new PayloadTooLargeException({
        message: `File size exceeds the maximum allowed size of ${this.maxFileSize} bytes`,
        code: 'FILE_TOO_LARGE',
      });
    }

    // 4. Validate magic bytes (keyed by extension, not client-declared mimetype)
    const expectedMagic = EXT_TO_MAGIC[ext];
    if (expectedMagic) {
      if (
        !file.buffer ||
        file.buffer.length < expectedMagic.length ||
        !expectedMagic.every((byte, i) => file.buffer[i] === byte)
      ) {
        throw new BadRequestException({
          message: 'File content does not match its extension',
          code: 'FILE_CONTENT_MISMATCH',
        });
      }
    }

    // 5. Derive correct MIME type from validated extension (defense-in-depth)
    const correctMimeType = EXT_TO_MIMETYPE[ext];
    if (correctMimeType) {
      file.mimetype = correctMimeType;
    }

    return file;
  }

  private sanitizeFilename(filename: string): string {
    // Strip null bytes first
    let sanitized = filename.replace(/\0/g, '');
    // Extract just the basename (strip path traversal)
    sanitized = sanitized.replace(/^.*[/\\]/, '');
    // Replace disallowed characters
    sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '_');
    // Truncate to max length (preserving extension)
    if (sanitized.length > MAX_FILENAME_LENGTH) {
      const ext = extname(sanitized);
      const nameWithoutExt = sanitized.slice(
        0,
        MAX_FILENAME_LENGTH - ext.length,
      );
      sanitized = nameWithoutExt + ext;
    }
    // Fallback if sanitized result is empty, only dots, or has no base name
    const baseWithoutExt = sanitized.replace(/\.[^.]+$/, '');
    if (
      !sanitized ||
      !baseWithoutExt ||
      /^\.+$/.test(baseWithoutExt)
    ) {
      const ext = extname(sanitized);
      sanitized = ext ? `unnamed${ext}` : 'unnamed';
    }
    return sanitized;
  }
}
