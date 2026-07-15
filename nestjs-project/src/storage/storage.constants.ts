export const STORAGE_KEY_PREFIX = 'videos' as const;

export function videoObjectKey(videoId: string, extension: string): string {
  return `${STORAGE_KEY_PREFIX}/${videoId}/original${extension}`;
}

export function thumbnailObjectKey(videoId: string): string {
  return `${STORAGE_KEY_PREFIX}/${videoId}/thumbnail.jpg`;
}
