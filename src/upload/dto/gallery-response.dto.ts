export interface GalleryImageResponse {
  id: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  messageCount: number;
  createdAt: string;
}

export interface GalleryResponse {
  images: GalleryImageResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
