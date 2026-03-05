import { useCallback, useEffect, useRef, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { ChatView } from '@/components/ChatView';
import { UploadView } from '@/components/UploadView';
import { getImages, deleteImage as apiDeleteImage } from '@/lib/api';
import { toast } from 'sonner';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InksightIcon } from '@/components/InksightIcon';
import type { ImageData, UploadResponse } from '@/types';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

export function AppLayout() {
  const [images, setImages] = useState<ImageData[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(true);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // Load images on mount
  useEffect(() => {
    const controller = new AbortController();
    getImages(undefined, controller.signal)
      .then((res) => {
        setImages(res.images as ImageData[]);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          toast.error('Failed to load images');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingImages(false);
        }
      });
    return () => controller.abort();
  }, []);

  const selectedImage = images.find((img) => img.id === selectedImageId) ?? null;

  const handleUploadComplete = useCallback((upload: UploadResponse) => {
    const newImage: ImageData = {
      id: upload.id,
      originalFilename: upload.filename,
      mimeType: upload.mimeType,
      size: upload.size,
      messageCount: 0,
      createdAt: new Date().toISOString(),
    };
    setImages((prev) => [newImage, ...prev]);
    setSelectedImageId(upload.id);
    toast.success(`Uploaded ${upload.filename}`);
  }, []);

  const handleDeleteImage = useCallback(async (imageId: string) => {
    const imageToDelete = images.find((img) => img.id === imageId);
    try {
      await apiDeleteImage(imageId);
      setImages((prev) => prev.filter((img) => img.id !== imageId));
      if (selectedImageId === imageId) {
        setSelectedImageId(null);
      }
      toast.success(`Deleted ${imageToDelete?.originalFilename ?? 'image'}`);
    } catch {
      toast.error('Failed to delete image');
    }
  }, [images, selectedImageId]);

  const handleSelectImage = useCallback((id: string) => {
    setSelectedImageId(id);
    if (!isDesktop) {
      setSidebarOpen(false);
    }
  }, [isDesktop]);

  const handleNewUpload = useCallback(() => {
    setSelectedImageId(null);
    if (!isDesktop) {
      setSidebarOpen(false);
    }
  }, [isDesktop]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  // Close sidebar overlay on Escape (mobile only)
  useEffect(() => {
    if (isDesktop || !sidebarOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSidebarOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isDesktop, sidebarOpen]);

  // Focus trap in mobile sidebar overlay
  useEffect(() => {
    if (isDesktop || !sidebarOpen || !sidebarRef.current) return;

    const sidebar = sidebarRef.current;
    const focusables = sidebar.querySelectorAll<HTMLElement>(
      'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;

    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    first.focus();

    function handleTab(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    sidebar.addEventListener('keydown', handleTab);
    return () => sidebar.removeEventListener('keydown', handleTab);
  }, [isDesktop, sidebarOpen]);

  const sidebarNode = (
    <Sidebar
      images={images}
      selectedImageId={selectedImageId}
      onSelectImage={handleSelectImage}
      onDeleteImage={handleDeleteImage}
      onNewUpload={handleNewUpload}
      isOpen={sidebarOpen || isDesktop}
      onToggle={handleToggleSidebar}
    />
  );

  return (
    <div className="flex h-dvh flex-col bg-neutral-25">
      {/* Skip link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[var(--z-tooltip)] focus:rounded focus:bg-primary-500 focus:px-4 focus:py-2 focus:text-white focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Mobile header — hidden on desktop */}
      {!isDesktop && (
        <header className="flex h-[var(--header-height)] items-center gap-3 border-b border-neutral-100 bg-neutral-0 px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleSidebar}
            aria-label="Toggle sidebar"
            aria-expanded={sidebarOpen}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <InksightIcon
            aria-hidden="true"
            className="h-[var(--logo-height-mobile)] w-auto text-primary-500"
          />
          <h1 className="sr-only">Inksight</h1>
        </header>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Desktop sidebar — always visible */}
        {isDesktop && sidebarNode}

        {/* Mobile sidebar overlay */}
        {!isDesktop && sidebarOpen && (
          <>
            <div
              className="fixed inset-0 z-[var(--z-overlay)] bg-neutral-900/50"
              onClick={handleCloseSidebar}
              aria-hidden="true"
            />
            <div
              ref={sidebarRef}
              className="fixed inset-y-0 left-0 z-[var(--z-modal)] w-[var(--sidebar-width)] shadow-lg"
            >
              {sidebarNode}
            </div>
          </>
        )}

        {/* Main content */}
        <main id="main-content" className="flex-1 min-w-0">
          {selectedImage ? (
            <ChatView image={selectedImage} />
          ) : (
            <UploadView onUploadComplete={handleUploadComplete} />
          )}
        </main>
      </div>
    </div>
  );
}
