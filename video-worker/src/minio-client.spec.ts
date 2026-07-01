const presignedGetObject = jest.fn();
const putObject = jest.fn();

jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({
    presignedGetObject,
    putObject,
  })),
}));

import { getPresignedGetUrl, uploadBuffer } from './minio-client';

describe('minio-client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPresignedGetUrl', () => {
    it('requests a presigned GET url with the given bucket, key and ttl', async () => {
      presignedGetObject.mockResolvedValue('https://minio/videos/some-key?sig=abc');

      const url = await getPresignedGetUrl('videos', 'uploads/some-key', 7200);

      expect(presignedGetObject).toHaveBeenCalledWith(
        'videos',
        'uploads/some-key',
        7200,
      );
      expect(url).toBe('https://minio/videos/some-key?sig=abc');
    });

    it('defaults ttl to 3600 seconds when not provided', async () => {
      presignedGetObject.mockResolvedValue('https://minio/videos/some-key?sig=abc');

      await getPresignedGetUrl('videos', 'uploads/some-key');

      expect(presignedGetObject).toHaveBeenCalledWith(
        'videos',
        'uploads/some-key',
        3600,
      );
    });
  });

  describe('uploadBuffer', () => {
    it('uploads the buffer with its length and content-type metadata', async () => {
      putObject.mockResolvedValue(undefined);
      const buffer = Buffer.from('fake-image-bytes');

      await uploadBuffer('thumbnails', 'thumbnails/video-1.jpg', buffer, 'image/jpeg');

      expect(putObject).toHaveBeenCalledWith(
        'thumbnails',
        'thumbnails/video-1.jpg',
        buffer,
        buffer.length,
        { 'Content-Type': 'image/jpeg' },
      );
    });
  });
});
