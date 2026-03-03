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

    // Validate extension
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new UnsupportedMediaTypeException({
        message: `File type not allowed. Accepted types: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
        code: 'INVALID_FILE_TYPE',
      });
    }

    // Validate magic bytes (keyed by extension, not mimetype)
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

    // Validate file size
    if (file.size > this.maxFileSize) {
      throw new PayloadTooLargeException({
        message: `File size exceeds the maximum allowed size of ${this.maxFileSize} bytes`,
        code: 'FILE_TOO_LARGE',
      });
    }

    // Sanitize filename
    file.originalname = this.sanitizeFilename(file.originalname);

    return file;
  }

  private sanitizeFilename(filename: string): string {
    // Extract just the filename (strip path traversal)
    const basename = filename.replace(/^.*[/\\]/, '');
    // Replace disallowed characters
    return basename.replace(/[^a-zA-Z0-9._-]/g, '_');
  }
}
