import { useCallback, useEffect, useRef, useState } from 'react';
import { useStreamingChat } from '@/hooks/useStreamingChat';
import { getImageFileUrl } from '@/lib/api';
import { ChatInput } from '@/components/ChatInput';
import { MessageBubble } from '@/components/MessageBubble';
import { InksightIcon } from '@/components/InksightIcon';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { ImageData } from '@/types';

export interface ChatViewProps {
  image: ImageData;
  onMessageCountChange?: (imageId: string, count: number) => void;
}

const SUGGESTED_QUESTIONS = [
  'What objects are in this image?',
  'Describe the colors and mood',
  'What text can you read?',
];

const SCROLL_THRESHOLD = 100;
const CHAT_ERROR_ID = 'chat-error';

export function ChatView({ image, onMessageCountChange }: ChatViewProps) {
  const { messages, sendMessage, isStreaming, error } = useStreamingChat(image.id);
  const [previewOpen, setPreviewOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  // Notify parent when message count changes
  useEffect(() => {
    onMessageCountChange?.(image.id, messages.length);
  }, [messages.length, image.id, onMessageCountChange]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;
  }, []);

  // Smart auto-scroll: only when user is near bottom
  useEffect(() => {
    if (isNearBottomRef.current && typeof scrollRef.current?.scrollIntoView === 'function') {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--bg-chat)' }}>
      {/* Image preview */}
      <div className="flex min-w-0 items-center gap-3 border-b border-neutral-100 px-4 h-[var(--topbar-height)]">
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="shrink-0 rounded focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus)]"
          aria-label={`Preview ${image.originalFilename}`}
        >
          <img
            src={getImageFileUrl(image.id)}
            alt={image.originalFilename}
            className="h-10 w-10 rounded object-cover transition-opacity hover:opacity-80"
          />
        </button>
        <span className="truncate text-sm font-medium text-neutral-600">
          {image.originalFilename}
        </span>
        <h2 className="sr-only">Chat</h2>
      </div>

      {/* Image preview modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl p-2">
          <DialogTitle className="sr-only">{image.originalFilename}</DialogTitle>
          <DialogDescription className="sr-only">Full-size preview of {image.originalFilename}</DialogDescription>
          <img
            src={getImageFileUrl(image.id)}
            alt={image.originalFilename}
            className="w-full rounded object-contain"
            style={{ maxHeight: '80vh' }}
          />
        </DialogContent>
      </Dialog>

      {/* Messages area */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
        aria-busy={isStreaming}
        className="flex-1 overflow-y-auto py-4 pl-6 pr-4"
      >
        {!hasMessages ? (
          <div className="flex h-full flex-col items-center justify-center gap-6">
            <InksightIcon
              data-testid="empty-state-icon"
              className="opacity-20"
              style={{
                height: 'var(--logo-height-hero)',
                width: 'auto',
                animation: 'fadeInUp var(--anim-entrance-duration) var(--anim-entrance-easing) both',
              }}
            />
            <div className="flex flex-col gap-2">
              {SUGGESTED_QUESTIONS.map((question, i) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => sendMessage(question)}
                  className={cn(
                    'min-h-[44px] rounded px-4 py-3 text-left text-sm text-primary-500',
                    'transition-all hover:bg-primary-50 hover:scale-[1.01]',
                    'focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus)]',
                  )}
                  style={{
                    animation: 'fadeInUp var(--anim-entrance-duration) var(--anim-entrance-easing) both',
                    animationDelay: `${(i + 1) * 60}ms`,
                  }}
                >
                  <span aria-hidden="true">→ </span>
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[var(--max-chat-width)] flex-col gap-4">
            {messages.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                index={i}
                isStreaming={isStreaming && i === messages.length - 1 && msg.role === 'assistant'}
              />
            ))}

            {isStreaming && (messages.length === 0 || messages[messages.length - 1]?.role === 'user') && (
              <StreamingIndicator />
            )}
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={scrollRef} />
      </div>

      {/* Error display */}
      {error && (
        <div
          id={CHAT_ERROR_ID}
          role="alert"
          className="border-t border-error-500 bg-error-50 px-4 py-2 text-sm text-error-500"
        >
          {error}
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={sendMessage}
        isStreaming={isStreaming}
        errorId={error ? CHAT_ERROR_ID : undefined}
      />
    </div>
  );
}

function StreamingIndicator() {
  return (
    <div className="flex justify-start">
      <div
        role="status"
        aria-label="Assistant is typing"
        className="rounded-[8px_8px_8px_2px] border border-ai-100 bg-ai-50 px-4 py-3"
      >
        <div className="flex gap-1" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-ai-500"
              style={{
                animation: 'typingBounce 1.2s ease-in-out infinite',
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
        <span className="sr-only">Assistant is typing</span>
      </div>
    </div>
  );
}
