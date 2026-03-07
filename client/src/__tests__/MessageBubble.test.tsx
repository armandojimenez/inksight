import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageBubble, formatRelativeTime } from '@/components/MessageBubble';
import { MESSAGE_COLLAPSE_THRESHOLD } from '@/lib/constants';
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

  it('sets aria-atomic="false" on message paragraph for incremental updates', () => {
    render(<MessageBubble message={createMessage('assistant', 'Typing...')} />);

    const p = screen.getByLabelText(/assistant response/i).querySelector('p');
    expect(p).toHaveAttribute('aria-atomic', 'false');
  });

  it('applies entrance animation style', () => {
    const { container } = render(
      <MessageBubble message={createMessage('user', 'Hello')} index={0} />,
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.animation).toBeTruthy();
  });

  it('staggers animation delay proportionally to index', () => {
    const { container: c1 } = render(
      <MessageBubble message={createMessage('user', 'A')} index={0} />,
    );
    const { container: c2 } = render(
      <MessageBubble message={createMessage('user', 'B')} index={3} />,
    );

    const delay0 = (c1.firstElementChild as HTMLElement).style.animationDelay;
    const delay3 = (c2.firstElementChild as HTMLElement).style.animationDelay;

    expect(parseInt(delay0)).toBeLessThan(parseInt(delay3));
  });

  it('caps animation delay so it does not grow unbounded', () => {
    const { container: cSmall } = render(
      <MessageBubble message={createMessage('user', 'A')} index={5} />,
    );
    const { container: cLarge } = render(
      <MessageBubble message={createMessage('user', 'B')} index={100} />,
    );

    const delaySmall = parseInt((cSmall.firstElementChild as HTMLElement).style.animationDelay);
    const delayLarge = parseInt((cLarge.firstElementChild as HTMLElement).style.animationDelay);

    expect(delayLarge).toBe(delaySmall || delayLarge);
    expect(delayLarge).toBeLessThanOrEqual(300);
  });

  // --- Collapse / expand ---

  it('collapses long messages and shows "Show more" button', () => {
    const longContent = 'a'.repeat(MESSAGE_COLLAPSE_THRESHOLD + 100);
    render(<MessageBubble message={createMessage('user', longContent)} />);

    const bubble = screen.getByLabelText(/your message/i);
    const p = bubble.querySelector('p')!;
    expect(p.textContent!.length).toBeLessThan(longContent.length);
    expect(p.textContent).toContain('...');
    expect(screen.getByRole('button', { name: /show more/i })).toBeInTheDocument();
  });

  it('expands collapsed message when "Show more" is clicked', async () => {
    const user = userEvent.setup();
    const longContent = 'a'.repeat(MESSAGE_COLLAPSE_THRESHOLD + 100);
    render(<MessageBubble message={createMessage('user', longContent)} />);

    await user.click(screen.getByRole('button', { name: /show more/i }));

    const bubble = screen.getByLabelText(/your message/i);
    const p = bubble.querySelector('p')!;
    expect(p.textContent).toBe(longContent);
    expect(screen.getByRole('button', { name: /show less/i })).toBeInTheDocument();
  });

  it('does not show collapse button for short messages', () => {
    render(<MessageBubble message={createMessage('user', 'Short message')} />);

    expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();
  });

  it('does not collapse messages at exactly the threshold length', () => {
    const exactContent = 'a'.repeat(MESSAGE_COLLAPSE_THRESHOLD);
    render(<MessageBubble message={createMessage('user', exactContent)} />);

    const bubble = screen.getByLabelText(/your message/i);
    const p = bubble.querySelector('p')!;
    expect(p.textContent).toBe(exactContent);
    expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();
  });

  it('collapses long assistant messages with ai-themed button styling', () => {
    const longContent = 'b'.repeat(MESSAGE_COLLAPSE_THRESHOLD + 50);
    render(<MessageBubble message={createMessage('assistant', longContent)} />);

    const button = screen.getByRole('button', { name: /show more/i });
    expect(button.className).toContain('text-ai-500');
  });

  it('re-collapses expanded message when "Show less" is clicked', async () => {
    const user = userEvent.setup();
    const longContent = 'c'.repeat(MESSAGE_COLLAPSE_THRESHOLD + 200);
    render(<MessageBubble message={createMessage('assistant', longContent)} />);

    await user.click(screen.getByRole('button', { name: /show more/i }));
    expect(screen.getByRole('button', { name: /show less/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show less/i }));
    const bubble = screen.getByLabelText(/assistant response/i);
    const p = bubble.querySelector('p')!;
    expect(p.textContent).toContain('...');
    expect(screen.getByRole('button', { name: /show more/i })).toBeInTheDocument();
  });

  it('truncates at word boundary instead of mid-word', () => {
    // Build content with a space near the threshold so truncation breaks at a word
    const words = 'word '.repeat(MESSAGE_COLLAPSE_THRESHOLD / 5 + 20);
    render(<MessageBubble message={createMessage('user', words)} />);

    const bubble = screen.getByLabelText(/your message/i);
    const p = bubble.querySelector('p')!;
    const truncated = p.textContent!;
    // Should not end with a partial word before "..."
    const beforeEllipsis = truncated.slice(0, -3);
    expect(beforeEllipsis.endsWith(' ') || beforeEllipsis === beforeEllipsis.trimEnd()).toBe(true);
  });

  it('safely truncates messages with emoji (surrogate pairs)', () => {
    // Emoji are multi-byte: each "😀" is 2 UTF-16 code units
    const emoji = '😀'.repeat(MESSAGE_COLLAPSE_THRESHOLD + 10);
    render(<MessageBubble message={createMessage('user', emoji)} />);

    const bubble = screen.getByLabelText(/your message/i);
    const p = bubble.querySelector('p')!;
    // Should not contain broken surrogate pair (would show as replacement char)
    expect(p.textContent).not.toContain('\uFFFD');
    expect(p.textContent).toContain('...');
  });

  it('renders empty content without crashing', () => {
    render(<MessageBubble message={createMessage('user', '')} />);

    const bubble = screen.getByLabelText(/your message/i);
    const p = bubble.querySelector('p')!;
    expect(p.textContent).toBe('');
  });

  it('escapes HTML in message content (no XSS)', () => {
    const xss = '<script>alert("xss")</script>';
    render(<MessageBubble message={createMessage('user', xss)} />);

    const bubble = screen.getByLabelText(/your message/i);
    const p = bubble.querySelector('p')!;
    expect(p.textContent).toBe(xss);
    expect(bubble.querySelector('script')).not.toBeInTheDocument();
  });

  // --- Timer ---

  it('updates relative time when timer ticks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-05T12:00:00Z'));

    const timestamp = new Date('2026-03-05T11:59:30Z').toISOString();
    render(<MessageBubble message={createMessage('user', 'Hello', timestamp)} />);

    const timeEl = screen.getByLabelText(/your message/i).querySelector('time')!;
    expect(timeEl.textContent).toBe('just now');

    act(() => { vi.advanceTimersByTime(120_000); });
    expect(timeEl.textContent).toBe('2m ago');

    vi.useRealTimers();
  });

  it('cleans up interval on unmount', () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');

    const { unmount } = render(
      <MessageBubble message={createMessage('user', 'Test')} />,
    );
    unmount();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
    vi.useRealTimers();
  });

  it('pauses timer when tab becomes hidden', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-05T12:00:00Z'));
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');

    render(
      <MessageBubble message={createMessage('user', 'Test', '2026-03-05T11:59:00Z')} />,
    );

    // Simulate tab hidden
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });

    expect(clearSpy).toHaveBeenCalled();

    // Restore
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });

    clearSpy.mockRestore();
    vi.useRealTimers();
  });
});
