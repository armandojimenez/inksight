import * as crypto from 'crypto';
import { Injectable } from '@nestjs/common';
import { IAiService } from './interfaces/ai-service.interface';
import { ConversationMessage } from './interfaces/conversation-message.interface';
import { OpenAiChatCompletion } from './interfaces/openai-chat-completion.interface';
import { OpenAiStreamChunk } from './interfaces/openai-stream-chunk.interface';

const MODEL = 'gpt-5.2';

const CHARSET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const IMAGE_ANALYSIS_RESPONSES: readonly string[] = [
  'I can see a vibrant outdoor scene with natural lighting. The composition draws the eye toward the center, where the main subject is clearly visible. The colors are warm and inviting, suggesting this was taken during golden hour.',
  'This image shows an indoor setting with carefully arranged elements. The lighting appears to be artificial but well-balanced. There are several objects of interest that create a layered composition with good depth.',
  'The photograph captures a close-up view with excellent detail and sharp focus. The background is softly blurred, creating a pleasant bokeh effect that isolates the subject effectively.',
  'I observe a landscape with expansive views stretching to the horizon. The sky takes up roughly a third of the frame, with interesting cloud formations adding texture. The foreground includes natural elements that ground the composition.',
  'This appears to be a portrait-style image with the subject positioned according to the rule of thirds. The expression and pose convey a sense of authenticity. The background complements without distracting.',
];

const DEFAULT_CHAT_RESPONSES: readonly string[] = [
  'Based on what I can see in the image, there are several interesting elements worth discussing. The overall composition suggests careful attention to framing and subject placement.',
  "That's a great question about this image. From my analysis, the key features include the lighting conditions, color palette, and spatial arrangement of the visual elements.",
  "Looking at this more carefully, I notice subtle details that add depth to the image. The interplay between light and shadow creates a dynamic visual experience that's quite engaging.",
];

const FOLLOWUP_CHAT_RESPONSES: readonly string[] = [
  "Building on our previous discussion, I can add that the technical aspects of this image — such as the exposure and white balance — are well-executed. This contributes to the overall professional quality we've been analyzing.",
  "That's an excellent follow-up point. When we consider the context of our earlier observations, it becomes clear that the image tells a cohesive visual story. Each element we've discussed contributes to this narrative.",
  "Continuing from what we covered, I'd highlight that the relationship between the foreground and background elements creates a sense of depth that reinforces the themes we've identified in our conversation.",
];

function generateId(): string {
  let id = 'chatcmpl-';
  for (let i = 0; i < 29; i++) {
    id += CHARSET[crypto.randomInt(CHARSET.length)]!;
  }
  return id;
}

function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}

function hashSelect<T>(input: string, array: readonly T[]): T {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = Math.imul(hash, 33) ^ input.charCodeAt(i);
  }
  return array[((hash >>> 0) % array.length)]!;
}

function buildCompletion(
  content: string,
  promptTokens: number,
): OpenAiChatCompletion {
  const completionTokens = estimateTokens(content);
  return {
    id: generateId(),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: MODEL,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The operation was aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException('The operation was aborted', 'AbortError'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function buildStreamChunk(
  id: string,
  created: number,
  delta: { role?: 'assistant'; content?: string },
  finishReason: 'stop' | null,
): OpenAiStreamChunk {
  return {
    id,
    object: 'chat.completion.chunk',
    created,
    model: MODEL,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

@Injectable()
export class MockAiService implements IAiService {
  async analyzeImage(imagePath: string): Promise<OpenAiChatCompletion> {
    const content = hashSelect(imagePath, IMAGE_ANALYSIS_RESPONSES);
    const promptTokens = estimateTokens(imagePath) + 255; // image token estimate
    return buildCompletion(content, promptTokens);
  }

  async chat(
    prompt: string,
    _imageId: string,
    history: ConversationMessage[],
  ): Promise<OpenAiChatCompletion> {
    const responses =
      history.length > 2 ? FOLLOWUP_CHAT_RESPONSES : DEFAULT_CHAT_RESPONSES;
    const content = hashSelect(prompt, responses);
    const promptTokens =
      estimateTokens(prompt) +
      history.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
    return buildCompletion(content, promptTokens);
  }

  async *chatStream(
    prompt: string,
    _imageId: string,
    history: ConversationMessage[],
    signal?: AbortSignal,
  ): AsyncGenerator<OpenAiStreamChunk> {
    const responses =
      history.length > 2 ? FOLLOWUP_CHAT_RESPONSES : DEFAULT_CHAT_RESPONSES;
    const fullResponse = hashSelect(prompt, responses);
    const id = generateId();
    const created = Math.floor(Date.now() / 1000);

    const MAX_CHUNK_DELAY = 1000;
    const rawDelay = parseInt(process.env.STREAM_CHUNK_DELAY_MS ?? '0', 10);
    const delayMs = Number.isFinite(rawDelay) ? Math.min(Math.max(rawDelay, 0), MAX_CHUNK_DELAY) : 0;

    try {
      if (signal?.aborted) return;

      // First chunk: role announcement
      yield buildStreamChunk(id, created, { role: 'assistant', content: '' }, null);

      // Content chunks: word-by-word to simulate real token streaming
      const words = fullResponse.split(' ');
      for (let i = 0; i < words.length; i++) {
        if (signal?.aborted) return;
        if (delayMs > 0) await delay(delayMs, signal);
        const word = i < words.length - 1 ? words[i]! + ' ' : words[i]!;
        yield buildStreamChunk(id, created, { content: word }, null);
      }

      // Final chunk: stop signal
      yield buildStreamChunk(id, created, {}, 'stop');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      throw err;
    }
  }
}
