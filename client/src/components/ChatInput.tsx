import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  MAX_MESSAGE_LENGTH,
  CHAR_COUNTER_VISIBLE_THRESHOLD,
  CHAR_COUNTER_WARNING_THRESHOLD,
} from '@/lib/constants';

export interface ChatInputProps {
  onSend: (message: string) => void;
  isStreaming: boolean;
  disabled?: boolean;
  errorId?: string;
}

const MAX_TEXTAREA_HEIGHT = 160; // ~4 lines at 16px/24px line-height

// Matches server's CONTROL_CHAR_PATTERN + client's invisible Unicode chars.
// Source of truth: src/chat/dto/chat-request.dto.ts (server sanitization).
const SANITIZE_RE =
  /[\x01-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F\u200B\u200C\u200D\u200E\u200F\u2028\u2029\u2060\uFEFF]/g;

function sanitizeInput(value: string): string {
  return value.replace(SANITIZE_RE, '');
}

export function ChatInput({ onSend, isStreaming, disabled, errorId }: ChatInputProps) {
  const [value, setValue] = useState('');
  const [justSent, setJustSent] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isDisabled = isStreaming || disabled;
  const trimmedLength = value.trim().length;
  const canSend = trimmedLength > 0 && !isDisabled;

  const charRatio = value.length / MAX_MESSAGE_LENGTH;
  const showCounter = charRatio >= CHAR_COUNTER_VISIBLE_THRESHOLD;
  const isWarning = charRatio >= CHAR_COUNTER_WARNING_THRESHOLD;
  const isAtLimit = value.length >= MAX_MESSAGE_LENGTH;

  useEffect(() => {
    if (!justSent) return;
    const timer = setTimeout(() => setJustSent(false), 200);
    return () => clearTimeout(timer);
  }, [justSent]);

  const handleSend = useCallback(() => {
    if (isDisabled) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    setJustSent(true);
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, onSend, isDisabled]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter (without Shift) sends — covers plain Enter, Ctrl+Enter, Cmd+Enter
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (canSend) {
          handleSend();
        }
      }
    },
    [canSend, handleSend],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      // Strip control + invisible chars on input so counter matches what the server sees
      setValue(sanitizeInput(e.target.value));
      const el = e.target;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
    },
    [],
  );

  return (
    <div className="relative border-t border-neutral-100 bg-neutral-0 px-4 py-3 min-h-[var(--bottombar-height)]">
      <div className="flex items-end gap-3">
        <label htmlFor="chat-message-input" className="sr-only">
          Ask a question about this image
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
          aria-describedby={[errorId, showCounter ? 'char-counter' : ''].filter(Boolean).join(' ') || undefined}
          aria-invalid={isAtLimit || undefined}
          rows={1}
          style={{ maxHeight: `min(${MAX_TEXTAREA_HEIGHT}px, 20vh)` }}
          className={cn(
            'min-w-0 flex-1 resize-none rounded bg-neutral-0 px-4 py-3',
            'text-base text-neutral-600 placeholder:text-neutral-400',
            'border transition-colors',
            isAtLimit ? 'border-error-500' : 'border-neutral-200',
            'focus:border-primary-500 focus:outline-none focus-visible:[box-shadow:var(--shadow-focus)]',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
          className={cn(
            'flex w-11 shrink-0 items-center justify-center rounded border border-transparent py-3',
            'bg-primary-500 text-white transition-colors',
            'hover:bg-primary-600 active:bg-primary-700',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus)]',
          )}
          style={justSent ? { animation: 'sendPop 200ms ease' } : undefined}
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
            className="my-0.5"
            aria-hidden="true"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
      {showCounter && (
        <div className="flex justify-end pr-14 pt-1.5 pb-0.5">
          <span
            id="char-counter"
            aria-live="polite"
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-xs tabular-nums transition-colors',
              isAtLimit
                ? 'bg-error-50 text-error-500 font-medium'
                : isWarning
                  ? 'bg-warning-50 text-warning-600'
                  : 'text-neutral-400',
            )}
          >
            {value.length}/{MAX_MESSAGE_LENGTH}
          </span>
        </div>
      )}
    </div>
  );
}
