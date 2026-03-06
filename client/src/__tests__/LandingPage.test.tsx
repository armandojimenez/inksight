import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LandingPage } from '@/components/LandingPage';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

function createFile(name: string, type: string, size = 1024) {
  const content = new Uint8Array(size);
  return new File([content], name, { type });
}

describe('LandingPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the hero heading', () => {
      renderLanding();
      expect(
        screen.getByRole('heading', { level: 1 }),
      ).toHaveTextContent(/visual intelligence/i);
    });

    it('renders the nav with Inksight branding', () => {
      renderLanding();
      const brandElements = screen.getAllByText('INKSIGHT');
      expect(brandElements.length).toBeGreaterThanOrEqual(1);
    });

    it('shows Inkit branding with logo', () => {
      renderLanding();
      const inkitLogos = screen.getAllByRole('img', { name: /inkit/i });
      expect(inkitLogos.length).toBeGreaterThanOrEqual(1);
    });

    it('renders all four feature sections', () => {
      renderLanding();
      expect(screen.getByText('Upload any image instantly')).toBeInTheDocument();
      expect(screen.getByText('AI that sees the details')).toBeInTheDocument();
      expect(screen.getByText('Have a real conversation')).toBeInTheDocument();
      expect(screen.getByText(/watch ai think/i)).toBeInTheDocument();
    });

    it('renders the features header', () => {
      renderLanding();
      expect(screen.getByText(/everything you need/i)).toBeInTheDocument();
    });

    it('renders the footer CTA', () => {
      renderLanding();
      expect(
        screen.getByRole('heading', { name: /ready to see what/i }),
      ).toBeInTheDocument();
    });

    it('renders the footer with tech stack', () => {
      renderLanding();
      expect(screen.getByText(/built with nestjs, react/i)).toBeInTheDocument();
    });

    it('renders static product mockups with fixed dimensions', () => {
      renderLanding();
      const chatMessages = screen.getByText('What objects are in the foreground?');
      expect(chatMessages).toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('navigates to /app when "Open app" nav button is clicked', async () => {
      const user = userEvent.setup();
      renderLanding();

      await user.click(screen.getByRole('button', { name: /open app/i }));
      expect(mockNavigate).toHaveBeenCalledWith('/app');
    });

    it('navigates to /app when "Try it now" hero button is clicked', async () => {
      const user = userEvent.setup();
      renderLanding();

      await user.click(screen.getByRole('button', { name: /try it now/i }));
      expect(mockNavigate).toHaveBeenCalledWith('/app');
    });

    it('navigates to /app when "Upload your first image" footer button is clicked', async () => {
      const user = userEvent.setup();
      renderLanding();

      await user.click(screen.getByRole('button', { name: /upload your first image/i }));
      expect(mockNavigate).toHaveBeenCalledWith('/app');
    });

    it('navigates to /app when feature arrow links are clicked', async () => {
      const user = userEvent.setup();
      renderLanding();

      await user.click(screen.getByText('Try uploading now'));
      expect(mockNavigate).toHaveBeenCalledWith('/app');
    });

    it('scrolls to features when "Explore features" is clicked', async () => {
      const user = userEvent.setup();
      const scrollSpy = vi.fn();
      renderLanding();

      const section = document.getElementById('features');
      expect(section).not.toBeNull();
      section!.scrollIntoView = scrollSpy;

      await user.click(
        screen.getByRole('button', { name: /explore features/i }),
      );

      expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth' });
    });

    it('uses instant scroll when prefers-reduced-motion is set', async () => {
      const user = userEvent.setup();
      const scrollSpy = vi.fn();

      // Mock matchMedia to return prefers-reduced-motion: true
      const originalMatchMedia = window.matchMedia;
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: (query: string) => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }),
      });

      renderLanding();

      const section = document.getElementById('features');
      expect(section).not.toBeNull();
      section!.scrollIntoView = scrollSpy;

      await user.click(
        screen.getByRole('button', { name: /explore features/i }),
      );

      expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'auto' });

      // Restore
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: originalMatchMedia,
      });
    });
  });

  describe('interactive upload demo', () => {
    it('shows empty upload state by default', () => {
      renderLanding();
      expect(screen.getByText(/drop an image here/i)).toBeInTheDocument();
      expect(screen.getByText(/PNG, JPG, GIF up to 16 MB/i)).toBeInTheDocument();
    });

    it('shows image preview after uploading a valid image', () => {
      // Mock URL.createObjectURL for jsdom
      const mockUrl = 'blob:http://localhost/fake-image';
      vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => mockUrl) });

      renderLanding();

      const input = screen.getByLabelText(/upload an image/i);
      const file = createFile('photo.png', 'image/png', 2048);

      fireEvent.change(input, { target: { files: [file] } });

      expect(screen.getByAltText('Uploaded preview')).toBeInTheDocument();
      expect(screen.getByText('photo.png')).toBeInTheDocument();
      expect(screen.getByText('2.0 KB')).toBeInTheDocument();

      vi.unstubAllGlobals();
    });

    it('shows error when a non-image file is uploaded', () => {
      renderLanding();

      const input = screen.getByLabelText(/upload an image/i);
      const file = createFile('report.pdf', 'application/pdf');

      fireEvent.change(input, { target: { files: [file] } });

      expect(screen.getByRole('alert')).toHaveTextContent(
        /report\.pdf.*is not an image/i,
      );
    });

    it('clears error after uploading a valid image', () => {
      const mockUrl = 'blob:http://localhost/fake-image';
      vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => mockUrl) });

      renderLanding();

      const input = screen.getByLabelText(/upload an image/i);

      fireEvent.change(input, { target: { files: [createFile('doc.txt', 'text/plain')] } });
      expect(screen.getByRole('alert')).toBeInTheDocument();

      fireEvent.change(input, { target: { files: [createFile('cat.jpg', 'image/jpeg', 5000)] } });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText('cat.jpg')).toBeInTheDocument();

      vi.unstubAllGlobals();
    });

    it('handles drag and drop of valid image', () => {
      renderLanding();

      const dropZone = screen.getByText(/drop an image here/i).closest('button')!;
      const file = createFile('dropped.png', 'image/png', 512);

      fireEvent.dragOver(dropZone, { dataTransfer: { files: [] } });
      expect(dropZone.className).toContain('border-primary-400');

      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
      });

      expect(screen.getByText('dropped.png')).toBeInTheDocument();
      expect(screen.getByText('512 B')).toBeInTheDocument();
    });

    it('handles drag and drop of non-image file', () => {
      renderLanding();

      const dropZone = screen.getByText(/drop an image here/i).closest('button')!;
      const file = createFile('data.csv', 'text/csv');

      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
      });

      expect(screen.getByRole('alert')).toHaveTextContent(/data\.csv.*is not an image/i);
    });

    it('removes drag highlight on drag leave', () => {
      renderLanding();

      const dropZone = screen.getByText(/drop an image here/i).closest('button')!;

      fireEvent.dragOver(dropZone, { dataTransfer: { files: [] } });
      expect(dropZone.className).toContain('border-primary-400');

      fireEvent.dragLeave(dropZone);
      expect(dropZone.className).not.toContain('border-primary-400');
    });

    it('formats file sizes correctly', async () => {
      const user = userEvent.setup();
      renderLanding();

      const input = screen.getByLabelText(/upload an image/i);

      // Test MB formatting
      const bigFile = createFile('large.png', 'image/png', 2 * 1024 * 1024);
      await user.upload(input, bigFile);
      expect(screen.getByText('2.0 MB')).toBeInTheDocument();
    });

    it('opens file picker when drop zone is clicked', async () => {
      const user = userEvent.setup();
      renderLanding();

      const dropZone = screen.getByText(/drop an image here/i).closest('button')!;
      const input = screen.getByLabelText(/upload an image/i) as HTMLInputElement;
      const clickSpy = vi.spyOn(input, 'click');

      await user.click(dropZone);
      expect(clickSpy).toHaveBeenCalled();
    });

    it('revokes object URL when a new file is uploaded', () => {
      const mockUrl1 = 'blob:http://localhost/fake-1';
      const mockUrl2 = 'blob:http://localhost/fake-2';
      let callCount = 0;
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', {
        ...URL,
        createObjectURL: vi.fn(() => {
          callCount++;
          return callCount === 1 ? mockUrl1 : mockUrl2;
        }),
        revokeObjectURL,
      });

      renderLanding();
      const input = screen.getByLabelText(/upload an image/i);

      fireEvent.change(input, { target: { files: [createFile('first.png', 'image/png')] } });
      expect(screen.getByText('first.png')).toBeInTheDocument();

      fireEvent.change(input, { target: { files: [createFile('second.png', 'image/png')] } });
      expect(revokeObjectURL).toHaveBeenCalledWith(mockUrl1);
      expect(screen.getByText('second.png')).toBeInTheDocument();

      vi.unstubAllGlobals();
    });

    it('revokes object URL on unmount', () => {
      const mockUrl = 'blob:http://localhost/fake-unmount';
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', {
        ...URL,
        createObjectURL: vi.fn(() => mockUrl),
        revokeObjectURL,
      });

      const { unmount } = renderLanding();
      const input = screen.getByLabelText(/upload an image/i);
      fireEvent.change(input, { target: { files: [createFile('test.png', 'image/png')] } });

      unmount();
      expect(revokeObjectURL).toHaveBeenCalledWith(mockUrl);

      vi.unstubAllGlobals();
    });

    it('shows error border with error-500 class for invalid files', () => {
      renderLanding();
      const dropZone = screen.getByText(/drop an image here/i).closest('button')!;
      const input = screen.getByLabelText(/upload an image/i);

      fireEvent.change(input, { target: { files: [createFile('bad.txt', 'text/plain')] } });
      expect(dropZone.className).toContain('border-error-500');
    });

    it('uses lazy loading for below-fold images', () => {
      renderLanding();
      const lazyImages = document.querySelectorAll('img[loading="lazy"]');
      expect(lazyImages.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('accessibility', () => {
    it('has a navigation landmark', () => {
      renderLanding();
      expect(
        screen.getByRole('navigation', { name: /landing page/i }),
      ).toBeInTheDocument();
    });

    it('has proper heading hierarchy (h1, h2, h3)', () => {
      renderLanding();

      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toBeInTheDocument();

      const h2s = screen.getAllByRole('heading', { level: 2 });
      expect(h2s.length).toBeGreaterThanOrEqual(2);

      const h3s = screen.getAllByRole('heading', { level: 3 });
      expect(h3s.length).toBeGreaterThanOrEqual(4);
    });

    it('all interactive buttons are keyboard accessible', () => {
      renderLanding();
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).not.toHaveAttribute('tabindex', '-1');
      });
    });

    it('decorative elements are hidden from assistive technology', () => {
      renderLanding();
      const hidden = document.querySelectorAll('[aria-hidden="true"]');
      expect(hidden.length).toBeGreaterThan(0);
    });

    it('upload error has role="alert" for screen readers', () => {
      renderLanding();

      const input = screen.getByLabelText(/upload an image/i);
      fireEvent.change(input, { target: { files: [createFile('bad.txt', 'text/plain')] } });

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
    });

    it('has a skip navigation link', () => {
      renderLanding();
      const skipLink = screen.getByText('Skip to main content');
      expect(skipLink).toBeInTheDocument();
      expect(skipLink.tagName).toBe('A');
      expect(skipLink).toHaveAttribute('href', '#main-content');
    });

    it('has a main landmark', () => {
      renderLanding();
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    });

    it('has labeled sections for screen reader navigation', () => {
      renderLanding();
      const sections = document.querySelectorAll('section[aria-label]');
      const labels = Array.from(sections).map(s => s.getAttribute('aria-label'));
      expect(labels).toContain('Hero');
      expect(labels).toContain('Features');
      expect(labels).toContain('Call to action');
    });

    it('marks static mockups as presentational images', () => {
      renderLanding();
      expect(screen.getByRole('img', { name: 'AI image analysis demo' })).toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'Chat conversation demo' })).toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'Real-time streaming demo' })).toBeInTheDocument();
    });
  });

  describe('nav scroll behavior', () => {
    it('adds solid background on scroll', () => {
      renderLanding();
      const nav = screen.getByRole('navigation', { name: /landing page/i });

      expect(nav.className).toContain('bg-transparent');

      Object.defineProperty(window, 'scrollY', { value: 100, writable: true });
      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });

      expect(nav.className).toContain('bg-white');
    });
  });
});
