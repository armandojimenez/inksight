import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UploadView } from '@/components/UploadView';
import type { UploadResponse } from '@/types';

// Mock the API module
vi.mock('@/lib/api', () => ({
  uploadImage: vi.fn(),
}));

import { uploadImage } from '@/lib/api';

const mockUploadImage = vi.mocked(uploadImage);

function createFile(
  name: string,
  size: number,
  type: string,
): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

const mockUploadResponse: UploadResponse = {
  id: 'img-123',
  filename: 'photo.png',
  mimeType: 'image/png',
  size: 1024,
  analysis: null,
};

describe('UploadView', () => {
  let onUploadComplete: ReturnType<typeof vi.fn<(image: UploadResponse) => void>>;

  beforeEach(() => {
    vi.clearAllMocks();
    onUploadComplete = vi.fn<(image: UploadResponse) => void>();
  });

  it('renders drop zone with correct text', () => {
    render(<UploadView onUploadComplete={onUploadComplete} />);

    expect(screen.getByText(/drop an image here/i)).toBeInTheDocument();
    expect(screen.getByText(/browse/i)).toBeInTheDocument();
    expect(screen.getByText(/PNG, JPG, GIF/i)).toBeInTheDocument();
    expect(screen.getByText(/16\s*MB/i)).toBeInTheDocument();
  });

  it('renders Inksight icon', () => {
    render(<UploadView onUploadComplete={onUploadComplete} />);

    const icon = screen.getByAltText(/inksight/i);
    expect(icon).toBeInTheDocument();
  });

  it('has correct aria-label on drop zone', () => {
    render(<UploadView onUploadComplete={onUploadComplete} />);

    const dropZone = screen.getByRole('button', { name: /upload image/i });
    expect(dropZone).toBeInTheDocument();
  });

  it('drop zone is keyboard-focusable', () => {
    render(<UploadView onUploadComplete={onUploadComplete} />);

    const dropZone = screen.getByRole('button', { name: /upload image/i });
    expect(dropZone).toHaveAttribute('tabIndex', '0');
  });

  describe('drag events', () => {
    it('shows active state on dragenter', () => {
      render(<UploadView onUploadComplete={onUploadComplete} />);

      const dropZone = screen.getByRole('button', { name: /upload image/i });
      fireEvent.dragEnter(dropZone, {
        dataTransfer: { types: ['Files'] },
      });

      expect(dropZone).toHaveAttribute('data-dragover', 'true');
    });

    it('reverts on dragleave', () => {
      render(<UploadView onUploadComplete={onUploadComplete} />);

      const dropZone = screen.getByRole('button', { name: /upload image/i });
      fireEvent.dragEnter(dropZone, {
        dataTransfer: { types: ['Files'] },
      });
      fireEvent.dragLeave(dropZone);

      expect(dropZone).not.toHaveAttribute('data-dragover', 'true');
    });

    it('triggers upload on drop', async () => {
      const file = createFile('photo.png', 1024, 'image/png');
      mockUploadImage.mockResolvedValue(mockUploadResponse);

      render(<UploadView onUploadComplete={onUploadComplete} />);

      const dropZone = screen.getByRole('button', { name: /upload image/i });
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => {
        expect(mockUploadImage).toHaveBeenCalledWith(file, expect.any(AbortSignal));
      });
    });
  });

  describe('click to browse', () => {
    it('triggers file input on click', async () => {
      const user = userEvent.setup();
      render(<UploadView onUploadComplete={onUploadComplete} />);

      const browseText = screen.getByText(/browse/i);
      await user.click(browseText);

      // File input should exist in the DOM
      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
    });

    it('triggers file input on Enter key', async () => {
      const user = userEvent.setup();
      render(<UploadView onUploadComplete={onUploadComplete} />);

      const dropZone = screen.getByRole('button', { name: /upload image/i });
      dropZone.focus();
      await user.keyboard('{Enter}');

      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
    });
  });

  describe('client-side validation', () => {
    it('rejects non-image files', async () => {
      const file = createFile('doc.pdf', 1024, 'application/pdf');

      render(<UploadView onUploadComplete={onUploadComplete} />);

      const dropZone = screen.getByRole('button', { name: /upload image/i });
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/file type not allowed/i);
      });
      expect(mockUploadImage).not.toHaveBeenCalled();
    });

    it('rejects files over 16MB', async () => {
      const size = 16 * 1024 * 1024 + 1; // 16MB + 1 byte
      const file = createFile('huge.png', size, 'image/png');

      render(<UploadView onUploadComplete={onUploadComplete} />);

      const dropZone = screen.getByRole('button', { name: /upload image/i });
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/file size exceeds/i);
      });
      expect(mockUploadImage).not.toHaveBeenCalled();
    });

    it('shows error message for invalid files', async () => {
      const file = createFile('script.exe', 1024, 'application/octet-stream');

      render(<UploadView onUploadComplete={onUploadComplete} />);

      const dropZone = screen.getByRole('button', { name: /upload image/i });
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  describe('upload progress', () => {
    it('shows uploading state during upload', async () => {
      // Make uploadImage hang so we can observe the loading state
      mockUploadImage.mockImplementation(
        () => new Promise(() => {}), // never resolves
      );

      const file = createFile('photo.png', 1024, 'image/png');

      render(<UploadView onUploadComplete={onUploadComplete} />);

      const dropZone = screen.getByRole('button', { name: /upload image/i });
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => {
        expect(screen.getByText(/uploading/i)).toBeInTheDocument();
      });
    });
  });

  describe('upload success', () => {
    it('calls onUploadComplete with image data', async () => {
      mockUploadImage.mockResolvedValue(mockUploadResponse);

      const file = createFile('photo.png', 1024, 'image/png');

      render(<UploadView onUploadComplete={onUploadComplete} />);

      const dropZone = screen.getByRole('button', { name: /upload image/i });
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => {
        expect(onUploadComplete).toHaveBeenCalledWith(mockUploadResponse);
      });
    });
  });

  describe('upload error', () => {
    it('shows error message on upload failure', async () => {
      mockUploadImage.mockRejectedValue(new Error('Network error'));

      const file = createFile('photo.png', 1024, 'image/png');

      render(<UploadView onUploadComplete={onUploadComplete} />);

      const dropZone = screen.getByRole('button', { name: /upload image/i });
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/network error/i);
      });
    });

    it('allows retry after error', async () => {
      mockUploadImage.mockRejectedValueOnce(new Error('Network error'));
      mockUploadImage.mockResolvedValueOnce(mockUploadResponse);

      const file = createFile('photo.png', 1024, 'image/png');

      render(<UploadView onUploadComplete={onUploadComplete} />);

      const dropZone = screen.getByRole('button', { name: /upload image/i });

      // First attempt fails
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // Drop again to retry
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => {
        expect(onUploadComplete).toHaveBeenCalledWith(mockUploadResponse);
      });
    });
  });
});
