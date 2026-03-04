import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { ImageEntity } from './entities/image.entity';
import { HistoryService } from '@/history/history.service';
import { GalleryImageResponse } from './dto/gallery-response.dto';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

interface ErrnoException extends Error {
  code?: string;
}

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);
  private readonly uploadDir: string;

  constructor(
    @InjectRepository(ImageEntity)
    private readonly imageRepository: Repository<ImageEntity>,
    private readonly historyService: HistoryService,
    private readonly configService: ConfigService,
  ) {
    this.uploadDir = path.resolve(
      this.configService.get<string>('UPLOAD_DIR', 'uploads'),
    );
  }

  async listImages(
    page = 1,
    limit = 20,
  ): Promise<{ images: GalleryImageResponse[]; total: number }> {
    const [images, total] = await this.imageRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const galleryImages: GalleryImageResponse[] = await Promise.all(
      images.map(async (img) => {
        const messageCount = await this.historyService.getMessageCount(img.id);
        return {
          id: img.id,
          originalFilename: img.originalFilename,
          mimeType: img.mimeType,
          size: img.size,
          messageCount,
          createdAt: img.createdAt.toISOString(),
        };
      }),
    );

    return { images: galleryImages, total };
  }

  async deleteImage(imageId: string): Promise<void> {
    const image = await this.imageRepository.findOneBy({ id: imageId });
    if (!image) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Image not found',
        code: 'IMAGE_NOT_FOUND',
      });
    }

    this.assertPathContainment(image.uploadPath);

    // Remove file from disk — tolerate only ENOENT
    try {
      await fsPromises.unlink(image.uploadPath);
    } catch (err) {
      const errno = err as ErrnoException;
      if (errno.code === 'ENOENT') {
        this.logger.warn(
          `File not found on disk during delete: ${image.uploadPath}`,
        );
      } else {
        throw err;
      }
    }

    // CASCADE on FK handles message deletion
    await this.imageRepository.remove(image);
  }

  async getImageForServing(
    imageId: string,
  ): Promise<{ stream: fs.ReadStream; image: ImageEntity }> {
    const image = await this.imageRepository.findOneBy({ id: imageId });
    if (!image) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Image not found',
        code: 'IMAGE_NOT_FOUND',
      });
    }

    this.assertPathContainment(image.uploadPath);

    if (!ALLOWED_MIME_TYPES.has(image.mimeType)) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Image file not found on disk',
        code: 'IMAGE_FILE_NOT_FOUND',
      });
    }

    try {
      await fsPromises.access(image.uploadPath);
    } catch {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Image file not found on disk',
        code: 'IMAGE_FILE_NOT_FOUND',
      });
    }

    const stream = fs.createReadStream(image.uploadPath);
    return { stream, image };
  }

  private assertPathContainment(filePath: string): void {
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(this.uploadDir + path.sep) && resolved !== this.uploadDir) {
      this.logger.error(`Path traversal attempt blocked: ${filePath}`);
      throw new NotFoundException({
        statusCode: 404,
        message: 'Image file not found on disk',
        code: 'IMAGE_FILE_NOT_FOUND',
      });
    }
  }
}
