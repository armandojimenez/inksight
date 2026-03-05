import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MessageBubble, formatRelativeTime } from '@/components/MessageBubble';
import type { MessageData } from '@/types';

function createMessage(
  role: 'user' | 'assistant',
  content: string,
  timestamp?: string,
): MessageData {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    timestamp: timestamp ?? new Date().toISOString(),
  };
}

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for timestamps less than 60 seconds ago', () => {
    const timestamp = new Date('2026-03-05T11:59:30Z').toISOString();
    expect(formatRelativeTime(timestamp)).toBe('just now');
  });

  it('returns minutes ago for timestamps 1-59 minutes ago', () => {
    const timestamp = new Date('2026-03-05T11:55:00Z').toISOString();
    expect(formatRelativeTime(timestamp)).toBe('5m ago');
  });

  it('returns hours ago for timestamps 1-23 hours ago', () => {
    const timestamp = new Date('2026-03-05T09:00:00Z').toISOString();
    expect(formatRelativeTime(timestamp)).toBe('3h ago');
  });

  it('returns days ago for timestamps 24+ hours ago', () => {
    const timestamp = new Date('2026-03-03T12:00:00Z').toISOString();
    expect(formatRelativeTime(timestamp)).toBe('2d ago');
  });

  it('returns empty string for invalid timestamps', () => {
    expect(formatRelativeTime('invalid-date')).toBe('');
  });

  it('clamps negative diffs to "just now" (clock skew)', () => {
    const futureTimestamp = new Date('2026-03-05T12:01:00Z').toISOString();
    expect(formatRelativeTime(futureTimestamp)).toBe('just now');
  });
});

describe('MessageBubble', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders user message with "Your message" aria-label', () => {
    render(<MessageBubble message={createMessage('user', 'Hello')} />);

    expect(screen.getByLabelText(/your message/i)).toHaveTextContent('Hello');
  });

  it('renders assistant message with "Assistant response" aria-label', () => {
    render(<MessageBubble message={createMessage('assistant', 'Hi there')} />);

    expect(screen.getByLabelText(/assistant response/i)).toHaveTextContent('Hi there');
  });

  it('renders AI indicator dot on assistant messages', () => {
    render(<MessageBubble message={createMessage('assistant', 'Response')} />);

    const bubble = screen.getByLabelText(/assistant response/i);
    expect(bubble.querySelector('[data-ai-indicator]')).toBeInTheDocument();
  });

  it('does not render AI indicator on user messages', () => {
    render(<MessageBubble message={createMessage('user', 'Question')} />);

    const bubble = screen.getByLabelText(/your message/i);
    expect(bubble.querySelector('[data-ai-indicator]')).not.toBeInTheDocument();
  });

  it('renders a <time> element with dateTime attribute', () => {
    const timestamp = '2026-03-05T12:00:00Z';
    render(<MessageBubble message={createMessage('user', 'Test', timestamp)} />);

    const timeEl = screen.getByLabelText(/your message/i).querySelector('time');
    expect(timeEl).toBeInTheDocument();
    expect(timeEl).toHaveAttribute('dateTime', timestamp);
  });

  it('sets aria-live="polite" on streaming assistant messages', () => {
    render(<MessageBubble message={createMessage('assistant', 'Typing...')} isStreaming />);

    const p = screen.getByLabelText(/assistant response/i).querySelector('p');
    expect(p).toHaveAttribute('aria-live', 'polite');
  });

  it('does not set aria-live on non-streaming messages', () => {
    render(<MessageBubble message={createMessage('assistant', 'Done')} isStreaming={false} />);

    const p = screen.getByLabelText(/assistant response/i).querySelector('p');
    expect(p).not.toHaveAttribute('aria-live');
  });
});
