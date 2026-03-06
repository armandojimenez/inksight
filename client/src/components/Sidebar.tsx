import { useCallback, useRef, useState } from 'react';
import type { ImageData } from '@/types';
import { getImageFileUrl } from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { Plus, Trash2, Upload } from 'lucide-react';

export interface SidebarProps {
  images: readonly ImageData[];
  selectedImageId: string | null;
  onSelectImage: (id: string) => void;
  onDeleteImage: (id: string) => void;
  onNewUpload: () => void;
  isLoading?: boolean;
}

function SidebarSkeleton() {
  return (
    <>
      <div className="py-2" aria-hidden="true" data-testid="sidebar-skeleton">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2">
            <div className="h-10 w-10 rounded bg-neutral-100 animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-3/4 rounded bg-neutral-100 animate-pulse" />
              <div className="h-2 w-1/2 rounded bg-neutral-100 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
      <p className="sr-only" role="status">Loading images...</p>
    </>
  );
}

function truncateFilename(name: string, maxLength = 40): string {
  if (name.length <= maxLength) return name;
  const ext = name.lastIndexOf('.');
  if (ext > 0 && name.length - ext <= 5) {
    const extStr = name.slice(ext);
    return name.slice(0, maxLength - extStr.length - 1) + '\u2026' + extStr;
  }
  return name.slice(0, maxLength - 1) + '\u2026';
}

export function Sidebar({
  images,
  selectedImageId,
  onSelectImage,
  onDeleteImage,
  onNewUpload,
  isLoading = false,
}: SidebarProps) {
  const [deleteTarget, setDeleteTarget] = useState<ImageData | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const activeIndex = images.findIndex((img) => img.id === selectedImageId);

  function handleConfirmDelete() {
    if (deleteTarget) {
      onDeleteImage(deleteTarget.id);
      setDeleteTarget(null);
    }
  }

  function handleCancelDelete() {
    setDeleteTarget(null);
  }

  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (images.length === 0) return;

      let nextIndex = -1;
      const currentIndex = itemRefs.current.findIndex(
        (ref) => ref === document.activeElement || ref?.contains(document.activeElement as Node),
      );

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        nextIndex = currentIndex < images.length - 1 ? currentIndex + 1 : 0;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        nextIndex = currentIndex > 0 ? currentIndex - 1 : images.length - 1;
      } else if (e.key === 'Home') {
        e.preventDefault();
        nextIndex = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        nextIndex = images.length - 1;
      }

      if (nextIndex >= 0) {
        itemRefs.current[nextIndex]?.focus();
      }
    },
    [images.length],
  );

  return (
    <nav
      aria-label="Image gallery"
      className="flex h-full w-[var(--sidebar-width)] flex-col border-r border-neutral-100 bg-neutral-0"
    >
      {/* Header with logo */}
      <div className="flex items-center px-4 h-[var(--topbar-height)] border-b border-neutral-100">
        <img
          src="/inksight-logo.png"
          alt="Inksight"
          className="h-7 w-auto"
        />
        <h2 className="sr-only">Image Gallery</h2>
      </div>

      {/* Image list */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <SidebarSkeleton />
        ) : images.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center px-4 py-8 text-center"
            style={{ animation: 'fadeIn var(--anim-entrance-duration) var(--anim-entrance-easing) both' }}
          >
            <Upload className="mb-2 h-5 w-5 text-neutral-400" />
            <p className="text-sm text-neutral-400">
              No images yet
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              Upload one to get started
            </p>
            <button
              type="button"
              onClick={onNewUpload}
              className="mt-3 rounded bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600 focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus)]"
            >
              Upload Image
            </button>
          </div>
        ) : (
          <ul role="list" className="py-2" onKeyDown={handleListKeyDown}>
            {images.map((image, i) => {
              const isActive = image.id === selectedImageId;
              const rovingTabIndex = i === (activeIndex >= 0 ? activeIndex : 0) ? 0 : -1;
              return (
                <li
                  key={image.id}
                  style={{
                    animation: 'slideInLeft var(--anim-entrance-duration) var(--anim-entrance-easing) both',
                    animationDelay: `${Math.min(i * 40, 200)}ms`,
                  }}
                >
                  <div
                    ref={(el) => { itemRefs.current[i] = el; }}
                    data-image-item
                    data-active={isActive || undefined}
                    className={cn(
                      'group flex items-center gap-3 px-4 py-2 cursor-pointer transition-all duration-200',
                      'focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus)]',
                      isActive
                        ? 'bg-primary-50 border-l-[3px] border-l-primary-500'
                        : 'border-l-[3px] border-l-transparent hover:bg-neutral-50',
                    )}
                    onClick={() => onSelectImage(image.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectImage(image.id);
                      }
                    }}
                    tabIndex={rovingTabIndex}
                    role="button"
                    aria-label={`${image.originalFilename}, ${image.messageCount} ${image.messageCount === 1 ? 'message' : 'messages'}`}
                    aria-current={isActive ? 'location' : undefined}
                  >
                    {/* Thumbnail */}
                    <img
                      src={getImageFileUrl(image.id)}
                      alt={`${image.originalFilename} thumbnail`}
                      className="h-10 w-10 rounded object-cover flex-shrink-0 transition-opacity hover:opacity-80"
                    />

                    {/* Info */}
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p className="text-sm font-medium text-neutral-700 truncate" title={image.originalFilename}>
                        {image.originalFilename}
                      </p>
                      <p className="text-xs text-neutral-400">
                        {image.messageCount} {image.messageCount === 1 ? 'message' : 'messages'}
                      </p>
                    </div>

                    {/* Delete — appears on row hover/focus */}
                    <button
                      data-delete-btn
                      className={cn(
                        'flex-shrink-0 flex items-center justify-center rounded',
                        'min-h-[var(--touch-target-min)] min-w-[var(--touch-target-min)]',
                        'hover:bg-error-50',
                        'focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus)]',
                      )}
                      aria-label={`Delete ${image.originalFilename}`}
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(image);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-neutral-300 hover:text-error-500 transition-colors" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>

      {/* New Image button */}
      <div className="flex items-center px-4 h-[var(--bottombar-height)] border-t border-neutral-100">
        <Button
          className="w-full h-11"
          onClick={onNewUpload}
        >
          <Plus className="mr-2 h-4 w-4" />
          New Image
        </Button>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && handleCancelDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{truncateFilename(deleteTarget?.originalFilename ?? '')}&rdquo; and all its
              chat messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </nav>
  );
}
