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
    // @nestjs/bullmq closes the underlying ioredis connection asynchronously;
    // without this grace period the close can bleed an unhandled rejection
    // into whichever test file Jest --runInBand happens to run next.
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }, 30000);
});
