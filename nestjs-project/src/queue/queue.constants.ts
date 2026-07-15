export const VIDEO_PROCESSING_QUEUE = 'video-processing' as const;
export const PROCESS_VIDEO_JOB = 'process-video' as const;

export const VIDEO_PROCESSING_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
};
