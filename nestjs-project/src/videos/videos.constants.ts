export const MAX_VIDEO_FILE_SIZE_BYTES = 10 * 1024 ** 3;

export function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot === -1 ? '' : fileName.slice(lastDot);
}
