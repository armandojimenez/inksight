import { cn } from '@/lib/utils';
import type { MessageData } from '@/types';

export interface MessageBubbleProps {
  message: MessageData;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
    >
      <article
        role="article"
        aria-label={isUser ? 'Your message' : 'Assistant response'}
        data-role={message.role}
        className={cn(
          'relative max-w-[75%] px-4 py-3',
          isUser
            ? 'rounded-[8px_8px_2px_8px] bg-primary-500 text-white'
            : 'rounded-[8px_8px_8px_2px] border border-ai-100 bg-ai-50 text-neutral-600',
        )}
      >
        {!isUser && (
          <span
            data-ai-indicator
            aria-hidden="true"
            className="absolute -left-4 top-3 h-2 w-2 rounded-full bg-ai-500"
          />
        )}
        <p
          className="whitespace-pre-wrap text-base leading-relaxed"
          aria-live={!isUser && isStreaming ? 'polite' : undefined}
        >
          {message.content}
        </p>
      </article>
    </div>
  );
}
