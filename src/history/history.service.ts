import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessageEntity } from './entities/chat-message.entity';
import { ConversationMessage } from '@/ai/interfaces/conversation-message.interface';
import { withRetry } from '@/common/utils/retry';

const DEFAULT_HISTORY_CAP = 50;
const VALID_ROLES = new Set(['user', 'assistant']);

export type MessageRole = 'user' | 'assistant';

@Injectable()
export class HistoryService {
  private readonly logger = new Logger(HistoryService.name);

  constructor(
    @InjectRepository(ChatMessageEntity)
    private readonly messageRepository: Repository<ChatMessageEntity>,
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
    return withRetry(() => this.messageRepository.save(entity), {
      attempts: 2,
      delayMs: 200,
    });
  }

  async getHistory(
    imageId: string,
    page = 1,
    limit = 20,
  ): Promise<{ messages: ChatMessageEntity[]; total: number }> {
    const [messages, total] = await this.messageRepository.findAndCount({
      where: { imageId },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { messages, total };
  }

  async getRecentMessages(
    imageId: string,
    maxMessages = DEFAULT_HISTORY_CAP,
  ): Promise<ConversationMessage[]> {
    const messages = await this.messageRepository.find({
      where: { imageId },
      order: { createdAt: 'DESC' },
      take: maxMessages,
    });
    return messages.reverse().map((msg) => ({
      role: msg.role as ConversationMessage['role'],
      content: msg.content,
    }));
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
  }
}
