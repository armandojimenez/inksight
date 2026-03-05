import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
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

      const svgs = document.querySelectorAll('svg');
      expect(svgs.length).toBeGreaterThan(0);
    });

    it('shows suggested questions with arrow prefix', () => {
      render(<ChatView image={mockImage} />);

      expect(screen.getByText(/What objects are in this image/)).toBeInTheDocument();
      expect(screen.getByText(/Describe the colors and mood/)).toBeInTheDocument();
      expect(screen.getByText(/What text can you read/)).toBeInTheDocument();
    });

    it('suggested questions are clickable and trigger onSend', async () => {
      const user = userEvent.setup();
      const sendMessage = vi.fn();
      mockUseStreamingChat.mockReturnValue(mockChatHook({ sendMessage }));

      render(<ChatView image={mockImage} />);

      const suggestion = screen.getByText(/What objects are in this image/);
      await user.click(suggestion);

      expect(sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('What objects are in this image'),
      );
    });
  });

  describe('message rendering', () => {
    it('renders user messages with correct styling', () => {
      const messages = [createMessage('user', 'What is this?')];
      mockUseStreamingChat.mockReturnValue(mockChatHook({ messages }));

      render(<ChatView image={mockImage} />);

      const bubble = screen.getByText('What is this?').closest('[data-role="user"]');
      expect(bubble).toBeInTheDocument();
    });

    it('renders assistant messages with correct styling', () => {
      const messages = [createMessage('assistant', 'This is a landscape photo.')];
      mockUseStreamingChat.mockReturnValue(mockChatHook({ messages }));

      render(<ChatView image={mockImage} />);

      const bubble = screen.getByText('This is a landscape photo.').closest('[data-role="assistant"]');
      expect(bubble).toBeInTheDocument();
    });

    it('renders AI indicator dot on assistant messages', () => {
      const messages = [createMessage('assistant', 'AI response here')];
      mockUseStreamingChat.mockReturnValue(mockChatHook({ messages }));

      render(<ChatView image={mockImage} />);

      const bubble = screen.getByText('AI response here').closest('[data-role="assistant"]');
      const dot = bubble?.querySelector('[data-ai-indicator]');
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
  });

  describe('streaming', () => {
    it('shows streaming indicator while streaming', () => {
      mockUseStreamingChat.mockReturnValue(
        mockChatHook({ isStreaming: true, messages: [createMessage('user', 'Question')] }),
      );

      render(<ChatView image={mockImage} />);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('hides streaming indicator when not streaming', () => {
      mockUseStreamingChat.mockReturnValue(mockChatHook({ isStreaming: false }));

      render(<ChatView image={mockImage} />);

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows error message when error exists', () => {
      mockUseStreamingChat.mockReturnValue(
        mockChatHook({ error: 'Connection failed' }),
      );

      render(<ChatView image={mockImage} />);

      expect(screen.getByRole('alert')).toHaveTextContent(/connection failed/i);
    });
  });

  describe('chat container', () => {
    it('has role="log" on message container', () => {
      render(<ChatView image={mockImage} />);

      expect(screen.getByRole('log')).toBeInTheDocument();
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
