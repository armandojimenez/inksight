import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '@/components/Sidebar';
import type { ImageData } from '@/types';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    getImageFileUrl: vi.fn((id: string) => `/api/images/${id}/file`),
  };
});

function createImage(overrides: Partial<ImageData> = {}): ImageData {
  const id = overrides.id ?? `img-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    originalFilename: 'photo.png',
    mimeType: 'image/png',
    size: 1024,
    messageCount: 0,
    createdAt: '2026-03-05T12:00:00Z',
    ...overrides,
  };
}

const sampleImages: ImageData[] = [
  createImage({ id: 'img-1', originalFilename: 'sunset.jpg', messageCount: 3 }),
  createImage({ id: 'img-2', originalFilename: 'portrait.png', messageCount: 0 }),
  createImage({ id: 'img-3', originalFilename: 'landscape.gif', messageCount: 12 }),
];

describe('Sidebar', () => {
  let onSelectImage: ReturnType<typeof vi.fn<(id: string) => void>>;
  let onDeleteImage: ReturnType<typeof vi.fn<(id: string) => void>>;
  let onNewUpload: ReturnType<typeof vi.fn<() => void>>;
  let onToggle: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    vi.clearAllMocks();
    onSelectImage = vi.fn<(id: string) => void>();
    onDeleteImage = vi.fn<(id: string) => void>();
    onNewUpload = vi.fn<() => void>();
    onToggle = vi.fn<() => void>();
  });

  afterEach(() => {
    cleanup();
  });

  function renderSidebar(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
    return render(
      <Sidebar
        images={sampleImages}
        selectedImageId={null}
        onSelectImage={onSelectImage}
        onDeleteImage={onDeleteImage}
        onNewUpload={onNewUpload}
        isOpen={true}
        onToggle={onToggle}
        {...overrides}
      />,
    );
  }

  describe('logo', () => {
    it('renders Inksight logo image', () => {
      renderSidebar();

      const logo = screen.getByAltText(/inksight/i);
      expect(logo).toBeInTheDocument();
      expect(logo.tagName).toBe('IMG');
    });
  });

  describe('image list', () => {
    it('renders list of images with filenames', () => {
      renderSidebar();

      expect(screen.getByText('sunset.jpg')).toBeInTheDocument();
      expect(screen.getByText('portrait.png')).toBeInTheDocument();
      expect(screen.getByText('landscape.gif')).toBeInTheDocument();
    });

    it('renders thumbnails with 4px radius', () => {
      renderSidebar();

      const thumbnails = screen.getAllByRole('img', { name: /thumbnail/i });
      expect(thumbnails).toHaveLength(3);
      for (const thumb of thumbnails) {
        expect(thumb).toHaveClass('rounded');
      }
    });

    it('shows message count per image', () => {
      renderSidebar();

      expect(screen.getByText('3 messages')).toBeInTheDocument();
      expect(screen.getByText('0 messages')).toBeInTheDocument();
      expect(screen.getByText('12 messages')).toBeInTheDocument();
    });

    it('shows singular "message" for count of 1', () => {
      const images = [createImage({ id: 'img-single', messageCount: 1 })];
      renderSidebar({ images });

      expect(screen.getByText('1 message')).toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('calls onSelectImage with image ID on click', async () => {
      const user = userEvent.setup();
      renderSidebar();

      await user.click(screen.getByText('sunset.jpg'));

      expect(onSelectImage).toHaveBeenCalledWith('img-1');
    });

    it('active image has highlighted background and left border', () => {
      renderSidebar({ selectedImageId: 'img-1' });

      const activeItem = screen.getByText('sunset.jpg').closest('[data-image-item]')!;
      expect(activeItem).toHaveAttribute('data-active', 'true');
    });

    it('non-active images do not have active state', () => {
      renderSidebar({ selectedImageId: 'img-1' });

      const inactiveItem = screen.getByText('portrait.png').closest('[data-image-item]')!;
      expect(inactiveItem).not.toHaveAttribute('data-active', 'true');
    });
  });

  describe('deletion', () => {
    it('has a delete button on each image item', () => {
      renderSidebar();

      const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
      expect(deleteButtons).toHaveLength(3);
    });

    it('clicking delete opens confirmation dialog', async () => {
      const user = userEvent.setup();
      renderSidebar();

      const deleteButton = screen.getAllByRole('button', { name: /delete/i })[0]!;
      await user.click(deleteButton);

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    });

    it('confirming delete calls onDeleteImage with image ID', async () => {
      const user = userEvent.setup();
      renderSidebar();

      const deleteButton = screen.getAllByRole('button', { name: /delete/i })[0]!;
      await user.click(deleteButton);

      const confirmButton = screen.getByRole('button', { name: /confirm|yes|delete$/i });
      await user.click(confirmButton);

      expect(onDeleteImage).toHaveBeenCalledWith('img-1');
    });

    it('cancelling delete closes dialog without calling onDeleteImage', async () => {
      const user = userEvent.setup();
      renderSidebar();

      const deleteButton = screen.getAllByRole('button', { name: /delete/i })[0]!;
      await user.click(deleteButton);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(onDeleteImage).not.toHaveBeenCalled();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });

  describe('new image button', () => {
    it('renders "+ New Image" button', () => {
      renderSidebar();

      expect(screen.getByRole('button', { name: /new image/i })).toBeInTheDocument();
    });

    it('calls onNewUpload on click', async () => {
      const user = userEvent.setup();
      renderSidebar();

      await user.click(screen.getByRole('button', { name: /new image/i }));

      expect(onNewUpload).toHaveBeenCalled();
    });
  });

  describe('empty state', () => {
    it('shows encouraging message when no images', () => {
      renderSidebar({ images: [] });

      expect(screen.getByText(/upload an image/i)).toBeInTheDocument();
    });

    it('still shows new image button in empty state', () => {
      renderSidebar({ images: [] });

      expect(screen.getByRole('button', { name: /new image/i })).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has navigation landmark', () => {
      renderSidebar();

      expect(screen.getByRole('navigation', { name: /image gallery/i })).toBeInTheDocument();
    });

    it('image list uses list role', () => {
      renderSidebar();

      expect(screen.getByRole('list')).toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });
  });
});
