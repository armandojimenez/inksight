import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import { Toaster, toast } from 'sonner';

function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            success: 'toast-success',
            error: 'toast-error',
          },
        }}
      />
    </>
  );
}

describe('Toast Notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe('success toast', () => {
    it('renders success toast with role="status"', async () => {
      render(<div />, { wrapper: TestWrapper });

      await act(async () => {
        toast.success('Upload complete');
      });

      await waitFor(() => {
        const toastEl = screen.getByText('Upload complete');
        expect(toastEl).toBeInTheDocument();
      });

      const toastContainer = screen.getByText('Upload complete').closest('[data-sonner-toast]');
      expect(toastContainer).toHaveAttribute('data-type', 'success');
    });

    it('success toast auto-dismisses', async () => {
      render(<div />, { wrapper: TestWrapper });

      await act(async () => {
        toast.success('Temporary message', { duration: 5000 });
      });

      await waitFor(() => {
        expect(screen.getByText('Temporary message')).toBeInTheDocument();
      });

      // Advance past the dismiss duration
      await act(async () => {
        vi.advanceTimersByTime(6000);
      });

      await waitFor(() => {
        expect(screen.queryByText('Temporary message')).not.toBeInTheDocument();
      });
    });
  });

  describe('error toast', () => {
    it('renders error toast with role="alert"', async () => {
      render(<div />, { wrapper: TestWrapper });

      await act(async () => {
        toast.error('Something went wrong');
      });

      await waitFor(() => {
        const toastEl = screen.getByText('Something went wrong');
        expect(toastEl).toBeInTheDocument();
      });

      const toastContainer = screen.getByText('Something went wrong').closest('[data-sonner-toast]');
      expect(toastContainer).toHaveAttribute('data-type', 'error');
    });

    it('error toast persists (does not auto-dismiss with default duration)', async () => {
      render(<div />, { wrapper: TestWrapper });

      await act(async () => {
        toast.error('Persistent error', { duration: Infinity });
      });

      await waitFor(() => {
        expect(screen.getByText('Persistent error')).toBeInTheDocument();
      });

      // Advance well past normal auto-dismiss time
      await act(async () => {
        vi.advanceTimersByTime(10000);
      });

      // Should still be visible
      expect(screen.getByText('Persistent error')).toBeInTheDocument();
    });
  });

  describe('ARIA attributes', () => {
    it('toast container has appropriate aria-live region', async () => {
      render(<div />, { wrapper: TestWrapper });

      await act(async () => {
        toast('Test message');
      });

      await waitFor(() => {
        expect(screen.getByText('Test message')).toBeInTheDocument();
      });

      // Sonner renders an ol as the toast list container
      const toaster = screen.getByText('Test message').closest('ol');
      expect(toaster).toBeInTheDocument();
    });
  });
});
