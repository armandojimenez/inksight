import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImageEntity } from '@/upload/entities/image.entity';
import { IAiService } from '@/ai/interfaces/ai-service.interface';
import { AI_SERVICE_TOKEN } from '@/common/constants';
import { ConversationMessage } from '@/ai/interfaces/conversation-message.interface';
import { OpenAiChatCompletion } from '@/ai/interfaces/openai-chat-completion.interface';
import { OpenAiStreamChunk } from '@/ai/interfaces/openai-stream-chunk.interface';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ImageEntity)
    private readonly imageRepository: Repository<ImageEntity>,
    @Inject(AI_SERVICE_TOKEN)
    private readonly aiService: IAiService,
  ) {}

  private async findImage(imageId: string): Promise<ImageEntity> {
    const image = await this.imageRepository.findOneBy({ id: imageId });
    if (!image) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Image not found',
        code: 'IMAGE_NOT_FOUND',
      });
    }
    return image;
  }

  async chat(
    imageId: string,
    message: string,
    history: ConversationMessage[] = [],
  ): Promise<OpenAiChatCompletion> {
    await this.findImage(imageId);
    return this.aiService.chat(message, imageId, history);
  }

  async chatStream(
    imageId: string,
    message: string,
    signal?: AbortSignal,
  ): Promise<AsyncGenerator<OpenAiStreamChunk>> {
    await this.findImage(imageId);
    const history: ConversationMessage[] = []; // Phase 5: ST-6, ST-7
    return this.aiService.chatStream(message, imageId, history, signal);
  }
}
