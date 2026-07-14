import { Test } from '@nestjs/testing';
import { WorkerModule } from './worker.module';
import { FfmpegService } from './ffmpeg.service';

describe('WorkerModule', () => {
  it('should compile with FfmpegService and connect to the real DB/Redis/MinIO', async () => {
    const module = await Test.createTestingModule({
      imports: [WorkerModule],
    }).compile();

    expect(module.get(FfmpegService)).toBeDefined();
    await module.close();
  }, 30000);
});
