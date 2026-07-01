"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const processor_1 = require("./processor");
const QUEUE = process.env.VIDEO_PROCESSING_QUEUE || 'video-processing';
const worker = new bullmq_1.Worker(QUEUE, async (job) => {
    const { videoId } = job.data;
    console.log(`[worker] Processing job ${job.id} — videoId: ${videoId}`);
    await (0, processor_1.processVideo)(videoId);
    console.log(`[worker] Completed job ${job.id} — videoId: ${videoId}`);
}, {
    connection: {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
    },
    concurrency: 2,
});
worker.on('failed', (job, err) => {
    console.error(`[worker] Job ${job?.id} failed:`, err.message);
});
worker.on('error', (err) => {
    console.error('[worker] Worker error:', err.message);
});
console.log(`[worker] Listening on queue "${QUEUE}"…`);
