import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadImage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { InksightIcon } from '@/components/InksightIcon';
import type { UploadResponse } from '@/types';

export interface UploadViewProps {
  onUploadComplete: (image: UploadResponse) => void;
  isFirstTime?: boolean;
}

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif']);
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif']);
const MAX_FILE_SIZE = 16 * 1024 * 1024; // 16MB

type UploadState =
  | { status: 'idle' }
  | { status: 'dragover' }
  | { status: 'uploading' }
  | { status: 'error'; message: string };

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

function validateFile(file: File): string | null {
  const ext = getExtension(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext) && !ALLOWED_MIME_TYPES.has(file.type)) {
    return `File type not allowed. Accepted types: ${[...ALLOWED_EXTENSIONS].join(', ')}`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File size exceeds the maximum allowed size of 16 MB`;
  }
  return null;
}

export function UploadView({ onUploadComplete, isFirstTime = false }: UploadViewProps) {
  const [state, setState] = useState<UploadState>({ status: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dragCounterRef = useRef(0);
  const prevErrorRef = useRef<string | null>(null);

  // Abort in-flight upload on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Track the most recent error so dragleave can restore it
  useEffect(() => {
    if (state.status === 'error') {
      prevErrorRef.current = state.message;
    } else if (state.status === 'uploading' || state.status === 'idle') {
      prevErrorRef.current = null;
    }
  }, [state]);

  const handleUpload = useCallback(
    async (file: File) => {
      const error = validateFile(file);
      if (error) {
        setState({ status: 'error', message: error });
        return;
      }

      setState({ status: 'uploading' });
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const result = await uploadImage(file, controller.signal);
        setState({ status: 'idle' });
        onUploadComplete(result);
      } catch (err) {
        if (controller.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : 'Upload failed';
        setState({ status: 'error', message });
      }
    },
    [onUploadComplete],
  );

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    setState((prev) =>
      prev.status === 'uploading' ? prev : { status: 'dragover' },
    );
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setState((prev) => {
        if (prev.status === 'uploading') return prev;
        // Restore previous error if one existed before the drag interaction
        if (prevErrorRef.current) {
          return { status: 'error', message: prevErrorRef.current };
        }
        return { status: 'idle' };
      });
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;

      // Block drops while an upload is in progress
      if (state.status === 'uploading') return;

      const files = e.dataTransfer.files;
      if (files.length > 1) {
        setState({
          status: 'error',
          message: 'Only one image can be uploaded at a time.',
        });
        return;
      }

      const file = files[0];
      if (file) handleUpload(file);
    },
    [handleUpload, state.status],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
      // Reset so the same file can be re-selected
      e.target.value = '';
    },
    [handleUpload],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openFilePicker();
      }
    },
    [openFilePicker],
  );

  const isDragover = state.status === 'dragover';
  const isUploading = state.status === 'uploading';
  const isError = state.status === 'error';

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-8 p-4 sm:p-8"
      style={{ background: 'var(--gradient-hero)' }}
    >
      {isFirstTime && (
        <div className="flex max-w-lg flex-col items-center text-center">
          <h2
            className="font-display text-2xl font-bold text-neutral-700"
            style={{
              animation: 'fadeInUp var(--anim-entrance-duration) var(--anim-entrance-easing) both',
            }}
          >
            Welcome to Inksight
          </h2>
          <p
            className="mt-2 text-neutral-400"
            style={{
              animation: 'fadeInUp var(--anim-entrance-duration) var(--anim-entrance-easing) both',
              animationDelay: '60ms',
            }}
          >
            Upload an image and start a conversation with AI
          </p>
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        aria-label="Upload image. Drag and drop or press Enter to browse. Accepts PNG, JPG, and GIF up to 16 megabytes."
        aria-busy={isUploading}
        data-dragover={isDragover ? 'true' : undefined}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={openFilePicker}
        onKeyDown={onKeyDown}
        style={{
          animation: 'scaleIn var(--anim-entrance-duration) var(--anim-entrance-easing) both',
        }}
        className={cn(
          'flex w-full max-w-lg cursor-pointer flex-col items-center gap-4 rounded p-6 sm:p-12',
          'transition-all duration-150',
          'focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus)]',
          isDragover && 'border-2 border-solid border-primary-500 bg-primary-50 scale-[1.02]',
          isError && 'border-2 border-solid border-error-500 bg-error-50',
          isUploading && 'border-2 border-solid border-primary-500 bg-neutral-25',
          !isDragover && !isError && !isUploading && [
            'border-2 border-dashed border-neutral-200 bg-neutral-25',
            'hover:border-primary-400 hover:bg-primary-50',
          ],
        )}
      >
        <InksightIcon
          className="opacity-30"
          style={{ height: 'var(--logo-height-hero)', width: 'auto' }}
        />

        {isUploading ? (
          <div
            className="flex flex-col items-center gap-2"
            aria-live="polite"
          >
            <div className="h-1 w-48 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-primary-500 animate-indeterminate" />
            </div>
            <p className="text-sm text-neutral-500">Uploading...</p>
          </div>
        ) : (
          <>
            <p className="text-center text-neutral-500">
              Drop an image here, or{' '}
              <span className="font-semibold text-primary-500 underline">
                browse
              </span>
            </p>
            <p className="text-sm text-neutral-400">
              PNG, JPG, GIF — up to 16 MB
            </p>
          </>
        )}

        {isError && (
          <p role="alert" className="text-sm text-error-500">
            {state.message}
          </p>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif"
        className="hidden"
        tabIndex={-1}
        onChange={onFileChange}
        aria-hidden="true"
      />
    </div>
  );
}
