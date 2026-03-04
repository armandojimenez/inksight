import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessageEntity } from './entities/chat-message.entity';
import { ConversationMessage } from '@/ai/interfaces/conversation-message.interface';

const DEFAULT_HISTORY_CAP = 50;

@Injectable()
export class HistoryService {
  constructor(
    @InjectRepository(ChatMessageEntity)
    private readonly messageRepository: Repository<ChatMessageEntity>,
  ) {}

  async addMessage(
    imageId: string,
    role: string,
    content: string,
    tokenCount: number | null = null,
  ): Promise<ChatMessageEntity> {
    const entity = this.messageRepository.create({
      imageId,
      role,
      content,
      tokenCount,
    });
    const saved = await this.messageRepository.save(entity);
    await this.enforceHistoryCap(imageId);
    return saved;
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

  async deleteByImageId(imageId: string): Promise<void> {
    await this.messageRepository.delete({ imageId });
  }

  private async enforceHistoryCap(imageId: string): Promise<void> {
    const count = await this.messageRepository.count({ where: { imageId } });
    if (count <= DEFAULT_HISTORY_CAP) return;

    const excess = count - DEFAULT_HISTORY_CAP;
    const oldestMessages = await this.messageRepository.find({
      where: { imageId },
      order: { createdAt: 'ASC' },
      take: excess,
    });
    await this.messageRepository.remove(oldestMessages);
  }
}
