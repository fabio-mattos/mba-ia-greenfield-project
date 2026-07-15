import { getQueueToken } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import queueConfig from '../config/queue.config';
import { QueueModule } from './queue.module';
import { VIDEO_PROCESSING_QUEUE } from './queue.constants';

describe('QueueModule (integration)', () => {
  let queue: Queue;
  let moduleRefClose: () => Promise<void>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [queueConfig] }),
        QueueModule,
      ],
    }).compile();

    await moduleRef.init();
    queue = moduleRef.get(getQueueToken(VIDEO_PROCESSING_QUEUE));
    moduleRefClose = () => moduleRef.close();
  }, 30000);

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await moduleRefClose();
  });

  it('connects to the real Redis instance and persists an added job', async () => {
    const job = await queue.add('process-video', { videoId: 'abc-123' });

    const found = await queue.getJob(job.id!);
    expect(found).toBeDefined();
    expect(found!.data).toEqual({ videoId: 'abc-123' });
  }, 15000);
});
