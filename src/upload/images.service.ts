import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import { ImageEntity } from './entities/image.entity';
import { HistoryService } from '@/history/history.service';

export interface GalleryImage {
  id: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  messageCount: number;
  createdAt: string;
}

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);

  constructor(
    @InjectRepository(ImageEntity)
    private readonly imageRepository: Repository<ImageEntity>,
    private readonly historyService: HistoryService,
  ) {}

  async listImages(
    page = 1,
    limit = 20,
  ): Promise<{ images: GalleryImage[]; total: number }> {
    const [images, total] = await this.imageRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const galleryImages: GalleryImage[] = await Promise.all(
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

    // Remove file from disk — tolerate missing file
    try {
      await fsPromises.unlink(image.uploadPath);
    } catch (err) {
      this.logger.warn(
        `File not found on disk during delete: ${image.uploadPath}`,
      );
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
}
