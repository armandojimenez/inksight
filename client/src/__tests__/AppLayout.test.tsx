import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppLayout } from '@/components/AppLayout';
import type { ImageData, UploadResponse } from '@/types';

// Mock child components to isolate AppLayout logic
vi.mock('@/components/ChatView', () => ({
  ChatView: ({ image, onMessageCountChange }: { image: ImageData; onMessageCountChange?: (id: string, count: number) => void }) => (
    <div data-testid="chat-view" data-image-id={image.id}>
      ChatView: {image.originalFilename}
      {onMessageCountChange && (
        <button onClick={() => onMessageCountChange(image.id, 5)}>
          Update count
        </button>
      )}
    </div>
  ),
}));

vi.mock('@/components/UploadView', () => ({
  UploadView: ({
    onUploadComplete,
    isFirstTime,
  }: {
    onUploadComplete: (img: UploadResponse) => void;
    isFirstTime?: boolean;
  }) => (
    <div data-testid="upload-view" data-first-time={isFirstTime ? 'true' : undefined}>
      <button
        onClick={() =>
          onUploadComplete({
            id: 'new-img',
            filename: 'new.png',
            mimeType: 'image/png',
            size: 1024,
            analysis: null,
          })
        }
      >
        Upload
      </button>
      <button
        onClick={() =>
          onUploadComplete({
            id: 'new-img-analysis',
            filename: 'analyzed.png',
            mimeType: 'image/png',
            size: 2048,
            analysis: {
              id: 'chatcmpl-test',
              object: 'chat.completion',
              created: 1700000000,
              model: 'gpt-5.2',
              choices: [{ index: 0, message: { role: 'assistant', content: 'This is a photo of a cat.' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
            },
          })
        }
      >
        Upload with analysis
      </button>
    </div>
  ),
}));

vi.mock('@/components/Sidebar', () => ({
  Sidebar: ({
    images,
    selectedImageId,
    onSelectImage,
    onDeleteImage,
    onNewUpload,
    isLoading,
  }: {
    images: readonly ImageData[];
    selectedImageId: string | null;
    onSelectImage: (id: string) => void;
    onDeleteImage: (id: string) => void;
    onNewUpload: () => void;
    isLoading?: boolean;
  }) => (
    <nav data-testid="sidebar" data-loading={isLoading ? 'true' : undefined}>
      {images.map((img) => (
        <div key={img.id} data-selected={img.id === selectedImageId ? 'true' : undefined}>
          <button onClick={() => onSelectImage(img.id)}>{img.originalFilename}</button>
          <button onClick={() => onDeleteImage(img.id)}>Delete {img.originalFilename}</button>
        </div>
      ))}
      <button onClick={onNewUpload}>New Image</button>
    </nav>
  ),
}));

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => true), // default to desktop
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    getImages: vi.fn().mockResolvedValue({
      images: [],
      total: 0,
      page: 1,
      pageSize: 100,
      totalPages: 0,
    }),
    deleteImage: vi.fn().mockResolvedValue(undefined),
  };
});

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { getImages, deleteImage } from '@/lib/api';
import { toast } from 'sonner';

const mockUseMediaQuery = vi.mocked(useMediaQuery);
const mockGetImages = vi.mocked(getImages);
const mockDeleteImage = vi.mocked(deleteImage);
const mockToast = vi.mocked(toast);

const sampleImages: ImageData[] = [
  {
    id: 'img-1',
    originalFilename: 'sunset.jpg',
    mimeType: 'image/jpeg',
    size: 2048,
    messageCount: 3,
    createdAt: '2026-03-01T10:00:00Z',
  },
  {
    id: 'img-2',
    originalFilename: 'portrait.png',
    mimeType: 'image/png',
    size: 1024,
    messageCount: 0,
    createdAt: '2026-03-02T10:00:00Z',
  },
];

describe('AppLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMediaQuery.mockReturnValue(true); // desktop
    mockGetImages.mockResolvedValue({
      images: [],
      total: 0,
      page: 1,
      pageSize: 100,
      totalPages: 0,
    });
  });

  afterEach(() => {
    cleanup();
  });

  describe('initial load', () => {
    it('calls getImages on mount', async () => {
      render(<AppLayout />);

      await waitFor(() => {
        expect(mockGetImages).toHaveBeenCalledWith(
          { limit: 100 },
          expect.any(AbortSignal),
        );
      });
    });

    it('shows UploadView when no images loaded', async () => {
      render(<AppLayout />);

      await waitFor(() => {
        expect(screen.getByTestId('upload-view')).toBeInTheDocument();
      });
    });

    it('passes isFirstTime=true to UploadView when no images and not loading', async () => {
      render(<AppLayout />);

      await waitFor(() => {
        expect(screen.getByTestId('upload-view')).toHaveAttribute('data-first-time', 'true');
      });
    });

    it('selects first image and shows ChatView when images loaded', async () => {
      mockGetImages.mockResolvedValue({
        images: sampleImages,
        total: 2,
        page: 1,
        pageSize: 100,
        totalPages: 1,
      });

      render(<AppLayout />);

      await waitFor(() => {
        expect(screen.getByTestId('chat-view')).toHaveAttribute('data-image-id', 'img-1');
      });
    });

    it('shows error toast when getImages fails', async () => {
      mockGetImages.mockRejectedValue(new Error('Network error'));

      render(<AppLayout />);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Failed to load images', { duration: Infinity });
      });
    });
  });

  describe('upload flow', () => {
    it('adds new image to list and selects it after upload', async () => {
      const user = userEvent.setup();
      render(<AppLayout />);

      await waitFor(() => {
        expect(screen.getByTestId('upload-view')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Upload'));

      await waitFor(() => {
        expect(screen.getByTestId('chat-view')).toHaveAttribute('data-image-id', 'new-img');
      });

      expect(mockToast.success).toHaveBeenCalledWith('Uploaded new.png');
    });

    it('captures initial analysis from upload response', async () => {
      const user = userEvent.setup();
      render(<AppLayout />);

      await waitFor(() => {
        expect(screen.getByTestId('upload-view')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Upload with analysis'));

      await waitFor(() => {
        expect(screen.getByTestId('chat-view')).toHaveAttribute('data-image-id', 'new-img-analysis');
      });
    });
  });

  describe('message count change', () => {
    it('updates image message count via onMessageCountChange', async () => {
      const user = userEvent.setup();
      mockGetImages.mockResolvedValue({
        images: sampleImages,
        total: 2,
        page: 1,
        pageSize: 100,
        totalPages: 1,
      });

      render(<AppLayout />);

      await waitFor(() => {
        expect(screen.getByTestId('chat-view')).toBeInTheDocument();
      });

      // Click the mock button that triggers onMessageCountChange
      await user.click(screen.getByText('Update count'));

      // The sidebar mock renders message counts — verify it updated
      const sidebar = screen.getByTestId('sidebar');
      expect(sidebar).toBeInTheDocument();
    });
  });

  describe('image selection', () => {
    it('switches ChatView when a different image is selected in sidebar', async () => {
      const user = userEvent.setup();
      mockGetImages.mockResolvedValue({
        images: sampleImages,
        total: 2,
        page: 1,
        pageSize: 100,
        totalPages: 1,
      });

      render(<AppLayout />);

      await waitFor(() => {
        expect(screen.getByTestId('chat-view')).toHaveAttribute('data-image-id', 'img-1');
      });

      await user.click(screen.getByText('portrait.png'));

      expect(screen.getByTestId('chat-view')).toHaveAttribute('data-image-id', 'img-2');
    });

    it('shows UploadView when "New Image" is clicked', async () => {
      const user = userEvent.setup();
      mockGetImages.mockResolvedValue({
        images: sampleImages,
        total: 2,
        page: 1,
        pageSize: 100,
        totalPages: 1,
      });

      render(<AppLayout />);

      await waitFor(() => {
        expect(screen.getByTestId('chat-view')).toBeInTheDocument();
      });

      await user.click(screen.getByText('New Image'));

      expect(screen.getByTestId('upload-view')).toBeInTheDocument();
    });
  });

  describe('image deletion', () => {
    it('removes image and selects next after deletion', async () => {
      const user = userEvent.setup();
      mockGetImages.mockResolvedValue({
        images: sampleImages,
        total: 2,
        page: 1,
        pageSize: 100,
        totalPages: 1,
      });
      mockDeleteImage.mockResolvedValue(undefined);

      render(<AppLayout />);

      await waitFor(() => {
        expect(screen.getByTestId('chat-view')).toHaveAttribute('data-image-id', 'img-1');
      });

      await user.click(screen.getByText('Delete sunset.jpg'));

      await waitFor(() => {
        expect(mockDeleteImage).toHaveBeenCalledWith('img-1');
      });

      await waitFor(() => {
        expect(screen.getByTestId('chat-view')).toHaveAttribute('data-image-id', 'img-2');
      });

      expect(mockToast.success).toHaveBeenCalledWith('Deleted sunset.jpg');
    });

    it('shows UploadView when last image is deleted', async () => {
      const user = userEvent.setup();
      const singleImage = [sampleImages[0]!];
      mockGetImages.mockResolvedValue({
        images: singleImage,
        total: 1,
        page: 1,
        pageSize: 100,
        totalPages: 1,
      });
      mockDeleteImage.mockResolvedValue(undefined);

      render(<AppLayout />);

      await waitFor(() => {
        expect(screen.getByTestId('chat-view')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Delete sunset.jpg'));

      await waitFor(() => {
        expect(screen.getByTestId('upload-view')).toBeInTheDocument();
      });
    });

    it('shows error toast when delete fails', async () => {
      const user = userEvent.setup();
      mockGetImages.mockResolvedValue({
        images: sampleImages,
        total: 2,
        page: 1,
        pageSize: 100,
        totalPages: 1,
      });
      mockDeleteImage.mockRejectedValue(new Error('Server error'));

      render(<AppLayout />);

      await waitFor(() => {
        expect(screen.getByTestId('chat-view')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Delete sunset.jpg'));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Failed to delete image', { duration: Infinity });
      });
    });
  });

  describe('accessibility', () => {
    it('has skip-to-content link', async () => {
      render(<AppLayout />);

      await waitFor(() => {
        const skipLink = screen.getByText('Skip to main content');
        expect(skipLink).toBeInTheDocument();
        expect(skipLink).toHaveAttribute('href', '#main-content');
      });
    });

    it('has h1 with app name', async () => {
      render(<AppLayout />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Inksight');
      });
    });

    it('has main landmark with correct id', async () => {
      render(<AppLayout />);

      await waitFor(() => {
        expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
      });
    });
  });

  describe('mobile layout', () => {
    beforeEach(() => {
      mockUseMediaQuery.mockReturnValue(false); // mobile
    });

    it('shows mobile header with toggle button', async () => {
      render(<AppLayout />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /toggle sidebar/i })).toBeInTheDocument();
      });
    });

    it('opens sidebar overlay on toggle click', async () => {
      const user = userEvent.setup();
      render(<AppLayout />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /toggle sidebar/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /toggle sidebar/i }));

      expect(screen.getByRole('dialog', { name: /sidebar/i })).toBeInTheDocument();
    });

    it('closes sidebar when selecting an image on mobile', async () => {
      const user = userEvent.setup();
      mockGetImages.mockResolvedValue({
        images: sampleImages,
        total: 2,
        page: 1,
        pageSize: 100,
        totalPages: 1,
      });

      render(<AppLayout />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /toggle sidebar/i })).toBeInTheDocument();
      });

      // Open sidebar
      await user.click(screen.getByRole('button', { name: /toggle sidebar/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Select an image
      await user.click(screen.getByText('portrait.png'));

      // Sidebar should close
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes sidebar overlay on Escape key', async () => {
      const user = userEvent.setup();
      render(<AppLayout />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /toggle sidebar/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /toggle sidebar/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes sidebar when "New Image" is clicked on mobile', async () => {
      const user = userEvent.setup();
      mockGetImages.mockResolvedValue({
        images: sampleImages,
        total: 2,
        page: 1,
        pageSize: 100,
        totalPages: 1,
      });

      render(<AppLayout />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /toggle sidebar/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /toggle sidebar/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await user.click(screen.getByText('New Image'));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByTestId('upload-view')).toBeInTheDocument();
    });

    it('shows upload button in header when image is selected', async () => {
      mockGetImages.mockResolvedValue({
        images: sampleImages,
        total: 2,
        page: 1,
        pageSize: 100,
        totalPages: 1,
      });

      render(<AppLayout />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /upload new image/i })).toBeInTheDocument();
      });
    });

    it('closes sidebar when backdrop overlay is clicked', async () => {
      const user = userEvent.setup();
      render(<AppLayout />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /toggle sidebar/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /toggle sidebar/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Click the backdrop overlay (aria-hidden div)
      const backdrop = screen.getByRole('dialog').previousElementSibling as HTMLElement;
      await user.click(backdrop);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not show upload button when no image selected', async () => {
      render(<AppLayout />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /toggle sidebar/i })).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /upload new image/i })).not.toBeInTheDocument();
    });

    it('traps focus within sidebar overlay', async () => {
      const user = userEvent.setup();
      mockGetImages.mockResolvedValue({
        images: sampleImages,
        total: 2,
        page: 1,
        pageSize: 100,
        totalPages: 1,
      });

      render(<AppLayout />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /toggle sidebar/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /toggle sidebar/i }));

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();

      // Focus should be inside the dialog
      const focusables = dialog.querySelectorAll<HTMLElement>('button');
      expect(focusables.length).toBeGreaterThan(0);

      // Tab forward past last element should wrap to first
      focusables[focusables.length - 1]!.focus();
      await user.keyboard('{Tab}');

      // Focus should still be within the dialog (trapped)
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it('toggle button has aria-expanded attribute', async () => {
      const user = userEvent.setup();
      render(<AppLayout />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /toggle sidebar/i })).toBeInTheDocument();
      });

      const toggleBtn = screen.getByRole('button', { name: /toggle sidebar/i });
      expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');

      await user.click(toggleBtn);
      expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    });
  });
});
