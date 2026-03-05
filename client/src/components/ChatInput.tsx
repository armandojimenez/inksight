import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface ChatInputProps {
  onSend: (message: string) => void;
  isStreaming: boolean;
  disabled?: boolean;
}

const MAX_MESSAGE_LENGTH = 4000;
const MAX_TEXTAREA_HEIGHT = 160; // ~4 lines at 16px/24px line-height

export function ChatInput({ onSend, isStreaming, disabled }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isDisabled = isStreaming || disabled;
  const canSend = value.trim().length > 0 && !isDisabled;

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) {
        handleSend();
      }
    }
  };

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
      const el = e.target;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
    },
    [],
  );

  return (
    <div className="flex items-end gap-2 border-t border-neutral-100 bg-neutral-0 p-3">
      <label htmlFor="chat-message-input" className="sr-only">
        Message input
      </label>
      <textarea
        id="chat-message-input"
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={isDisabled}
        maxLength={MAX_MESSAGE_LENGTH}
        placeholder="Ask about this image..."
        rows={1}
        className={cn(
          'min-w-0 flex-1 resize-none rounded bg-neutral-0 px-4 py-3',
          'text-base text-neutral-600 placeholder:text-neutral-300',
          'border border-neutral-200 transition-colors',
          'focus:border-primary-500 focus:outline-none focus-visible:[box-shadow:var(--shadow-focus)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      />
      <button
        onClick={handleSend}
        disabled={!canSend}
        aria-label="Send message"
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded',
          'bg-primary-500 text-white transition-colors',
          'hover:bg-primary-600 active:bg-primary-700',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus)]',
        )}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>
  );
}
