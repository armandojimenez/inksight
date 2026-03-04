import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Repository } from 'typeorm';
import { ChatMessageEntity } from './entities/chat-message.entity';
import { ConversationMessage } from '@/ai/interfaces/conversation-message.interface';
import { CACHE_KEYS } from '@/cache/cache-keys';
import { withRetry } from '@/common/utils/retry';

const DEFAULT_HISTORY_CAP = 50;
const DEFAULT_PAGE_SIZE = 20;
const VALID_ROLES = new Set(['user', 'assistant']);

export type MessageRole = 'user' | 'assistant';

@Injectable()
export class HistoryService {
  private readonly logger = new Logger(HistoryService.name);

  constructor(
    @InjectRepository(ChatMessageEntity)
    private readonly messageRepository: Repository<ChatMessageEntity>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async addMessage(
    imageId: string,
    role: MessageRole,
    content: string,
    tokenCount: number | null = null,
  ): Promise<ChatMessageEntity> {
    if (!VALID_ROLES.has(role)) {
      throw new Error(`Invalid message role: ${role}. Must be 'user' or 'assistant'.`);
    }

    const entity = this.messageRepository.create({
      imageId,
      role,
      content,
      tokenCount,
    });
    const saved = await withRetry(() => this.messageRepository.save(entity), {
      attempts: 2,
      delayMs: 200,
    });

    await this.invalidateCache(imageId);

    return saved;
  }

  async getHistory(
    imageId: string,
    page = 1,
    limit = DEFAULT_PAGE_SIZE,
  ): Promise<{ messages: ChatMessageEntity[]; total: number }> {
    const useCache = page === 1 && limit === DEFAULT_PAGE_SIZE;
    const cacheKey = CACHE_KEYS.history(imageId);

    if (useCache) {
      try {
        const cached = await this.cacheManager.get<{ messages: ChatMessageEntity[]; total: number }>(cacheKey);
        if (cached) {
          this.logger.debug(`Cache HIT for ${cacheKey}`);
          return cached;
        }
      } catch (err) {
        this.logger.warn(`Cache get failed for ${cacheKey}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
      this.logger.debug(`Cache MISS for ${cacheKey}`);
    }

    const [messages, total] = await this.messageRepository.findAndCount({
      where: { imageId },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const result = { messages, total };

    if (useCache) {
      try {
        await this.cacheManager.set(cacheKey, result);
      } catch (err) {
        this.logger.warn(`Cache set failed for ${cacheKey}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }

    return result;
  }

  async getRecentMessages(
    imageId: string,
    maxMessages = DEFAULT_HISTORY_CAP,
  ): Promise<ConversationMessage[]> {
    const useCache = maxMessages === DEFAULT_HISTORY_CAP;
    const cacheKey = CACHE_KEYS.recent(imageId);

    if (useCache) {
      try {
        const cached = await this.cacheManager.get<ConversationMessage[]>(cacheKey);
        if (cached) {
          this.logger.debug(`Cache HIT for ${cacheKey}`);
          return cached;
        }
      } catch (err) {
        this.logger.warn(`Cache get failed for ${cacheKey}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
      this.logger.debug(`Cache MISS for ${cacheKey}`);
    }

    const messages = await this.messageRepository.find({
      where: { imageId },
      order: { createdAt: 'DESC' },
      take: maxMessages,
    });
    const result = messages.reverse().map((msg) => ({
      role: msg.role as ConversationMessage['role'],
      content: msg.content,
    }));

    if (useCache) {
      try {
        await this.cacheManager.set(cacheKey, result);
      } catch (err) {
        this.logger.warn(`Cache set failed for ${cacheKey}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }

    return result;
  }

  async getMessageCount(imageId: string): Promise<number> {
    return this.messageRepository.count({ where: { imageId } });
  }

  async getMessageCountBatch(
    imageIds: string[],
  ): Promise<Map<string, number>> {
    if (imageIds.length === 0) return new Map();

    const results: Array<{ imageId: string; count: string }> =
      await this.messageRepository
        .createQueryBuilder('msg')
        .select('msg.imageId', 'imageId')
        .addSelect('COUNT(*)', 'count')
        .where('msg.imageId IN (:...imageIds)', { imageIds })
        .groupBy('msg.imageId')
        .getRawMany();

    const counts = new Map<string, number>();
    for (const id of imageIds) {
      counts.set(id, 0);
    }
    for (const row of results) {
      counts.set(row.imageId, parseInt(row.count, 10));
    }
    return counts;
  }

  async deleteByImageId(imageId: string): Promise<void> {
    await this.messageRepository.delete({ imageId });
    await this.invalidateCache(imageId);
  }

  async enforceHistoryCap(imageId: string): Promise<void> {
    const count = await this.messageRepository.count({ where: { imageId } });
    if (count <= DEFAULT_HISTORY_CAP) return;

    await this.messageRepository
      .createQueryBuilder()
      .delete()
      .where(
        `id IN (
          SELECT id FROM chat_messages
          WHERE "imageId" = :imageId
          ORDER BY "createdAt" ASC
          LIMIT :excess
        )`,
        { imageId, excess: count - DEFAULT_HISTORY_CAP },
      )
      .execute();

    await this.invalidateCache(imageId);
  }

  async invalidateCache(imageId: string): Promise<void> {
    try {
      await Promise.all([
        this.cacheManager.del(CACHE_KEYS.history(imageId)),
        this.cacheManager.del(CACHE_KEYS.recent(imageId)),
      ]);
      this.logger.debug(`Cache INVALIDATED for imageId: ${imageId}`);
    } catch (err) {
      this.logger.warn(
        `Cache invalidation failed for ${imageId}: ${err instanceof Error ? err.message : 'Unknown'}`,
      );
    }
  }
}
