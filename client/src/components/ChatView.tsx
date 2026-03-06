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
import { Loader2, X, RefreshCw } from 'lucide-react';
import type { ImageData } from '@/types';

export interface ChatViewProps {
  image: ImageData;
  initialAnalysis?: string;
  onMessageCountChange?: (imageId: string, count: number) => void;
}

const SUGGESTED_QUESTIONS = [
  'What objects are in this image?',
  'Describe the colors and mood',
  'What text can you read?',
];

const SCROLL_THRESHOLD = 100;
const CHAT_ERROR_ID = 'chat-error';
const MESSAGE_CAP = 50;

export function ChatView({ image, initialAnalysis, onMessageCountChange }: ChatViewProps) {
  const {
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
  } = useStreamingChat(image.id, initialAnalysis);
  const [previewOpen, setPreviewOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const scrollRafRef = useRef<number>(0);

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

  // Smart auto-scroll: throttled via rAF, instant during streaming
  useEffect(() => {
    if (isNearBottomRef.current && scrollRef.current) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = requestAnimationFrame(() => {
        if (typeof scrollRef.current?.scrollIntoView === 'function') {
          scrollRef.current.scrollIntoView({
            behavior: isStreaming ? 'auto' : 'smooth',
          });
        }
      });
    }
    return () => cancelAnimationFrame(scrollRafRef.current);
  }, [messages, isStreaming]);

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full flex-col bg-chat">
      {/* Image preview topbar */}
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
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-neutral-600">
            {image.originalFilename}
          </span>
          {messages.length > 0 && (
            <span className="block text-xs text-neutral-400">
              {messages.length}/{MESSAGE_CAP} messages
            </span>
          )}
        </div>
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
        {isLoadingHistory ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-300" aria-hidden="true" />
            <p className="text-sm text-neutral-400" role="status">Loading messages...</p>
          </div>
        ) : historyError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-sm text-error-500" role="alert">{historyError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded bg-primary-500 px-3 py-1.5 text-sm text-white hover:bg-primary-600 focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus)]"
            >
              Reload
            </button>
          </div>
        ) : !hasMessages ? (
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
                    'group min-h-[44px] rounded px-4 py-3 text-left text-sm text-primary-500',
                    'transition-all hover:bg-primary-50 hover:scale-[1.01]',
                    'focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus)]',
                  )}
                  style={{
                    animation: 'fadeInUp var(--anim-entrance-duration) var(--anim-entrance-easing) both',
                    animationDelay: `${(i + 1) * 60}ms`,
                  }}
                >
                  <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-1">→ </span>
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
              />
            ))}

            {isStreaming && (messages.length === 0 || messages[messages.length - 1]?.role === 'user') && (
              <StreamingIndicator retryAttempt={retryAttempt} />
            )}
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={scrollRef} />
      </div>

      {/* Message cap warning */}
      {messageCapReached && (
        <div className="border-t border-warning-50 bg-warning-50 px-4 py-2 text-xs text-warning-700">
          Message limit reached ({MESSAGE_CAP}). Start a new conversation to continue.
        </div>
      )}

      {/* Error display with dismiss and retry */}
      {error && (
        <div
          id={CHAT_ERROR_ID}
          role="alert"
          className="flex items-center gap-2 border-t border-error-500 bg-error-50 px-4 py-2 text-sm text-error-500"
        >
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={retryLastMessage}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium hover:bg-error-50 focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus)]"
            aria-label="Retry sending message"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
          <button
            type="button"
            onClick={clearError}
            className="rounded p-1 hover:bg-error-50 focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus)]"
            aria-label="Dismiss error"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={sendMessage}
        isStreaming={isStreaming}
        disabled={messageCapReached}
        errorId={error ? CHAT_ERROR_ID : undefined}
      />
    </div>
  );
}

function StreamingIndicator({ retryAttempt }: { retryAttempt: number }) {
  return (
    <div className="flex justify-start">
      <div
        role="status"
        aria-label={retryAttempt > 0 ? `Reconnecting, attempt ${retryAttempt} of 3` : 'Assistant is typing'}
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
        <span className="sr-only">
          {retryAttempt > 0 ? `Reconnecting... attempt ${retryAttempt} of 3` : 'Assistant is typing'}
        </span>
      </div>
    </div>
  );
}
