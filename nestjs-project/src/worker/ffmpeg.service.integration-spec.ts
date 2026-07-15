import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { FfmpegService } from './ffmpeg.service';

const execFileAsync = promisify(execFile);

describe('FfmpegService (integration)', () => {
  let ffmpegService: FfmpegService;
  let tmpDir: string;
  let fixtureVideoPath: string;

  beforeAll(async () => {
    ffmpegService = new FfmpegService();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ffmpeg-test-'));
    fixtureVideoPath = path.join(tmpDir, 'fixture.mp4');

    // Generate a small synthetic video (2s, 320x240) using ffmpeg's test source —
    // no binary fixture file needs to be committed to the repo.
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=2:size=320x240:rate=10',
      '-pix_fmt',
      'yuv420p',
      fixtureVideoPath,
    ]);
  }, 30000);

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('extractMetadata', () => {
    it('extracts duration, dimensions, codec, container, and bitrate', async () => {
      const metadata = await ffmpegService.extractMetadata(fixtureVideoPath);

      expect(metadata.durationInSeconds).toBeGreaterThan(1);
      expect(metadata.durationInSeconds).toBeLessThan(3);
      expect(metadata.width).toBe(320);
      expect(metadata.height).toBe(240);
      expect(metadata.codec).toBeTruthy();
      expect(metadata.container).toBeTruthy();
      expect(metadata.bitrateKbps).toBeGreaterThan(0);
    }, 15000);

    it('rejects for a non-existent file', async () => {
      await expect(
        ffmpegService.extractMetadata(path.join(tmpDir, 'missing.mp4')),
      ).rejects.toThrow();
    });
  });

  describe('generateThumbnail', () => {
    it('produces a JPEG thumbnail file from the video', async () => {
      const thumbnailPath = await ffmpegService.generateThumbnail(
        fixtureVideoPath,
        tmpDir,
        'thumb.jpg',
      );

      const stat = await fs.stat(thumbnailPath);
      expect(stat.isFile()).toBe(true);
      expect(stat.size).toBeGreaterThan(0);
    }, 15000);
  });
});
