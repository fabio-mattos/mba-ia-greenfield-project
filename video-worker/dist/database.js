"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateVideoProcessed = updateVideoProcessed;
exports.updateVideoFailed = updateVideoFailed;
exports.getVideoById = getVideoById;
const pg_1 = require("pg");
const pool = new pg_1.Pool({
    host: process.env.DB_HOST || 'db',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'streamtube',
    password: process.env.DB_PASSWORD || 'streamtube',
    database: process.env.DB_NAME || 'streamtube',
});
async function updateVideoProcessed(videoId, durationSeconds, thumbnailKey) {
    await pool.query(`UPDATE videos SET status = 'ready', duration_seconds = $1, thumbnail_key = $2, updated_at = now() WHERE id = $3`, [durationSeconds, thumbnailKey, videoId]);
}
async function updateVideoFailed(videoId) {
    await pool.query(`UPDATE videos SET status = 'failed', updated_at = now() WHERE id = $1`, [videoId]);
}
async function getVideoById(videoId) {
    const result = await pool.query(`SELECT file_key FROM videos WHERE id = $1`, [videoId]);
    return result.rows[0] ?? null;
}
