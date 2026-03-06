import { useCallback, useEffect, useRef, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { ChatView } from '@/components/ChatView';
import { UploadView } from '@/components/UploadView';
import { getImages, deleteImage as apiDeleteImage } from '@/lib/api';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { toast } from 'sonner';
import { Menu, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InksightIcon } from '@/components/InksightIcon';
import type { ImageData, UploadResponse } from '@/types';

export function AppLayout() {
  const [images, setImages] = useState<ImageData[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(true);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [initialAnalysisMap, setInitialAnalysisMap] = useState<Record<string, string>>({});
  const sidebarRef = useRef<HTMLDivElement>(null);
  const liveRegionRef = useRef<HTMLDivElement>(null);

  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // Load images on mount
  useEffect(() => {
    const controller = new AbortController();
    getImages({ limit: 100 }, controller.signal)
      .then((res) => {
        setImages([...res.images]);
        if (res.images.length > 0 && res.images[0]) {
          setSelectedImageId(res.images[0].id);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          toast.error('Failed to load images', { duration: Infinity });
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

  // Announce image selection to screen readers
  useEffect(() => {
    if (selectedImage && liveRegionRef.current) {
      liveRegionRef.current.textContent =
        `Now viewing ${selectedImage.originalFilename}, ${selectedImage.messageCount} ${selectedImage.messageCount === 1 ? 'message' : 'messages'}`;
    }
  }, [selectedImage]);

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

    // Capture initial analysis for immediate display in chat
    const analysisContent = upload.analysis?.choices[0]?.message?.content;
    if (analysisContent) {
      setInitialAnalysisMap((prev) => ({ ...prev, [upload.id]: analysisContent }));
    }

    toast.success(`Uploaded ${upload.filename}`);
  }, []);

  const handleDeleteImage = useCallback(async (imageId: string) => {
    try {
      await apiDeleteImage(imageId);
      // Capture name and next selection before state mutation
      const target = images.find((img) => img.id === imageId);
      const deletedName = target?.originalFilename ?? 'image';
      const idx = images.findIndex((img) => img.id === imageId);
      const remaining = images.filter((img) => img.id !== imageId);
      const nextId = remaining.length > 0
        ? remaining[Math.min(idx, remaining.length - 1)]?.id ?? null
        : null;

      setImages(remaining);
      setSelectedImageId((prev) => (prev === imageId ? nextId : prev));
      toast.success(`Deleted ${deletedName}`);
    } catch {
      toast.error('Failed to delete image', { duration: Infinity });
    }
  }, [images]);

  const handleMessageCountChange = useCallback((imageId: string, count: number) => {
    setImages((prev) =>
      prev.map((img) =>
        img.id === imageId && img.messageCount !== count
          ? { ...img, messageCount: count }
          : img,
      ),
    );
  }, []);

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

  // Dynamic focus trap in mobile sidebar overlay
  useEffect(() => {
    if (isDesktop || !sidebarOpen || !sidebarRef.current) return;

    const sidebar = sidebarRef.current;

    const initialFocusables = sidebar.querySelectorAll<HTMLElement>(
      'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])',
    );
    if (initialFocusables.length > 0) {
      initialFocusables[0]!.focus();
    }

    function handleTab(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;

      const focusables = sidebar.querySelectorAll<HTMLElement>(
        'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;

      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;

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
      isLoading={isLoadingImages}
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

      {/* App-wide h1 */}
      <h1 className="sr-only">Inksight</h1>

      {/* Screen reader live region for image selection */}
      <div ref={liveRegionRef} aria-live="polite" className="sr-only" />

      {/* Mobile header */}
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
            className="h-[var(--logo-height-mobile)] w-auto"
          />
          <div className="flex-1" />
          {selectedImage && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNewUpload}
              aria-label="Upload new image"
            >
              <Plus className="h-5 w-5" />
            </Button>
          )}
        </header>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Desktop sidebar */}
        {isDesktop && sidebarNode}

        {/* Mobile sidebar overlay */}
        {!isDesktop && sidebarOpen && (
          <>
            <div
              className="fixed inset-0 z-[var(--z-overlay)] bg-[rgba(12,15,26,0.5)] animate-in fade-in-0 duration-200"
              onClick={handleCloseSidebar}
              aria-hidden="true"
            />
            <div
              ref={sidebarRef}
              role="dialog"
              aria-modal="true"
              aria-label="Sidebar"
              className="fixed inset-y-0 left-0 z-[var(--z-modal)] w-[var(--sidebar-width)] shadow-lg animate-in slide-in-from-left duration-200"
            >
              {sidebarNode}
            </div>
          </>
        )}

        {/* Main content */}
        <main id="main-content" className="flex-1 min-w-0">
          {selectedImage ? (
            <ChatView
              image={selectedImage}
              initialAnalysis={initialAnalysisMap[selectedImage.id]}
              onMessageCountChange={handleMessageCountChange}
            />
          ) : (
            <UploadView
              onUploadComplete={handleUploadComplete}
              isFirstTime={images.length === 0 && !isLoadingImages}
            />
          )}
        </main>
      </div>
    </div>
  );
}
