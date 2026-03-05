import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ImageEntity } from '@/upload/entities/image.entity';
import { ChatMessageEntity } from '@/history/entities/chat-message.entity';
import { HistoryService } from '@/history/history.service';

const DEFAULT_IMAGE_TTL_MS = 86_400_000; // 24h
const DEFAULT_TEMP_TTL_MS = 3_600_000; // 1h
const BATCH_SIZE = 100;

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);
  private isRunning = false;

  constructor(
    @InjectRepository(ImageEntity)
    private readonly imageRepository: Repository<ImageEntity>,
    @InjectRepository(ChatMessageEntity)
    private readonly messageRepository: Repository<ChatMessageEntity>,
    private readonly historyService: HistoryService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCleanup(): Promise<void> {
    const enabled = this.configService.get<boolean>('CLEANUP_ENABLED', true);
    if (!enabled) {
      this.logger.debug('Cleanup disabled via CLEANUP_ENABLED=false');
      return;
    }

    if (this.isRunning) {
      this.logger.warn('Cleanup already running — skipping this cycle');
      return;
    }

    this.isRunning = true;
    try {
      await this.cleanupExpiredImages();
      await this.cleanupOrphanedTempFiles();
    } catch (err) {
      this.logger.error(
        `Cleanup cycle failed: ${err instanceof Error ? err.message : 'Unknown'}`,
      );
    } finally {
      this.isRunning = false;
    }
  }

  async cleanupExpiredImages(): Promise<number> {
    const ttl = this.configService.get<number>(
      'CLEANUP_IMAGE_TTL_MS',
      DEFAULT_IMAGE_TTL_MS,
    );
    const cutoff = new Date(Date.now() - ttl);

    // Find images older than TTL that have no recent chat activity
    const expiredImages = await this.imageRepository.find({
      where: { createdAt: LessThan(cutoff) },
      take: BATCH_SIZE,
      order: { createdAt: 'ASC' },
    });

    if (expiredImages.length === 0) return 0;

    // Check for recent activity — single batch query (no N+1)
    const imageIds = expiredImages.map((img) => img.id);
    const recentMessages = await this.messageRepository
      .createQueryBuilder('msg')
      .select('DISTINCT msg.imageId', 'imageId')
      .where('msg.imageId IN (:...imageIds)', { imageIds })
      .andWhere('msg.createdAt > :cutoff', { cutoff })
      .getRawMany<{ imageId: string }>();

    const activeImageIds = new Set(recentMessages.map((r) => r.imageId));
    const toDelete = expiredImages.filter((img) => !activeImageIds.has(img.id));

    let deletedCount = 0;
    for (const image of toDelete) {
      try {
        // DB-first deletion order (safer: if file delete fails, DB record is already gone)
        await this.historyService.invalidateCache(image.id);
        await this.imageRepository.remove(image);

        // Delete file from disk — tolerate ENOENT
        try {
          await fs.unlink(image.uploadPath);
        } catch (err) {
          const errno = err as NodeJS.ErrnoException;
          if (errno.code !== 'ENOENT') throw err;
        }

        deletedCount++;
      } catch (err) {
        this.logger.error(
          `Failed to delete image ${image.id}: ${err instanceof Error ? err.message : 'Unknown'}`,
        );
      }
    }

    if (deletedCount > 0) {
      this.logger.log(`Cleaned up ${deletedCount} expired image(s)`);
    }

    return deletedCount;
  }

  async cleanupOrphanedTempFiles(): Promise<number> {
    const uploadDir = path.resolve(
      this.configService.get<string>('UPLOAD_DIR', 'uploads'),
    );
    const ttl = this.configService.get<number>(
      'CLEANUP_TEMP_TTL_MS',
      DEFAULT_TEMP_TTL_MS,
    );
    const cutoff = Date.now() - ttl;

    let entries: string[];
    try {
      entries = await fs.readdir(uploadDir);
    } catch (err) {
      const errno = err as NodeJS.ErrnoException;
      if (errno.code === 'ENOENT') return 0;
      throw err;
    }

    const tempFiles = entries.filter((f) => f.startsWith('.tmp-'));
    let deletedCount = 0;

    for (const file of tempFiles) {
      const filePath = path.join(uploadDir, file);
      try {
        const stat = await fs.stat(filePath);
        if (stat.mtimeMs < cutoff) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      } catch (err) {
        const errno = err as NodeJS.ErrnoException;
        if (errno.code !== 'ENOENT') {
          this.logger.warn(`Failed to clean temp file ${file}: ${errno.message}`);
        }
      }
    }

    if (deletedCount > 0) {
      this.logger.log(`Cleaned up ${deletedCount} orphaned temp file(s)`);
    }

    return deletedCount;
  }
}
