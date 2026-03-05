import { useCallback, useEffect, useRef, useState } from 'react';
import { streamMessage, parseSSEStream } from '@/lib/api';
import type { MessageData } from '@/types';

export interface UseStreamingChatReturn {
  messages: MessageData[];
  sendMessage: (message: string) => void;
  isStreaming: boolean;
  error: string | null;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];

let messageCounter = 0;
function generateId(): string {
  messageCounter += 1;
  return `local-${Date.now()}-${messageCounter}`;
}

export function useStreamingChat(imageId: string): UseStreamingChatReturn {
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);

  // Abort on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Reset when imageId changes
  useEffect(() => {
    setMessages([]);
    setError(null);
    setIsStreaming(false);
    isStreamingRef.current = false;
    abortRef.current?.abort();
  }, [imageId]);

  const sendMessage = useCallback(
    (message: string) => {
      const trimmed = message.trim();
      if (!trimmed || isStreamingRef.current) return;

      setError(null);
      setIsStreaming(true);
      isStreamingRef.current = true;

      const userMsg: MessageData = {
        id: generateId(),
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);

      const assistantId = generateId();

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const attemptStream = async (attempt: number): Promise<void> => {
        if (controller.signal.aborted) return;

        try {
          const response = await streamMessage(imageId, trimmed, controller.signal);
          let accumulated = '';

          // Add placeholder assistant message
          setMessages((prev) => [
            ...prev,
            { id: assistantId, role: 'assistant', content: '', timestamp: new Date().toISOString() },
          ]);

          for await (const chunk of parseSSEStream(response)) {
            if (controller.signal.aborted) return;
            const content = chunk.choices[0]?.delta?.content ?? '';
            accumulated += content;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: accumulated } : m,
              ),
            );
          }

          setIsStreaming(false);
          isStreamingRef.current = false;
        } catch (err) {
          if (controller.signal.aborted) return;

          if (attempt < MAX_RETRIES) {
            const delay = RETRY_DELAYS[attempt];
            await new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, delay);
              // Clean up timer if aborted
              controller.signal.addEventListener('abort', () => {
                clearTimeout(timer);
                resolve();
              });
            });
            if (!controller.signal.aborted) {
              return attemptStream(attempt + 1);
            }
          } else {
            const message = err instanceof Error ? err.message : 'Stream failed';
            setError(message);
            setIsStreaming(false);
            isStreamingRef.current = false;
          }
        }
      };

      attemptStream(0);
    },
    [imageId],
  );

  return { messages, sendMessage, isStreaming, error };
}
