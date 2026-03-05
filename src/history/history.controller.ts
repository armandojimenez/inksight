import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HistoryService } from './history.service';
import { ImageEntity } from '@/upload/entities/image.entity';
import { UuidValidationPipe } from '@/common/pipes/uuid-validation.pipe';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { HistoryResponse } from './dto/history-response.dto';

@Controller('chat')
export class HistoryController {
  constructor(
    private readonly historyService: HistoryService,
    @InjectRepository(ImageEntity)
    private readonly imageRepository: Repository<ImageEntity>,
  ) {}

  @Get(':imageId/history')
  async getHistory(
    @Param('imageId', UuidValidationPipe) imageId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<HistoryResponse> {
    const image = await this.imageRepository.findOneBy({ id: imageId });
    if (!image) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Image not found',
        code: 'IMAGE_NOT_FOUND',
      });
    }

    const { messages, total } = await this.historyService.getHistory(
      imageId,
      query.page,
      query.limit,
    );

    return {
      imageId,
      messages: messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : String(msg.createdAt),
      })),
      totalMessages: total,
      page: query.page,
      pageSize: query.limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
    };
  }
}
