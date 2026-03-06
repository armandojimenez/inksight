import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatView } from '@/components/ChatView';
import type { ImageData, MessageData } from '@/types';

vi.mock('@/hooks/useStreamingChat', () => ({
  useStreamingChat: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    getImageFileUrl: vi.fn((id: string) => `/api/images/${id}/file`),
  };
});

import { useStreamingChat } from '@/hooks/useStreamingChat';
import type { UseStreamingChatReturn } from '@/hooks/useStreamingChat';

const mockUseStreamingChat = vi.mocked(useStreamingChat);

const mockImage: ImageData = {
  id: 'img-123',
  originalFilename: 'photo.png',
  mimeType: 'image/png',
  size: 1024,
  messageCount: 0,
  createdAt: '2026-03-05T12:00:00Z',
};

function createMessage(
  role: 'user' | 'assistant',
  content: string,
  id?: string,
): MessageData {
  return {
    id: id || `msg-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    timestamp: new Date().toISOString(),
  };
}

function mockChatHook(overrides: Partial<UseStreamingChatReturn> = {}): UseStreamingChatReturn {
  return {
    messages: [],
    sendMessage: vi.fn(),
    isStreaming: false,
    error: null,
    isLoadingHistory: false,
    historyError: null,
    retryAttempt: 0,
    clearError: vi.fn(),
    retryLastMessage: vi.fn(),
    messageCapReached: false,
    ...overrides,
  };
}

describe('ChatView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseStreamingChat.mockReturnValue(mockChatHook());
  });

  afterEach(() => {
    cleanup();
  });

  describe('empty state', () => {
    it('shows Inksight icon when no messages', () => {
      render(<ChatView image={mockImage} />);

      expect(screen.getByTestId('empty-state-icon')).toBeInTheDocument();
    });

    it('hides Inksight icon when messages exist', () => {
      const messages = [createMessage('user', 'Hello')];
      mockUseStreamingChat.mockReturnValue(mockChatHook({ messages }));

      render(<ChatView image={mockImage} />);

      expect(screen.queryByTestId('empty-state-icon')).not.toBeInTheDocument();
    });

    it('shows suggested questions with arrow prefix', () => {
      render(<ChatView image={mockImage} />);

      expect(screen.getByText(/What objects are in this image/)).toBeInTheDocument();
      expect(screen.getByText(/Describe the colors and mood/)).toBeInTheDocument();
      expect(screen.getByText(/What text can you read/)).toBeInTheDocument();
    });

    it('suggested questions disappear when messages exist', () => {
      const messages = [createMessage('user', 'Hello')];
      mockUseStreamingChat.mockReturnValue(mockChatHook({ messages }));

      render(<ChatView image={mockImage} />);

      expect(screen.queryByText(/What objects are in this image/)).not.toBeInTheDocument();
    });

    it('suggested questions are clickable and trigger onSend with exact text', async () => {
      const user = userEvent.setup();
      const sendMessage = vi.fn();
      mockUseStreamingChat.mockReturnValue(mockChatHook({ sendMessage }));

      render(<ChatView image={mockImage} />);

      const suggestion = screen.getByText(/What objects are in this image/);
      await user.click(suggestion);

      expect(sendMessage).toHaveBeenCalledWith('What objects are in this image?');
    });
  });

  describe('message rendering', () => {
    it('renders user messages with correct role', () => {
      const messages = [createMessage('user', 'What is this?')];
      mockUseStreamingChat.mockReturnValue(mockChatHook({ messages }));

      render(<ChatView image={mockImage} />);

      expect(screen.getByLabelText(/your message/i)).toHaveTextContent('What is this?');
    });

    it('renders assistant messages with correct role', () => {
      const messages = [createMessage('assistant', 'This is a landscape photo.')];
      mockUseStreamingChat.mockReturnValue(mockChatHook({ messages }));

      render(<ChatView image={mockImage} />);

      expect(screen.getByLabelText(/assistant response/i)).toHaveTextContent('This is a landscape photo.');
    });

    it('renders AI indicator dot on assistant messages', () => {
      const messages = [createMessage('assistant', 'AI response here')];
      mockUseStreamingChat.mockReturnValue(mockChatHook({ messages }));

      render(<ChatView image={mockImage} />);

      const bubble = screen.getByLabelText(/assistant response/i);
      const dot = bubble.querySelector('[data-ai-indicator]');
      expect(dot).toBeInTheDocument();
    });

    it('renders multiple messages in order', () => {
      const messages = [
        createMessage('user', 'First question', 'msg-1'),
        createMessage('assistant', 'First answer', 'msg-2'),
        createMessage('user', 'Second question', 'msg-3'),
        createMessage('assistant', 'Second answer', 'msg-4'),
      ];
      mockUseStreamingChat.mockReturnValue(mockChatHook({ messages }));

      render(<ChatView image={mockImage} />);

      const bubbles = screen.getAllByRole('article');
      expect(bubbles).toHaveLength(4);
    });

    it('user messages have aria-label "Your message"', () => {
      const messages = [createMessage('user', 'Test message')];
      mockUseStreamingChat.mockReturnValue(mockChatHook({ messages }));

      render(<ChatView image={mockImage} />);

      expect(screen.getByLabelText(/your message/i)).toBeInTheDocument();
    });

    it('assistant messages have aria-label "Assistant response"', () => {
      const messages = [createMessage('assistant', 'Test response')];
      mockUseStreamingChat.mockReturnValue(mockChatHook({ messages }));

      render(<ChatView image={mockImage} />);

      expect(screen.getByLabelText(/assistant response/i)).toBeInTheDocument();
    });
  });

  describe('image preview', () => {
    it('shows image preview thumbnail at top', () => {
      render(<ChatView image={mockImage} />);

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', '/api/images/img-123/file');
      expect(img).toHaveAttribute('alt', 'photo.png');
    });

    it('truncates long filenames', () => {
      const longNameImage = {
        ...mockImage,
        originalFilename: 'my-extremely-long-vacation-photo-from-december-2025-final-v3.jpg',
      };
      render(<ChatView image={longNameImage} />);

      const filenameEl = screen.getByText(longNameImage.originalFilename);
      expect(filenameEl.className).toContain('truncate');
    });

    it('thumbnail is a clickable button with preview aria-label', () => {
      render(<ChatView image={mockImage} />);

      const previewBtn = screen.getByRole('button', { name: /preview photo\.png/i });
      expect(previewBtn).toBeInTheDocument();
    });

    it('clicking thumbnail opens image preview modal', async () => {
      const user = userEvent.setup();
      render(<ChatView image={mockImage} />);

      await user.click(screen.getByRole('button', { name: /preview photo\.png/i }));

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();

      // Modal should contain the full image
      const images = dialog.querySelectorAll('img');
      expect(images.length).toBeGreaterThanOrEqual(1);
      const fullImage = Array.from(images).find(
        (img) => img.getAttribute('src') === '/api/images/img-123/file',
      );
      expect(fullImage).toBeInTheDocument();
    });

    it('preview modal can be closed', async () => {
      const user = userEvent.setup();
      render(<ChatView image={mockImage} />);

      await user.click(screen.getByRole('button', { name: /preview photo\.png/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Close via the X button
      const closeBtn = screen.getByRole('button', { name: /close/i });
      await user.click(closeBtn);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('streaming', () => {
    it('shows streaming indicator while streaming with user message as last', () => {
      mockUseStreamingChat.mockReturnValue(
        mockChatHook({ isStreaming: true, messages: [createMessage('user', 'Question')] }),
      );

      render(<ChatView image={mockImage} />);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('shows retry attempt in streaming indicator', () => {
      mockUseStreamingChat.mockReturnValue(
        mockChatHook({ isStreaming: true, retryAttempt: 2, messages: [createMessage('user', 'Q')] }),
      );

      render(<ChatView image={mockImage} />);

      expect(screen.getByRole('status')).toHaveAttribute(
        'aria-label',
        'Reconnecting, attempt 2 of 3',
      );
    });

    it('hides streaming indicator when not streaming', () => {
      mockUseStreamingChat.mockReturnValue(mockChatHook({ isStreaming: false }));

      render(<ChatView image={mockImage} />);

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('sets aria-busy on log container during streaming', () => {
      mockUseStreamingChat.mockReturnValue(mockChatHook({ isStreaming: true }));

      render(<ChatView image={mockImage} />);

      expect(screen.getByRole('log')).toHaveAttribute('aria-busy', 'true');
    });

    it('shows empty state instead of streaming indicator when streaming with no messages', () => {
      mockUseStreamingChat.mockReturnValue(
        mockChatHook({ isStreaming: true, messages: [] }),
      );

      render(<ChatView image={mockImage} />);

      // Empty state renders (suggested questions visible), no streaming indicator
      expect(screen.getByTestId('empty-state-icon')).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('loading and error states', () => {
    it('shows loading indicator while history is loading', () => {
      mockUseStreamingChat.mockReturnValue(
        mockChatHook({ isLoadingHistory: true }),
      );

      render(<ChatView image={mockImage} />);

      expect(screen.getByText('Loading messages...')).toBeInTheDocument();
    });

    it('shows history error with reload button', () => {
      mockUseStreamingChat.mockReturnValue(
        mockChatHook({ historyError: 'Failed to load messages' }),
      );

      render(<ChatView image={mockImage} />);

      expect(screen.getByText('Failed to load messages')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
    });

    it('calls window.location.reload when history error reload button is clicked', async () => {
      const user = userEvent.setup();
      const reloadMock = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { reload: reloadMock },
        writable: true,
        configurable: true,
      });

      mockUseStreamingChat.mockReturnValue(
        mockChatHook({ historyError: 'Failed to load messages' }),
      );

      render(<ChatView image={mockImage} />);

      await user.click(screen.getByRole('button', { name: /reload/i }));

      expect(reloadMock).toHaveBeenCalled();
    });

    it('shows error banner with retry and dismiss buttons', () => {
      mockUseStreamingChat.mockReturnValue(
        mockChatHook({ error: 'Connection failed' }),
      );

      render(<ChatView image={mockImage} />);

      expect(screen.getByRole('alert')).toHaveTextContent(/connection failed/i);
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
    });

    it('calls retryLastMessage when retry button is clicked', async () => {
      const user = userEvent.setup();
      const retryLastMessage = vi.fn();
      mockUseStreamingChat.mockReturnValue(
        mockChatHook({ error: 'Connection failed', retryLastMessage }),
      );

      render(<ChatView image={mockImage} />);

      await user.click(screen.getByRole('button', { name: /retry/i }));

      expect(retryLastMessage).toHaveBeenCalled();
    });

    it('calls clearError when dismiss button is clicked', async () => {
      const user = userEvent.setup();
      const clearError = vi.fn();
      mockUseStreamingChat.mockReturnValue(
        mockChatHook({ error: 'Connection failed', clearError }),
      );

      render(<ChatView image={mockImage} />);

      await user.click(screen.getByRole('button', { name: /dismiss/i }));

      expect(clearError).toHaveBeenCalled();
    });

    it('shows message cap warning when limit reached', () => {
      mockUseStreamingChat.mockReturnValue(
        mockChatHook({
          messageCapReached: true,
          messages: [createMessage('user', 'Test')],
        }),
      );

      render(<ChatView image={mockImage} />);

      expect(screen.getByText(/message limit reached/i)).toBeInTheDocument();
    });

    it('disables input when message cap is reached', () => {
      mockUseStreamingChat.mockReturnValue(
        mockChatHook({
          messageCapReached: true,
          messages: [createMessage('user', 'Test')],
        }),
      );

      render(<ChatView image={mockImage} />);

      expect(screen.getByRole('textbox')).toBeDisabled();
    });
  });

  describe('message count display', () => {
    it('shows message count when messages exist', () => {
      const messages = [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Hi'),
      ];
      mockUseStreamingChat.mockReturnValue(mockChatHook({ messages }));

      render(<ChatView image={mockImage} />);

      expect(screen.getByText('2/50 messages')).toBeInTheDocument();
    });

    it('does not show message count when no messages', () => {
      render(<ChatView image={mockImage} />);

      expect(screen.queryByText(/\/50 messages/)).not.toBeInTheDocument();
    });
  });

  describe('chat container', () => {
    it('has role="log" on message container', () => {
      render(<ChatView image={mockImage} />);

      expect(screen.getByRole('log')).toBeInTheDocument();
    });

    it('wires hook to correct image ID', () => {
      render(<ChatView image={mockImage} />);

      expect(mockUseStreamingChat).toHaveBeenCalledWith('img-123', undefined);
    });

    it('passes initialAnalysis to hook', () => {
      render(<ChatView image={mockImage} initialAnalysis="A cat photo" />);

      expect(mockUseStreamingChat).toHaveBeenCalledWith('img-123', 'A cat photo');
    });
  });

  describe('onMessageCountChange callback', () => {
    it('calls onMessageCountChange with image ID and count when messages change', () => {
      const onMessageCountChange = vi.fn();
      const messages = [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Hi'),
      ];
      mockUseStreamingChat.mockReturnValue(mockChatHook({ messages }));

      render(<ChatView image={mockImage} onMessageCountChange={onMessageCountChange} />);

      expect(onMessageCountChange).toHaveBeenCalledWith('img-123', 2);
    });

    it('calls onMessageCountChange with 0 when no messages', () => {
      const onMessageCountChange = vi.fn();
      mockUseStreamingChat.mockReturnValue(mockChatHook({ messages: [] }));

      render(<ChatView image={mockImage} onMessageCountChange={onMessageCountChange} />);

      expect(onMessageCountChange).toHaveBeenCalledWith('img-123', 0);
    });
  });

  describe('integration with ChatInput', () => {
    it('renders ChatInput component', () => {
      render(<ChatView image={mockImage} />);

      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
    });

    it('passes isStreaming to ChatInput', () => {
      mockUseStreamingChat.mockReturnValue(mockChatHook({ isStreaming: true }));

      render(<ChatView image={mockImage} />);

      expect(screen.getByRole('textbox')).toBeDisabled();
    });
  });
});
