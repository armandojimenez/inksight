import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useStreamingChat } from '@/hooks/useStreamingChat';
import type { StreamChunk } from '@/types';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    streamMessage: vi.fn(),
    parseSSEStream: vi.fn(),
    getMessages: vi.fn(),
  };
});

import { streamMessage, parseSSEStream, getMessages } from '@/lib/api';

const mockStreamMessage = vi.mocked(streamMessage);
const mockParseSSEStream = vi.mocked(parseSSEStream);
const mockGetMessages = vi.mocked(getMessages);

function makeChunk(content: string, finishReason: 'stop' | null = null): StreamChunk {
  return {
    id: 'chunk-1',
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: 'mock-model',
    choices: [
      {
        index: 0,
        delta: { content },
        finish_reason: finishReason,
      },
    ],
  };
}

async function* fakeStream(chunks: StreamChunk[]): AsyncGenerator<StreamChunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

const IMAGE_ID = 'img-test-123';

describe('useStreamingChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockGetMessages.mockResolvedValue({
      imageId: IMAGE_ID,
      messages: [],
      totalMessages: 0,
      page: 1,
      pageSize: 50,
      totalPages: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('returns initial state with empty messages', () => {
    const { result } = renderHook(() => useStreamingChat(IMAGE_ID));

    expect(result.current.messages).toEqual([]);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.sendMessage).toBe('function');
  });

  it('accumulates tokens into assistant message as they arrive', async () => {
    const chunks = [
      makeChunk('Hello'),
      makeChunk(' world'),
      makeChunk('!', 'stop'),
    ];

    mockStreamMessage.mockResolvedValue(new Response());
    mockParseSSEStream.mockReturnValue(fakeStream(chunks));

    const { result } = renderHook(() => useStreamingChat(IMAGE_ID));

    await act(async () => {
      result.current.sendMessage('Hi there');
    });

    // User message + assistant message
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      content: 'Hi there',
    });
    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'Hello world!',
    });
  });

  it('adds user message immediately (optimistic update)', async () => {
    // Stream that never resolves — lets us check intermediate state
    let resolveStream: (value: Response) => void;
    const streamPromise = new Promise<Response>((resolve) => {
      resolveStream = resolve;
    });
    mockStreamMessage.mockReturnValue(streamPromise);

    const { result } = renderHook(() => useStreamingChat(IMAGE_ID));

    act(() => {
      result.current.sendMessage('My question');
    });

    // User message should appear immediately before stream resolves
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      content: 'My question',
    });
    expect(result.current.isStreaming).toBe(true);

    // Clean up
    resolveStream!(new Response());
  });

  it('sets isStreaming to true during streaming and false after', async () => {
    const chunks = [makeChunk('Done', 'stop')];
    mockStreamMessage.mockResolvedValue(new Response());
    mockParseSSEStream.mockReturnValue(fakeStream(chunks));

    const { result } = renderHook(() => useStreamingChat(IMAGE_ID));

    expect(result.current.isStreaming).toBe(false);

    await act(async () => {
      result.current.sendMessage('Test');
    });

    expect(result.current.isStreaming).toBe(false);
  });

  it('handles [DONE] sentinel to finalize message', async () => {
    // parseSSEStream already handles [DONE] by returning from generator.
    // This test verifies the hook correctly finalizes the message when
    // the generator completes.
    const chunks = [
      makeChunk('Final answer'),
      makeChunk('', 'stop'),
    ];
    mockStreamMessage.mockResolvedValue(new Response());
    mockParseSSEStream.mockReturnValue(fakeStream(chunks));

    const { result } = renderHook(() => useStreamingChat(IMAGE_ID));

    await act(async () => {
      result.current.sendMessage('Question');
    });

    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'Final answer',
    });
    expect(result.current.isStreaming).toBe(false);
  });

  it('retries on stream failure with exponential backoff', async () => {
    // Fail twice, succeed third time
    const error = new Error('Connection lost');
    mockStreamMessage
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(new Response());

    const chunks = [makeChunk('Recovered', 'stop')];
    mockParseSSEStream.mockReturnValue(fakeStream(chunks));

    const { result } = renderHook(() => useStreamingChat(IMAGE_ID));

    // Start message send — will trigger first attempt which fails
    act(() => {
      result.current.sendMessage('Retry test');
    });

    // First attempt fails immediately
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockStreamMessage).toHaveBeenCalledTimes(1);

    // After 1s delay, second attempt
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(mockStreamMessage).toHaveBeenCalledTimes(2);

    // After 2s delay, third attempt succeeds
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(mockStreamMessage).toHaveBeenCalledTimes(3);

    expect(result.current.error).toBeNull();
    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'Recovered',
    });
  });

  it('sets error after max retries exhausted (3 retries)', async () => {
    const error = new Error('Persistent failure');
    mockStreamMessage
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error);

    const { result } = renderHook(() => useStreamingChat(IMAGE_ID));

    act(() => {
      result.current.sendMessage('Will fail');
    });

    // Initial attempt
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Retry 1 after 1s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    // Retry 2 after 2s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    // Retry 3 after 4s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(mockStreamMessage).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    expect(result.current.error).toBe('Persistent failure');
    expect(result.current.isStreaming).toBe(false);
  });

  it('aborts in-flight stream on unmount', async () => {
    let capturedSignal: AbortSignal | undefined;
    mockStreamMessage.mockImplementation((_imageId, _msg, signal) => {
      capturedSignal = signal;
      return new Promise(() => {}); // never resolves
    });

    const { result, unmount } = renderHook(() => useStreamingChat(IMAGE_ID));

    act(() => {
      result.current.sendMessage('Will unmount');
    });

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);

    unmount();

    expect(capturedSignal!.aborted).toBe(true);
  });

  it('does not send empty or whitespace-only messages', async () => {
    const { result } = renderHook(() => useStreamingChat(IMAGE_ID));

    await act(async () => {
      result.current.sendMessage('');
    });

    expect(mockStreamMessage).not.toHaveBeenCalled();
    expect(result.current.messages).toHaveLength(0);

    await act(async () => {
      result.current.sendMessage('   ');
    });

    expect(mockStreamMessage).not.toHaveBeenCalled();
    expect(result.current.messages).toHaveLength(0);
  });

  it('does not allow sending while streaming', async () => {
    mockStreamMessage.mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useStreamingChat(IMAGE_ID));

    act(() => {
      result.current.sendMessage('First');
    });

    expect(result.current.isStreaming).toBe(true);

    act(() => {
      result.current.sendMessage('Second');
    });

    // Only the first message should exist
    expect(result.current.messages).toHaveLength(1);
    expect(mockStreamMessage).toHaveBeenCalledTimes(1);
  });

  it('clears error when a new message is sent successfully', async () => {
    const error = new Error('Temporary failure');
    mockStreamMessage
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error);

    const { result } = renderHook(() => useStreamingChat(IMAGE_ID));

    // Send first message — exhaust retries
    act(() => {
      result.current.sendMessage('Fail');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(result.current.error).toBe('Temporary failure');

    // Now send a successful message
    const successChunks = [makeChunk('OK', 'stop')];
    mockStreamMessage.mockResolvedValue(new Response());
    mockParseSSEStream.mockReturnValue(fakeStream(successChunks));

    await act(async () => {
      result.current.sendMessage('Try again');
    });

    expect(result.current.error).toBeNull();
  });

  it('passes imageId and message to streamMessage', async () => {
    const chunks = [makeChunk('Response', 'stop')];
    mockStreamMessage.mockResolvedValue(new Response());
    mockParseSSEStream.mockReturnValue(fakeStream(chunks));

    const { result } = renderHook(() => useStreamingChat(IMAGE_ID));

    await act(async () => {
      result.current.sendMessage('What is this?');
    });

    expect(mockStreamMessage).toHaveBeenCalledWith(
      IMAGE_ID,
      'What is this?',
      expect.any(AbortSignal),
    );
  });

  it('generates unique IDs for messages', async () => {
    const chunks1 = [makeChunk('First reply', 'stop')];
    const chunks2 = [makeChunk('Second reply', 'stop')];

    mockStreamMessage.mockResolvedValue(new Response());
    mockParseSSEStream
      .mockReturnValueOnce(fakeStream(chunks1))
      .mockReturnValueOnce(fakeStream(chunks2));

    const { result } = renderHook(() => useStreamingChat(IMAGE_ID));

    await act(async () => {
      result.current.sendMessage('First');
    });

    await act(async () => {
      result.current.sendMessage('Second');
    });

    const ids = result.current.messages.map((m) => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
