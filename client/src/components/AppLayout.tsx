import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { ChatView } from '@/components/ChatView';
import { UploadView } from '@/components/UploadView';
import { getImages, deleteImage as apiDeleteImage } from '@/lib/api';
import { toast } from 'sonner';
import type { ImageData, UploadResponse } from '@/types';

export function AppLayout() {
  const [images, setImages] = useState<ImageData[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
  }, []);

  const handleNewUpload = useCallback(() => {
    setSelectedImageId(null);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  return (
    <div className="flex h-dvh bg-neutral-25">
      {sidebarOpen && (
        <Sidebar
          images={images}
          selectedImageId={selectedImageId}
          onSelectImage={handleSelectImage}
          onDeleteImage={handleDeleteImage}
          onNewUpload={handleNewUpload}
          isOpen={sidebarOpen}
          onToggle={handleToggleSidebar}
        />
      )}
      <main className="flex-1 min-w-0">
        {selectedImage ? (
          <ChatView image={selectedImage} />
        ) : (
          <UploadView onUploadComplete={handleUploadComplete} />
        )}
      </main>
    </div>
  );
}
