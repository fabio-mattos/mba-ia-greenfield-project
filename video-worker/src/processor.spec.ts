type Handler = (...args: any[]) => void;
type FakeWriteStream = {
  on: jest.Mock;
  close: jest.Mock;
  emit: (event: string, ...args: unknown[]) => void;
};
type FfmpegChain = {
  seekInput: jest.Mock;
  frames: jest.Mock;
  output: jest.Mock;
  on: jest.Mock;
  run: jest.Mock;
};

function makeFakeWriteStream(): FakeWriteStream {
  const handlers: Record<string, Handler[]> = {};
  const stream: FakeWriteStream = {
    on: jest.fn((event: string, cb: Handler) => {
      handlers[event] = handlers[event] || [];
      handlers[event].push(cb);
      return stream;
    }),
    close: jest.fn((cb?: Handler) => cb && cb()),
    emit: (event: string, ...args: unknown[]) => {
      (handlers[event] || []).forEach((cb) => cb(...args));
    },
  };
  return stream;
}

function makeFfmpegChain(): FfmpegChain {
  const handlers: Record<string, Handler[]> = {};
  const chain: FfmpegChain = {
    seekInput: jest.fn(() => chain),
    frames: jest.fn(() => chain),
    output: jest.fn(() => chain),
    on: jest.fn((event: string, cb: Handler) => {
      handlers[event] = handlers[event] || [];
      handlers[event].push(cb);
      return chain;
    }),
    run: jest.fn(() => {
      (handlers['end'] || []).forEach((cb) => cb());
    }),
  };
  return chain;
}

const httpGet = jest.fn();
const fsMkdtempSync = jest.fn(() => '/tmp/video-test');
const fsReadFileSync = jest.fn(() => Buffer.from('fake-thumbnail-bytes'));
const fsRmSync = jest.fn();
let fakeWriteStream: FakeWriteStream;
const fsCreateWriteStream = jest.fn(() => fakeWriteStream);

jest.mock('node:fs', () => ({
  mkdtempSync: fsMkdtempSync,
  createWriteStream: fsCreateWriteStream,
  readFileSync: fsReadFileSync,
  rmSync: fsRmSync,
}));

jest.mock('node:http', () => ({
  get: httpGet,
}));

jest.mock('node:https', () => ({
  get: jest.fn(),
}));

const ffprobeMock = jest.fn();
let ffmpegChain: FfmpegChain;
const ffmpegFn: jest.Mock & { ffprobe?: jest.Mock } = jest.fn(() => ffmpegChain);
ffmpegFn.ffprobe = ffprobeMock;

jest.mock('fluent-ffmpeg', () => ({
  __esModule: true,
  default: ffmpegFn,
}));

const getPresignedGetUrl = jest.fn();
const uploadBuffer = jest.fn();
jest.mock('./minio-client', () => ({
  BUCKET_VIDEOS: 'videos',
  BUCKET_THUMBNAILS: 'thumbnails',
  getPresignedGetUrl,
  uploadBuffer,
}));

const getVideoById = jest.fn();
const updateVideoProcessed = jest.fn();
const updateVideoFailed = jest.fn();
jest.mock('./database', () => ({
  getVideoById,
  updateVideoProcessed,
  updateVideoFailed,
}));

import { processVideo } from './processor';

function mockSuccessfulDownload() {
  httpGet.mockImplementation((_url: string, cb: Handler) => {
    const res = {
      pipe: jest.fn(() => {
        setImmediate(() => fakeWriteStream.emit('finish'));
      }),
    };
    cb(res);
    return { on: jest.fn() };
  });
}

describe('processVideo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fakeWriteStream = makeFakeWriteStream();
    ffmpegChain = makeFfmpegChain();
    getPresignedGetUrl.mockResolvedValue('http://minio/videos/uploads/video-1.mp4');
    updateVideoProcessed.mockResolvedValue(undefined);
    updateVideoFailed.mockResolvedValue(undefined);
    uploadBuffer.mockResolvedValue(undefined);
  });

  it('downloads, extracts duration/thumbnail, uploads, and marks the video ready', async () => {
    getVideoById.mockResolvedValue({ file_key: 'uploads/video-1.mp4' });
    ffprobeMock.mockImplementation((_path: string, cb: Handler) => {
      cb(null, { format: { duration: 12.6 } });
    });
    mockSuccessfulDownload();

    await processVideo('video-1');

    expect(getVideoById).toHaveBeenCalledWith('video-1');
    expect(getPresignedGetUrl).toHaveBeenCalledWith(
      'videos',
      'uploads/video-1.mp4',
      7200,
    );
    expect(ffmpegChain.seekInput).toHaveBeenCalledWith(5);
    expect(ffmpegChain.frames).toHaveBeenCalledWith(1);
    expect(uploadBuffer).toHaveBeenCalledWith(
      'thumbnails',
      'thumbnails/video-1.jpg',
      Buffer.from('fake-thumbnail-bytes'),
      'image/jpeg',
    );
    expect(updateVideoProcessed).toHaveBeenCalledWith(
      'video-1',
      13,
      'thumbnails/video-1.jpg',
    );
    expect(updateVideoFailed).not.toHaveBeenCalled();
    expect(fsRmSync).toHaveBeenCalledWith('/tmp/video-test', {
      recursive: true,
      force: true,
    });
  });

  it('marks the video as failed and rethrows when it does not exist', async () => {
    getVideoById.mockResolvedValue(null);

    await expect(processVideo('missing-video')).rejects.toThrow(
      'Video missing-video not found in database',
    );

    expect(updateVideoFailed).toHaveBeenCalledWith('missing-video');
    expect(updateVideoProcessed).not.toHaveBeenCalled();
    expect(fsRmSync).toHaveBeenCalled();
  });

  it('marks the video as failed and rethrows when ffprobe fails', async () => {
    getVideoById.mockResolvedValue({ file_key: 'uploads/video-1.mp4' });
    mockSuccessfulDownload();
    ffprobeMock.mockImplementation((_path: string, cb: Handler) => {
      cb(new Error('ffprobe exploded'), null);
    });

    await expect(processVideo('video-1')).rejects.toThrow('ffprobe exploded');

    expect(updateVideoFailed).toHaveBeenCalledWith('video-1');
    expect(updateVideoProcessed).not.toHaveBeenCalled();
    expect(fsRmSync).toHaveBeenCalled();
  });

  it('marks the video as failed and rethrows when the download fails', async () => {
    getVideoById.mockResolvedValue({ file_key: 'uploads/video-1.mp4' });
    httpGet.mockImplementation((_url: string, cb: Handler) => {
      const res = {
        pipe: jest.fn(() => {
          setImmediate(() => fakeWriteStream.emit('error', new Error('network down')));
        }),
      };
      cb(res);
      return { on: jest.fn() };
    });

    await expect(processVideo('video-1')).rejects.toThrow('network down');

    expect(updateVideoFailed).toHaveBeenCalledWith('video-1');
    expect(updateVideoProcessed).not.toHaveBeenCalled();
    expect(fsRmSync).toHaveBeenCalled();
  });
});
