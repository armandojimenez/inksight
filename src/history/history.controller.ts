import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HistoryService } from './history.service';
import { ImageEntity } from '@/upload/entities/image.entity';
import { UuidValidationPipe } from '@/common/pipes/uuid-validation.pipe';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { HistoryResponse } from './dto/history-response.dto';
import { ErrorResponseSchema } from '@/common/swagger/error-response.schema';

@ApiTags('History')
@Controller('chat')
export class HistoryController {
  constructor(
    private readonly historyService: HistoryService,
    @InjectRepository(ImageEntity)
    private readonly imageRepository: Repository<ImageEntity>,
  ) {}

  @Get(':imageId/history')
  @ApiOperation({
    summary: 'Get conversation history',
    description:
      'Returns paginated conversation history for an image, ordered by message creation time (ascending). ' +
      'Each message includes its role (user or assistant), content, and timestamp. ' +
      'The image must exist — returns 404 otherwise.',
  })
  @ApiParam({
    name: 'imageId',
    description: 'Image UUID (v4 format)',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated conversation history',
    type: HistoryResponse,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid UUID format (`INVALID_UUID`)',
    type: ErrorResponseSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Image not found (`IMAGE_NOT_FOUND`)',
    type: ErrorResponseSchema,
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded — default rate limit (`RATE_LIMIT_EXCEEDED`)',
    type: ErrorResponseSchema,
  })
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
