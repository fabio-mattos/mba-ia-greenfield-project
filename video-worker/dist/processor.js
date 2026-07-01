"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processVideo = processVideo;
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const http = __importStar(require("node:http"));
const https = __importStar(require("node:https"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const minio_client_1 = require("./minio-client");
const database_1 = require("./database");
async function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(destPath);
        client.get(url, (res) => {
            res.pipe(file);
            file.on('finish', () => file.close(() => resolve()));
            file.on('error', reject);
        });
    });
}
function getDuration(filePath) {
    return new Promise((resolve, reject) => {
        fluent_ffmpeg_1.default.ffprobe(filePath, (err, metadata) => {
            if (err)
                return reject(err);
            resolve(Math.round(metadata.format.duration ?? 0));
        });
    });
}
function extractThumbnail(filePath, outputPath) {
    return new Promise((resolve, reject) => {
        (0, fluent_ffmpeg_1.default)(filePath)
            .seekInput(5)
            .frames(1)
            .output(outputPath)
            .on('end', () => resolve())
            .on('error', reject)
            .run();
    });
}
async function processVideo(videoId) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `video-${videoId}-`));
    const videoPath = path.join(tmpDir, 'input.mp4');
    const thumbnailPath = path.join(tmpDir, 'thumbnail.jpg');
    try {
        const video = await (0, database_1.getVideoById)(videoId);
        if (!video) {
            throw new Error(`Video ${videoId} not found in database`);
        }
        const presignedUrl = await (0, minio_client_1.getPresignedGetUrl)(minio_client_1.BUCKET_VIDEOS, video.file_key, 7200);
        await downloadFile(presignedUrl, videoPath);
        const durationSeconds = await getDuration(videoPath);
        await extractThumbnail(videoPath, thumbnailPath);
        const thumbnailBuffer = fs.readFileSync(thumbnailPath);
        const thumbnailKey = `thumbnails/${videoId}.jpg`;
        await (0, minio_client_1.uploadBuffer)(minio_client_1.BUCKET_THUMBNAILS, thumbnailKey, thumbnailBuffer, 'image/jpeg');
        await (0, database_1.updateVideoProcessed)(videoId, durationSeconds, thumbnailKey);
    }
    catch (err) {
        console.error(`[processor] Failed to process video ${videoId}:`, err);
        await (0, database_1.updateVideoFailed)(videoId);
        throw err;
    }
    finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}
