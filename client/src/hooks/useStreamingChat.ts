import { useCallback, useEffect, useRef, useState } from 'react';
import { streamMessage, parseSSEStream, getMessages } from '@/lib/api';
import type { MessageData } from '@/types';

export interface UseStreamingChatReturn {
  messages: MessageData[];
  sendMessage: (message: string) => void;
  isStreaming: boolean;
  error: string | null;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];

function generateId(): string {
  return `local-${crypto.randomUUID()}`;
}

export function useStreamingChat(imageId: string): UseStreamingChatReturn {
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);

  const setStreamingState = useCallback((value: boolean) => {
    setIsStreaming(value);
    isStreamingRef.current = value;
  }, []);

  // Abort on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Load history and reset when imageId changes
  useEffect(() => {
    setMessages([]);
    setError(null);
    setStreamingState(false);
    abortRef.current?.abort();

    const controller = new AbortController();
    getMessages(imageId, { limit: 50 }, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted && res.messages.length > 0) {
          setMessages([...res.messages]);
        }
      })
      .catch(() => {
        // Silently ignore — empty state is fine as fallback
      });
    return () => controller.abort();
  }, [imageId, setStreamingState]);

  const sendMessage = useCallback(
    (message: string) => {
      const trimmed = message.trim();
      if (!trimmed || isStreamingRef.current) return;

      setError(null);
      setStreamingState(true);

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

          // Idempotent placeholder — only add if not already present (prevents duplicates on retry)
          setMessages((prev) => {
            if (prev.some((m) => m.id === assistantId)) return prev;
            return [...prev, { id: assistantId, role: 'assistant' as const, content: '', timestamp: new Date().toISOString() }];
          });

          for await (const chunk of parseSSEStream(response)) {
            if (controller.signal.aborted) return;
            const content = chunk.choices[0]?.delta?.content ?? '';
            accumulated += content;
            // Optimize: target last element instead of scanning entire array
            setMessages((prev) => {
              const lastIdx = prev.length - 1;
              const last = prev[lastIdx];
              if (last && last.id === assistantId) {
                const updated = [...prev];
                updated[lastIdx] = { ...last, content: accumulated };
                return updated;
              }
              return prev.map((m) =>
                m.id === assistantId ? { ...m, content: accumulated } : m,
              );
            });
          }

          setStreamingState(false);
        } catch (err) {
          if (controller.signal.aborted) return;

          if (attempt < MAX_RETRIES) {
            const delay = RETRY_DELAYS[attempt];
            await new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, delay);
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
            setStreamingState(false);
          }
        }
      };

      attemptStream(0);
    },
    [imageId, setStreamingState],
  );

  return { messages, sendMessage, isStreaming, error };
}
