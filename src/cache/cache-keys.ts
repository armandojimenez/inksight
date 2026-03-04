export const CACHE_KEYS = {
  image: (imageId: string) => `image:${imageId}`,
  history: (imageId: string) => `history:${imageId}`,
  recent: (imageId: string) => `recent:${imageId}`,
} as const;
