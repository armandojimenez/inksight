import type { MessageData } from '@/types';

export interface UseStreamingChatReturn {
  messages: MessageData[];
  sendMessage: (message: string) => void;
  isStreaming: boolean;
  error: string | null;
}

export function useStreamingChat(_imageId: string): UseStreamingChatReturn {
  return {
    messages: [],
    sendMessage: () => {},
    isStreaming: false,
    error: null,
  };
}
