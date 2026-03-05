import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { MessageData } from '@/types';

export interface MessageBubbleProps {
  message: MessageData;
  isStreaming?: boolean;
}

export function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return '';
  const diffSeconds = Math.max(0, Math.floor((now - then) / 1000));

  if (diffSeconds < 60) return 'just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function useRelativeTime(timestamp: string): string {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  return formatRelativeTime(timestamp);
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const relativeTime = useRelativeTime(message.timestamp);

  return (
    <div
      className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
    >
      <article
        aria-label={isUser ? 'Your message' : 'Assistant response'}
        data-role={message.role}
        className={cn(
          'relative px-4 py-3',
          isUser
            ? 'max-w-[75%] rounded-[8px_8px_2px_8px] bg-primary-500 text-white'
            : 'max-w-[85%] rounded-[8px_8px_8px_2px] border border-ai-100 bg-ai-50 text-neutral-600',
        )}
      >
        {!isUser && (
          <span
            data-ai-indicator
            aria-hidden="true"
            className="absolute -left-3 top-3 h-2 w-2 rounded-full bg-ai-500"
          />
        )}
        <p
          className="break-words whitespace-pre-wrap text-base leading-relaxed"
          aria-live={!isUser && isStreaming ? 'polite' : undefined}
        >
          {message.content}
        </p>
        <time
          dateTime={message.timestamp}
          className={cn(
            'mt-1 block text-xs',
            isUser ? 'text-white/70' : 'text-neutral-400',
          )}
        >
          {relativeTime}
        </time>
      </article>
    </div>
  );
}
