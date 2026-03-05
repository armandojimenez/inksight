import type { ImageData } from '@/types';

export interface SidebarProps {
  images: readonly ImageData[];
  selectedImageId: string | null;
  onSelectImage: (id: string) => void;
  onDeleteImage: (id: string) => void;
  onNewUpload: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

export function Sidebar(_props: SidebarProps) {
  return null;
}
