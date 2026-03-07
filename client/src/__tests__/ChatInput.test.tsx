import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from '@/components/ChatInput';
import { MAX_MESSAGE_LENGTH } from '@/lib/constants';

describe('ChatInput', () => {
  let onSend: ReturnType<typeof vi.fn<(message: string) => void>>;

  beforeEach(() => {
    vi.clearAllMocks();
    onSend = vi.fn<(message: string) => void>();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a textarea and send button', () => {
    render(<ChatInput onSend={onSend} isStreaming={false} />);

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('Enter submits message with trimmed text', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} isStreaming={false} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, '  Hello world  ');
    await user.keyboard('{Enter}');

    expect(onSend).toHaveBeenCalledWith('Hello world');
  });

  it('Shift+Enter inserts newline instead of submitting', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} isStreaming={false} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Line 1');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    await user.type(textarea, 'Line 2');

    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue('Line 1\nLine 2');
  });

  it('send button is disabled when input is empty', () => {
    render(<ChatInput onSend={onSend} isStreaming={false} />);

    const button = screen.getByRole('button', { name: /send/i });
    expect(button).toBeDisabled();
  });

  it('send button is disabled when input is whitespace only', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} isStreaming={false} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, '   ');

    const button = screen.getByRole('button', { name: /send/i });
    expect(button).toBeDisabled();
  });

  it('Enter does nothing when input is empty', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} isStreaming={false} />);

    const textarea = screen.getByRole('textbox');
    await user.click(textarea);
    await user.keyboard('{Enter}');

    expect(onSend).not.toHaveBeenCalled();
  });

  it('clicking send button submits the message', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} isStreaming={false} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Click send');

    const button = screen.getByRole('button', { name: /send/i });
    await user.click(button);

    expect(onSend).toHaveBeenCalledWith('Click send');
  });

  it('clears input after successful send', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} isStreaming={false} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Will clear');
    await user.keyboard('{Enter}');

    expect(onSend).toHaveBeenCalledWith('Will clear');
    expect(textarea).toHaveValue('');
  });

  it('input is disabled during streaming', () => {
    render(<ChatInput onSend={onSend} isStreaming={true} />);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeDisabled();

    const button = screen.getByRole('button', { name: /send/i });
    expect(button).toBeDisabled();
  });

  it('input is disabled when disabled prop is true', () => {
    render(<ChatInput onSend={onSend} isStreaming={false} disabled={true} />);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeDisabled();
  });

  it('has associated label on textarea', () => {
    render(<ChatInput onSend={onSend} isStreaming={false} />);

    const textarea = screen.getByLabelText('Ask a question about this image');
    expect(textarea).toBeInTheDocument();
    expect(textarea.tagName).toBe('TEXTAREA');
  });

  it('send button has aria-label', () => {
    render(<ChatInput onSend={onSend} isStreaming={false} />);

    const button = screen.getByRole('button', { name: /send/i });
    expect(button).toHaveAttribute('aria-label', 'Send message');
  });

  it('has maxLength on textarea matching server limit', () => {
    render(<ChatInput onSend={onSend} isStreaming={false} />);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveAttribute('maxLength', String(MAX_MESSAGE_LENGTH));
  });

  // --- Character counter ---

  it('shows character counter when approaching the limit', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} isStreaming={false} />);

    const textarea = screen.getByRole('textbox');
    const text = 'a'.repeat(Math.ceil(MAX_MESSAGE_LENGTH * 0.5));
    await user.click(textarea);
    await user.paste(text);

    expect(screen.getByText(`${text.length}/${MAX_MESSAGE_LENGTH}`)).toBeInTheDocument();
  });

  it('hides character counter when below threshold', () => {
    render(<ChatInput onSend={onSend} isStreaming={false} />);

    expect(screen.queryByText(/\/\d+/)).not.toBeInTheDocument();
  });

  it('shows warning color on counter at 90% of limit', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} isStreaming={false} />);

    const textarea = screen.getByRole('textbox');
    const text = 'a'.repeat(Math.ceil(MAX_MESSAGE_LENGTH * 0.9));
    await user.click(textarea);
    await user.paste(text);

    const counter = screen.getByText(`${text.length}/${MAX_MESSAGE_LENGTH}`);
    expect(counter.className).toContain('text-warning-600');
  });

  it('shows error color on counter and border at limit but keeps send enabled', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} isStreaming={false} />);

    const textarea = screen.getByRole('textbox');
    const text = 'a'.repeat(MAX_MESSAGE_LENGTH);
    await user.click(textarea);
    await user.paste(text);

    const counter = screen.getByText(`${MAX_MESSAGE_LENGTH}/${MAX_MESSAGE_LENGTH}`);
    expect(counter.className).toContain('text-error-500');
    expect(textarea.className).toContain('border-error-500');

    // Send button remains enabled — 2000 is a valid message length
    const button = screen.getByRole('button', { name: /send/i });
    expect(button).not.toBeDisabled();
  });

  it('send is enabled at MAX_MESSAGE_LENGTH - 1', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} isStreaming={false} />);

    const textarea = screen.getByRole('textbox');
    await user.click(textarea);
    await user.paste('a'.repeat(MAX_MESSAGE_LENGTH - 1));

    const button = screen.getByRole('button', { name: /send/i });
    expect(button).not.toBeDisabled();
  });

  // --- Keyboard shortcuts ---

  it('Ctrl+Enter submits message', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} isStreaming={false} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Ctrl send');
    await user.keyboard('{Control>}{Enter}{/Control}');

    expect(onSend).toHaveBeenCalledWith('Ctrl send');
  });

  it('Meta+Enter (Cmd) submits message', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} isStreaming={false} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Cmd send');
    await user.keyboard('{Meta>}{Enter}{/Meta}');

    expect(onSend).toHaveBeenCalledWith('Cmd send');
  });

  // --- Accessibility ---

  it('sets aria-describedby to both errorId and char-counter when both present', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} isStreaming={false} errorId="chat-error" />);

    const textarea = screen.getByRole('textbox');
    const text = 'a'.repeat(Math.ceil(MAX_MESSAGE_LENGTH * 0.5));
    await user.click(textarea);
    await user.paste(text);

    expect(textarea.getAttribute('aria-describedby')).toBe('chat-error char-counter');
  });

  it('sets aria-describedby to only errorId when counter is hidden', () => {
    render(<ChatInput onSend={onSend} isStreaming={false} errorId="chat-error" />);

    const textarea = screen.getByRole('textbox');
    expect(textarea.getAttribute('aria-describedby')).toBe('chat-error');
  });

  it('sets aria-invalid when at character limit', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} isStreaming={false} />);

    const textarea = screen.getByRole('textbox');
    await user.click(textarea);
    await user.paste('a'.repeat(MAX_MESSAGE_LENGTH));

    expect(textarea).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not set aria-invalid below the limit', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} isStreaming={false} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'short');

    expect(textarea).not.toHaveAttribute('aria-invalid');
  });

  // --- Input sanitization ---

  it('strips invisible Unicode characters from input', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} isStreaming={false} />);

    const textarea = screen.getByRole('textbox');
    await user.click(textarea);
    await user.paste('\u200BHello\u200B world\uFEFF');
    await user.keyboard('{Enter}');

    expect(onSend).toHaveBeenCalledWith('Hello world');
  });
});
