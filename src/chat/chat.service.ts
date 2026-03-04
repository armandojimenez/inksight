import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImageEntity } from '@/upload/entities/image.entity';
import { IAiService } from '@/ai/interfaces/ai-service.interface';
import { AI_SERVICE_TOKEN } from '@/common/constants';
import { OpenAiChatCompletion } from '@/ai/interfaces/openai-chat-completion.interface';
import { OpenAiStreamChunk } from '@/ai/interfaces/openai-stream-chunk.interface';
import { HistoryService } from '@/history/history.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(ImageEntity)
    private readonly imageRepository: Repository<ImageEntity>,
    @Inject(AI_SERVICE_TOKEN)
    private readonly aiService: IAiService,
    private readonly historyService: HistoryService,
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
  ): Promise<OpenAiChatCompletion> {
    await this.findImage(imageId);

    await this.historyService.addMessage(imageId, 'user', message);
    const history = await this.historyService.getRecentMessages(imageId);

    const completion = await this.aiService.chat(message, imageId, history);

    const assistantContent = completion.choices[0]?.message.content ?? '';
    const tokenCount = completion.usage?.completion_tokens ?? null;
    await this.historyService.addMessage(
      imageId,
      'assistant',
      assistantContent,
      tokenCount,
    );

    return completion;
  }

  async chatStream(
    imageId: string,
    message: string,
    signal?: AbortSignal,
  ): Promise<AsyncGenerator<OpenAiStreamChunk>> {
    await this.findImage(imageId);

    await this.historyService.addMessage(imageId, 'user', message);
    const history = await this.historyService.getRecentMessages(imageId);

    const generator = this.aiService.chatStream(
      message,
      imageId,
      history,
      signal,
    );

    return this.wrapStreamWithPersistence(generator, imageId);
  }

  private async *wrapStreamWithPersistence(
    generator: AsyncGenerator<OpenAiStreamChunk>,
    imageId: string,
  ): AsyncGenerator<OpenAiStreamChunk> {
    const contentParts: string[] = [];
    try {
      for await (const chunk of generator) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          contentParts.push(delta.content);
        }
        yield chunk;
      }
    } finally {
      const fullContent = contentParts.join('');
      if (fullContent.length > 0) {
        try {
          await this.historyService.addMessage(
            imageId,
            'assistant',
            fullContent,
          );
        } catch (err) {
          this.logger.error(
            `Failed to persist streamed assistant message for image ${imageId}: ${err instanceof Error ? err.message : 'Unknown error'}`,
          );
        }
      }
    }
  }
}
