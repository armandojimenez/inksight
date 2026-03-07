import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UploadView } from '@/components/UploadView';
import type { UploadResponse } from '@/types';

// Preserve all exports from the API module; only override uploadImage.
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, uploadImage: vi.fn() };
});

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

  afterEach(() => {
    cleanup();
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

    // InksightIcon is a PNG img element
    const icon = screen.getByRole('button', { name: /upload image/i });
    const img = icon.querySelector('img[src="/inksight-icon.png"]');
    expect(img).toBeInTheDocument();
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

  // fireEvent is used for drag events because userEvent v14 does not
  // support the full DnD event sequence (dragenter/dragover/dragleave/drop).
  // userEvent is used for click/keyboard interactions where it provides
  // more realistic browser event simulation.
  describe('drag events', () => {
    it('starts without dragover state', () => {
      render(<UploadView onUploadComplete={onUploadComplete} />);

      const dropZone = screen.getByRole('button', { name: /upload image/i });
      expect(dropZone).not.toHaveAttribute('data-dragover');
    });

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

      expect(dropZone).not.toHaveAttribute('data-dragover');
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
    it('triggers file input click on click', async () => {
      const user = userEvent.setup();
      render(<UploadView onUploadComplete={onUploadComplete} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const clickSpy = vi.spyOn(fileInput, 'click');

      const browseText = screen.getByText(/browse/i);
      await user.click(browseText);

      expect(clickSpy).toHaveBeenCalled();
      clickSpy.mockRestore();
    });

    it('triggers file input click on Enter key', async () => {
      const user = userEvent.setup();
      render(<UploadView onUploadComplete={onUploadComplete} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const clickSpy = vi.spyOn(fileInput, 'click');

      const dropZone = screen.getByRole('button', { name: /upload image/i });
      dropZone.focus();
      await user.keyboard('{Enter}');

      expect(clickSpy).toHaveBeenCalled();
      clickSpy.mockRestore();
    });

    it('triggers file input click on Space key', async () => {
      const user = userEvent.setup();
      render(<UploadView onUploadComplete={onUploadComplete} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const clickSpy = vi.spyOn(fileInput, 'click');

      const dropZone = screen.getByRole('button', { name: /upload image/i });
      dropZone.focus();
      await user.keyboard(' ');

      expect(clickSpy).toHaveBeenCalled();
      clickSpy.mockRestore();
    });
  });

  describe('file picker onChange', () => {
    it('uploads file selected via file input', async () => {
      const user = userEvent.setup();
      mockUploadImage.mockResolvedValue(mockUploadResponse);

      render(<UploadView onUploadComplete={onUploadComplete} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createFile('photo.png', 1024, 'image/png');

      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(mockUploadImage).toHaveBeenCalledWith(file, expect.any(AbortSignal));
      });
      expect(onUploadComplete).toHaveBeenCalledWith(mockUploadResponse);
    });

    it('resets file input value after selection so same file can be re-selected', async () => {
      const user = userEvent.setup();
      mockUploadImage.mockResolvedValue(mockUploadResponse);

      render(<UploadView onUploadComplete={onUploadComplete} />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createFile('photo.png', 1024, 'image/png');

      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(onUploadComplete).toHaveBeenCalled();
      });

      expect(fileInput.value).toBe('');
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

    it('accepts .gif files', async () => {
      const file = createFile('animation.gif', 1024, 'image/gif');
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

    it('accepts .jpeg files', async () => {
      const file = createFile('photo.jpeg', 1024, 'image/jpeg');
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

    it('rejects multiple files with a helpful message', async () => {
      const file1 = createFile('a.png', 1024, 'image/png');
      const file2 = createFile('b.png', 1024, 'image/png');

      render(<UploadView onUploadComplete={onUploadComplete} />);

      const dropZone = screen.getByRole('button', { name: /upload image/i });
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file1, file2] },
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/only one image/i);
      });
      expect(mockUploadImage).not.toHaveBeenCalled();
    });
  });

  describe('upload progress', () => {
    it('shows uploading state during upload', async () => {
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

    it('sets aria-busy during upload', async () => {
      mockUploadImage.mockImplementation(
        () => new Promise(() => {}),
      );

      const file = createFile('photo.png', 1024, 'image/png');

      render(<UploadView onUploadComplete={onUploadComplete} />);

      const dropZone = screen.getByRole('button', { name: /upload image/i });
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => {
        expect(dropZone).toHaveAttribute('aria-busy', 'true');
      });
    });

    it('blocks drop during active upload', async () => {
      mockUploadImage.mockImplementation(
        () => new Promise(() => {}),
      );

      const file1 = createFile('first.png', 1024, 'image/png');
      const file2 = createFile('second.png', 1024, 'image/png');

      render(<UploadView onUploadComplete={onUploadComplete} />);

      const dropZone = screen.getByRole('button', { name: /upload image/i });

      // Start first upload
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file1] },
      });

      await waitFor(() => {
        expect(screen.getByText(/uploading/i)).toBeInTheDocument();
      });

      // Second drop is ignored
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file2] },
      });

      expect(mockUploadImage).toHaveBeenCalledTimes(1);
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

      // Alert should be gone after successful retry
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('preserves error state through drag-then-leave without drop', async () => {
      const file = createFile('doc.pdf', 1024, 'application/pdf');

      render(<UploadView onUploadComplete={onUploadComplete} />);

      const dropZone = screen.getByRole('button', { name: /upload image/i });

      // Trigger an error
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // Drag over and leave without dropping
      fireEvent.dragEnter(dropZone, {
        dataTransfer: { types: ['Files'] },
      });
      fireEvent.dragLeave(dropZone);

      // Error should still be visible
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('abort on unmount', () => {
    it('aborts in-flight upload when component unmounts', async () => {
      let capturedSignal: AbortSignal | undefined;
      mockUploadImage.mockImplementation((_file, signal) => {
        capturedSignal = signal;
        return new Promise(() => {}); // never resolves
      });

      const file = createFile('photo.png', 1024, 'image/png');

      const { unmount } = render(<UploadView onUploadComplete={onUploadComplete} />);

      const dropZone = screen.getByRole('button', { name: /upload image/i });
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => {
        expect(capturedSignal).toBeDefined();
      });

      expect(capturedSignal!.aborted).toBe(false);

      unmount();

      expect(capturedSignal!.aborted).toBe(true);
    });
  });

  describe('first-time welcome', () => {
    it('shows welcome headline when isFirstTime is true', () => {
      render(<UploadView onUploadComplete={onUploadComplete} isFirstTime />);

      expect(screen.getByText('Welcome to Inksight')).toBeInTheDocument();
      expect(screen.getByText(/upload an image and start a conversation/i)).toBeInTheDocument();
    });

    it('does not show welcome headline by default', () => {
      render(<UploadView onUploadComplete={onUploadComplete} />);

      expect(screen.queryByText('Welcome to Inksight')).not.toBeInTheDocument();
    });

    it('still shows the dropzone when isFirstTime is true', () => {
      render(<UploadView onUploadComplete={onUploadComplete} isFirstTime />);

      expect(screen.getByRole('button', { name: /upload image/i })).toBeInTheDocument();
      expect(screen.getByText(/drop an image here/i)).toBeInTheDocument();
    });

    it('shows Inksight logo in welcome state', () => {
      render(<UploadView onUploadComplete={onUploadComplete} isFirstTime />);

      const logo = screen.getByAltText('Inksight');
      expect(logo).toBeInTheDocument();
      expect(logo.tagName).toBe('IMG');
    });

    it('shows how-it-works steps as a semantic ordered list', () => {
      render(<UploadView onUploadComplete={onUploadComplete} isFirstTime />);

      const list = screen.getByRole('list');
      expect(list).toBeInTheDocument();
      expect(list.tagName).toBe('OL');

      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(3);

      expect(screen.getByText('Upload')).toBeInTheDocument();
      expect(screen.getByText('Analyze')).toBeInTheDocument();
      expect(screen.getByText('Chat')).toBeInTheDocument();
    });

    it('does not show how-it-works steps when not first time', () => {
      render(<UploadView onUploadComplete={onUploadComplete} />);

      expect(screen.queryByRole('list')).not.toBeInTheDocument();
      expect(screen.queryByText('Analyze')).not.toBeInTheDocument();
      expect(screen.queryByText('Chat')).not.toBeInTheDocument();
    });
  });
});
