import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from '@/components/ChatInput';

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

    const textarea = screen.getByLabelText('Message input');
    expect(textarea).toBeInTheDocument();
    expect(textarea.tagName).toBe('TEXTAREA');
  });

  it('send button has aria-label', () => {
    render(<ChatInput onSend={onSend} isStreaming={false} />);

    const button = screen.getByRole('button', { name: /send/i });
    expect(button).toHaveAttribute('aria-label', 'Send message');
  });

  it('has maxLength on textarea', () => {
    render(<ChatInput onSend={onSend} isStreaming={false} />);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveAttribute('maxLength', '4000');
  });
});
