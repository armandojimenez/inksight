import {
  Controller,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto/chat-request.dto';
import { UuidValidationPipe } from '@/common/pipes/uuid-validation.pipe';
import { OpenAiChatCompletion } from '@/ai/interfaces/openai-chat-completion.interface';
import { OpenAiChatCompletionSchema } from '@/common/swagger/openai-response.schema';
import { ErrorResponseSchema } from '@/common/swagger/error-response.schema';

@ApiTags('Chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post(':imageId')
  @ApiOperation({
    summary: 'Send a chat message (non-streaming)',
    description:
      'Send a message about an uploaded image and receive a complete AI response. ' +
      'The conversation history is automatically included as context. ' +
      'Both the user message and assistant response are persisted to the conversation history. ' +
      'Rate limited to 30 requests per minute. Returns an OpenAI-compatible Chat Completion object.',
  })
  @ApiParam({
    name: 'imageId',
    description: 'Image UUID (v4 format)',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({ type: ChatRequestDto })
  @ApiResponse({
    status: 200,
    description: 'AI response in OpenAI Chat Completion format',
    type: OpenAiChatCompletionSchema,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid UUID (`INVALID_UUID`) or invalid message (`INVALID_MESSAGE`, `VALIDATION_ERROR`)',
    type: ErrorResponseSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Image not found (`IMAGE_NOT_FOUND`)',
    type: ErrorResponseSchema,
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded — max 30 requests per minute (`RATE_LIMIT_EXCEEDED`)',
    type: ErrorResponseSchema,
  })
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async chat(
    @Param('imageId', UuidValidationPipe) imageId: string,
    @Body() dto: ChatRequestDto,
  ): Promise<OpenAiChatCompletion> {
    return this.chatService.chat(imageId, dto.message);
  }
}
