import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { ImageEntity } from './entities/image.entity';
import { HistoryService } from '@/history/history.service';
import { GalleryImageResponse } from './dto/gallery-response.dto';
import { CACHE_KEYS } from '@/cache/cache-keys';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

const IMAGE_CACHE_TTL = 600_000; // 10 minutes

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
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
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

    const imageIds = images.map((img) => img.id);
    const messageCounts =
      await this.historyService.getMessageCountBatch(imageIds);

    const galleryImages: GalleryImageResponse[] = images.map((img) => ({
      id: img.id,
      originalFilename: img.originalFilename,
      mimeType: img.mimeType,
      size: img.size,
      messageCount: messageCounts.get(img.id) ?? 0,
      createdAt: img.createdAt.toISOString(),
    }));

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

    // Invalidate all cache entries before DB delete — if DB delete fails,
    // cache miss safely re-reads from DB (still present)
    try {
      await this.cacheManager.del(CACHE_KEYS.image(imageId));
    } catch (err) {
      this.logger.warn(
        `Cache invalidation failed for image:${imageId}: ${err instanceof Error ? err.message : 'Unknown'}`,
      );
    }
    await this.historyService.invalidateCache(imageId);

    // CASCADE on FK handles message deletion
    await this.imageRepository.remove(image);
  }

  async getImageForServing(
    imageId: string,
  ): Promise<{ stream: fs.ReadStream; image: ImageEntity }> {
    const cacheKey = CACHE_KEYS.image(imageId);
    let image: ImageEntity | null = null;

    // Try cache first
    try {
      const cached = await this.cacheManager.get<ImageEntity>(cacheKey);
      if (cached) {
        this.logger.debug(`Cache HIT for ${cacheKey}`);
        image = cached;
      }
    } catch (err) {
      this.logger.warn(`Cache get failed for ${cacheKey}: ${err instanceof Error ? err.message : 'Unknown'}`);
    }

    // Cache miss — query DB
    if (!image) {
      this.logger.debug(`Cache MISS for ${cacheKey}`);
      image = await this.imageRepository.findOneBy({ id: imageId });
      if (!image) {
        throw new NotFoundException({
          statusCode: 404,
          message: 'Image not found',
          code: 'IMAGE_NOT_FOUND',
        });
      }

      try {
        await this.cacheManager.set(cacheKey, image, IMAGE_CACHE_TTL);
      } catch (err) {
        this.logger.warn(`Cache set failed for ${cacheKey}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
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
