import {
  Injectable,
  PipeTransform,
  BadRequestException,
  UnsupportedMediaTypeException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extname } from 'path';
import { open, unlink } from 'fs/promises';

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

  async transform(file: Express.Multer.File): Promise<Express.Multer.File> {
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
      await this.cleanupDiskFile(file);
      throw new UnsupportedMediaTypeException({
        message: `File type not allowed. Accepted types: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
        code: 'INVALID_FILE_TYPE',
      });
    }

    // 3. Validate file size (cheapest check before magic byte inspection)
    if (file.size > this.maxFileSize) {
      await this.cleanupDiskFile(file);
      throw new PayloadTooLargeException({
        message: `File size exceeds the maximum allowed size of ${this.maxFileSize} bytes`,
        code: 'FILE_TOO_LARGE',
      });
    }

    // 4. Validate magic bytes — dual-path: buffer (memory) or path (disk)
    const expectedMagic = EXT_TO_MAGIC[ext];
    if (expectedMagic) {
      const headerBytes = file.buffer
        ? file.buffer.subarray(0, expectedMagic.length)
        : await this.readHeaderFromDisk(file.path, expectedMagic.length);

      if (
        !headerBytes ||
        headerBytes.length < expectedMagic.length ||
        !expectedMagic.every((byte, i) => headerBytes[i] === byte)
      ) {
        await this.cleanupDiskFile(file);
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

  private async readHeaderFromDisk(
    filePath: string,
    byteCount: number,
  ): Promise<Buffer | null> {
    let fh;
    try {
      fh = await open(filePath, 'r');
      const buf = Buffer.alloc(byteCount);
      const { bytesRead } = await fh.read(buf, 0, byteCount, 0);
      return buf.subarray(0, bytesRead);
    } catch (err) {
      // Log non-ENOENT errors — ENOENT means the file disappeared between Multer and pipe
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') {
        // Use console.warn — pipe has no injected Logger
        console.warn(`[FileValidationPipe] Failed to read header from ${filePath}: ${code ?? err}`);
      }
      return null;
    } finally {
      await fh?.close();
    }
  }

  /** Remove Multer's disk file on validation failure to prevent disk buildup */
  private async cleanupDiskFile(file: Express.Multer.File): Promise<void> {
    if (file.path) {
      await unlink(file.path).catch(() => {});
    }
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
    if (!sanitized || !baseWithoutExt || /^\.+$/.test(baseWithoutExt)) {
      const ext = extname(sanitized);
      sanitized = ext ? `unnamed${ext}` : 'unnamed';
    }
    return sanitized;
  }
}
