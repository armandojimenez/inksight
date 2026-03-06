import { useCallback, useEffect, useRef, useState } from 'react';
import { streamMessage, parseSSEStream, getMessages } from '@/lib/api';
import type { MessageData } from '@/types';

const MESSAGE_CAP = 50;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];

export interface UseStreamingChatReturn {
  messages: MessageData[];
  sendMessage: (message: string) => void;
  isStreaming: boolean;
  error: string | null;
  isLoadingHistory: boolean;
  historyError: string | null;
  retryAttempt: number;
  clearError: () => void;
  retryLastMessage: () => void;
  messageCapReached: boolean;
}

function generateId(): string {
  return `local-${crypto.randomUUID()}`;
}

export function useStreamingChat(
  imageId: string,
  initialAnalysis?: string,
): UseStreamingChatReturn {
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [totalMessages, setTotalMessages] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);
  const lastUserMessageRef = useRef<string | null>(null);
  const initialAnalysisRef = useRef(initialAnalysis);
  initialAnalysisRef.current = initialAnalysis;

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
    const analysis = initialAnalysisRef.current;

    setError(null);
    setHistoryError(null);
    setStreamingState(false);
    setRetryAttempt(0);
    abortRef.current?.abort();

    // If we have an initial analysis (just uploaded), show it immediately
    if (analysis) {
      setMessages([{
        id: `analysis-${imageId}`,
        role: 'assistant' as const,
        content: analysis,
        timestamp: new Date().toISOString(),
      }]);
      setIsLoadingHistory(false);
    } else {
      setMessages([]);
      setIsLoadingHistory(true);
    }

    const controller = new AbortController();
    getMessages(imageId, { limit: MESSAGE_CAP }, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          if (res.messages.length > 0) {
            setMessages([...res.messages]);
          }
          setTotalMessages(res.totalMessages);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setHistoryError(
            err instanceof Error ? err.message : 'Failed to load messages',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingHistory(false);
        }
      });
    return () => controller.abort();
  }, [imageId, setStreamingState]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Extracted stream logic — used by both sendMessage and retryLastMessage
  const startStream = useCallback(
    (content: string) => {
      setError(null);
      setStreamingState(true);
      setRetryAttempt(0);

      const assistantId = generateId();

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const attemptStream = async (attempt: number): Promise<void> => {
        if (controller.signal.aborted) return;

        try {
          const response = await streamMessage(imageId, content, controller.signal);
          let accumulated = '';

          // Idempotent placeholder — only add if not already present
          setMessages((prev) => {
            if (prev.some((m) => m.id === assistantId)) return prev;
            return [...prev, { id: assistantId, role: 'assistant' as const, content: '', timestamp: new Date().toISOString() }];
          });

          for await (const chunk of parseSSEStream(response)) {
            if (controller.signal.aborted) return;
            const chunkContent = chunk.choices[0]?.delta?.content ?? '';
            accumulated += chunkContent;
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
          setRetryAttempt(0);
        } catch (err) {
          if (controller.signal.aborted) return;

          if (attempt < MAX_RETRIES) {
            setRetryAttempt(attempt + 1);
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
            setRetryAttempt(0);
          }
        }
      };

      attemptStream(0).catch(() => {
        // Guard against unhandled rejection from state setter errors
      });
    },
    [imageId, setStreamingState],
  );

  const sendMessage = useCallback(
    (message: string) => {
      const trimmed = message.trim();
      if (!trimmed || isStreamingRef.current) return;

      lastUserMessageRef.current = trimmed;

      const userMsg: MessageData = {
        id: generateId(),
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      startStream(trimmed);
    },
    [startStream],
  );

  const retryLastMessage = useCallback(() => {
    const lastMsg = lastUserMessageRef.current;
    if (!lastMsg || isStreamingRef.current) return;

    // Remove the failed empty assistant placeholder if present
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant' && last.content === '') {
        return prev.slice(0, -1);
      }
      return prev;
    });

    startStream(lastMsg);
  }, [startStream]);

  const messageCapReached = totalMessages >= MESSAGE_CAP || messages.length >= MESSAGE_CAP;

  return {
    messages,
    sendMessage,
    isStreaming,
    error,
    isLoadingHistory,
    historyError,
    retryAttempt,
    clearError,
    retryLastMessage,
    messageCapReached,
  };
}
