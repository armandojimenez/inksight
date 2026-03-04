import {
  Controller,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto/chat-request.dto';
import { UuidValidationPipe } from '@/common/pipes/uuid-validation.pipe';
import { OpenAiChatCompletion } from '@/ai/interfaces/openai-chat-completion.interface';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post(':imageId')
  @HttpCode(HttpStatus.OK)
  async chat(
    @Param('imageId', UuidValidationPipe) imageId: string,
    @Body() dto: ChatRequestDto,
  ): Promise<OpenAiChatCompletion> {
    return this.chatService.chat(imageId, dto.message);
  }
}
