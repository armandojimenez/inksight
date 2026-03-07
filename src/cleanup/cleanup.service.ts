import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Cache } from 'cache-manager';
import { Repository, LessThan } from 'typeorm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ImageEntity } from '@/upload/entities/image.entity';
import { ChatMessageEntity } from '@/history/entities/chat-message.entity';
import { HistoryService } from '@/history/history.service';
import { CACHE_KEYS } from '@/cache/cache-keys';

const DEFAULT_IMAGE_TTL_MS = 86_400_000; // 24h
const DEFAULT_TEMP_TTL_MS = 3_600_000; // 1h
const BATCH_SIZE = 100;
const MAX_BATCH_ITERATIONS = 10;
const TEMP_BATCH_SIZE = 200;

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
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
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
      let totalDeleted = 0;
      for (let i = 0; i < MAX_BATCH_ITERATIONS; i++) {
        const deleted = await this.cleanupExpiredImages();
        totalDeleted += deleted;
        if (deleted < BATCH_SIZE) break; // no more full batches
      }
      if (totalDeleted > 0) {
        this.logger.log(`Image cleanup complete: ${totalDeleted} total`);
      }
      await this.cleanupOrphanedTempFiles();
      await this.cleanupOrphanedFiles();
    } catch (err) {
      this.logger.error(
        `Cleanup cycle failed: ${err instanceof Error ? err.message : 'Unknown'}`,
        err instanceof Error ? err.stack : undefined,
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
    const uploadDir = path.resolve(
      this.configService.get<string>('UPLOAD_DIR', 'uploads'),
    );

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
        await this.cacheManager.del(CACHE_KEYS.image(image.id));
        await this.imageRepository.remove(image);

        // Delete file from disk — tolerate ENOENT, validate path containment
        if (this.isPathContained(image.uploadPath, uploadDir)) {
          try {
            await fs.unlink(image.uploadPath);
          } catch (err) {
            const errno = err as NodeJS.ErrnoException;
            if (errno.code !== 'ENOENT') throw err;
          }
        } else {
          this.logger.error(
            `Path traversal blocked in cleanup: ${image.uploadPath}`,
          );
        }

        deletedCount++;
      } catch (err) {
        this.logger.error(
          `Failed to delete image ${image.id}: ${err instanceof Error ? err.message : 'Unknown'}`,
          err instanceof Error ? err.stack : undefined,
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

    const tempFiles = entries
      .filter((f) => f.startsWith('.tmp-'))
      .slice(0, TEMP_BATCH_SIZE);
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

  async cleanupOrphanedFiles(): Promise<number> {
    const uploadDir = path.resolve(
      this.configService.get<string>('UPLOAD_DIR', 'uploads'),
    );

    let entries: string[];
    try {
      entries = await fs.readdir(uploadDir);
    } catch (err) {
      const errno = err as NodeJS.ErrnoException;
      if (errno.code === 'ENOENT') return 0;
      throw err;
    }

    // Only consider non-temp, non-hidden files that look like stored uploads (uuid.ext)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.\w+$/i;
    const storedFiles = entries.filter((f) => uuidPattern.test(f));
    if (storedFiles.length === 0) return 0;

    // Batch-check which filenames have DB records
    const knownFilenames = new Set(
      (
        await this.imageRepository
          .createQueryBuilder('img')
          .select('img.storedFilename')
          .where('img.storedFilename IN (:...filenames)', {
            filenames: storedFiles,
          })
          .getMany()
      ).map((img) => img.storedFilename),
    );

    let deletedCount = 0;
    for (const file of storedFiles) {
      if (knownFilenames.has(file)) continue;

      const filePath = path.join(uploadDir, file);
      try {
        await fs.unlink(filePath);
        deletedCount++;
      } catch (err) {
        const errno = err as NodeJS.ErrnoException;
        if (errno.code !== 'ENOENT') {
          this.logger.warn(`Failed to clean orphaned file ${file}: ${errno.message}`);
        }
      }
    }

    if (deletedCount > 0) {
      this.logger.log(`Cleaned up ${deletedCount} orphaned file(s) with no DB record`);
    }

    return deletedCount;
  }

  private isPathContained(filePath: string, dir: string): boolean {
    const resolved = path.resolve(filePath);
    return resolved.startsWith(dir + path.sep) || resolved === dir;
  }
}
