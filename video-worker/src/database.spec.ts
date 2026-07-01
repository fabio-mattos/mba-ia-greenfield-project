const query = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({ query })),
}));

import {
  getVideoById,
  updateVideoFailed,
  updateVideoProcessed,
} from './database';

describe('database', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateVideoProcessed', () => {
    it('sets status ready with the extracted duration and thumbnail key', async () => {
      query.mockResolvedValue({ rows: [] });

      await updateVideoProcessed('video-1', 42, 'thumbnails/video-1.jpg');

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'ready'"),
        [42, 'thumbnails/video-1.jpg', 'video-1'],
      );
    });
  });

  describe('updateVideoFailed', () => {
    it('sets status failed for the given video id', async () => {
      query.mockResolvedValue({ rows: [] });

      await updateVideoFailed('video-1');

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'failed'"),
        ['video-1'],
      );
    });
  });

  describe('getVideoById', () => {
    it('returns the row when the video exists', async () => {
      query.mockResolvedValue({ rows: [{ file_key: 'uploads/video-1.mp4' }] });

      const video = await getVideoById('video-1');

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT file_key FROM videos WHERE id = $1'),
        ['video-1'],
      );
      expect(video).toEqual({ file_key: 'uploads/video-1.mp4' });
    });

    it('returns null when no video matches the id', async () => {
      query.mockResolvedValue({ rows: [] });

      const video = await getVideoById('missing-id');

      expect(video).toBeNull();
    });
  });
});
