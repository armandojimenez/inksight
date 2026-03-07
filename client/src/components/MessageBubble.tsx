import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { MESSAGE_COLLAPSE_THRESHOLD } from '@/lib/constants';
import type { MessageData } from '@/types';

export interface MessageBubbleProps {
  message: MessageData;
  index?: number;
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
    let interval: ReturnType<typeof setInterval>;

    const start = () => {
      interval = setInterval(() => setTick((t) => t + 1), 60_000);
    };

    const handleVisibility = () => {
      clearInterval(interval);
      if (document.visibilityState === 'visible') {
        setTick((t) => t + 1);
        start();
      }
    };

    start();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return formatRelativeTime(timestamp);
}

/** Truncate at a word boundary, safe for surrogate pairs (emoji). */
function truncateText(text: string, maxLen: number): string {
  const chars = Array.from(text);
  if (chars.length <= maxLen) return text;
  const truncated = chars.slice(0, maxLen).join('');
  const lastSpace = truncated.lastIndexOf(' ');
  // Only break at space if it's not too far back (within 80% of threshold)
  const breakPoint = lastSpace > maxLen * 0.8 ? lastSpace : truncated.length;
  return truncated.slice(0, breakPoint) + '...';
}

export function MessageBubble({ message, index = 0 }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const relativeTime = useRelativeTime(message.timestamp);
  const isLong = message.content.length > MESSAGE_COLLAPSE_THRESHOLD;
  const [collapsed, setCollapsed] = useState(isLong);
  const wasLongRef = useRef(isLong);

  // Auto-collapse when content first crosses the threshold (e.g., streaming)
  useEffect(() => {
    if (isLong && !wasLongRef.current) {
      setCollapsed(true);
    }
    wasLongRef.current = isLong;
  }, [isLong]);

  const displayContent = collapsed
    ? truncateText(message.content, MESSAGE_COLLAPSE_THRESHOLD)
    : message.content;

  return (
    <div
      className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
      style={{
        animation: 'fadeInUp var(--anim-entrance-duration) var(--anim-entrance-easing) both',
        animationDelay: `${Math.min(index * 60, 300)}ms`,
      }}
    >
      <article
        aria-label={isUser ? 'Your message' : 'Assistant response'}
        data-role={message.role}
        className={cn(
          'relative px-4 py-3',
          isUser
            ? 'max-w-[85%] sm:max-w-[75%] rounded-[8px_8px_2px_8px] bg-primary-500 text-white'
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
          aria-atomic="false"
        >
          {displayContent}
        </p>
        {isLong && (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className={cn(
              'mt-1 text-xs font-medium underline underline-offset-2 transition-colors',
              isUser
                ? 'text-white/80 hover:text-white'
                : 'text-ai-500 hover:text-ai-600',
            )}
          >
            {collapsed ? 'Show more' : 'Show less'}
          </button>
        )}
        <time
          dateTime={message.timestamp}
          className={cn(
            'mt-1 block text-xs',
            isUser ? 'text-white/90' : 'text-neutral-400',
          )}
        >
          {relativeTime}
        </time>
      </article>
    </div>
  );
}
