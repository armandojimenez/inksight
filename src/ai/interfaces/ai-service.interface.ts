import { ConversationMessage } from './conversation-message.interface';
import { OpenAiChatCompletion } from './openai-chat-completion.interface';
import { OpenAiStreamChunk } from './openai-stream-chunk.interface';

export interface IAiService {
  analyzeImage(imagePath: string): Promise<OpenAiChatCompletion>;

  chat(
    prompt: string,
    imageId: string,
    history: ConversationMessage[],
  ): Promise<OpenAiChatCompletion>;

  chatStream(
    prompt: string,
    imageId: string,
    history: ConversationMessage[],
  ): AsyncGenerator<OpenAiStreamChunk>;
}
