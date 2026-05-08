import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { handleTranscribeJob } from "../services/transcribe.js";
import { handleRenderJob } from "../services/render.js";
import type { Server as SocketServer } from "socket.io";

let connection: IORedis;

export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}

export interface TranscribeJobData {
  jobId: string;
  userId: string;
  sourceKey: string;
  clipName: string;
}

export interface RenderJobData {
  jobId: string;
  userId: string;
  sourceKey: string;
  srtContent: string;
  clipName: string;
}

export type JobResult = {
  outputKey?: string;
  text?: string;
  srt?: string;
  error?: string;
};

export function createQueues() {
  const conn = getRedisConnection();
  const transcribeQueue = new Queue<TranscribeJobData>("transcribe", {
    connection: conn,
  });
  const renderQueue = new Queue<RenderJobData>("render", {
    connection: conn,
  });
  return { transcribeQueue, renderQueue };
}

export function createWorkers(io: SocketServer) {
  const conn = getRedisConnection();

  function emitProgress(userId: string, jobId: string, data: Record<string, unknown>) {
    io.to(userId).emit("job:progress", { jobId, ...data });
  }

  const transcribeWorker = new Worker<TranscribeJobData, JobResult>(
    "transcribe",
    async (job: Job<TranscribeJobData>) => {
      emitProgress(job.data.userId, job.data.jobId, {
        status: "processing",
        clipName: job.data.clipName,
      });
      const result = await handleTranscribeJob(job.data);
      emitProgress(job.data.userId, job.data.jobId, {
        status: "completed",
        clipName: job.data.clipName,
      });
      return result;
    },
    { connection: conn, concurrency: 3 }
  );

  const renderWorker = new Worker<RenderJobData, JobResult>(
    "render",
    async (job: Job<RenderJobData>) => {
      emitProgress(job.data.userId, job.data.jobId, {
        status: "processing",
        clipName: job.data.clipName,
      });
      const result = await handleRenderJob(job.data);
      emitProgress(job.data.userId, job.data.jobId, {
        status: "completed",
        clipName: job.data.clipName,
      });
      return result;
    },
    { connection: conn, concurrency: 2 }
  );

  transcribeWorker.on("failed", (job, err) => {
    if (job) {
      emitProgress(job.data.userId, job.data.jobId, {
        status: "failed",
        clipName: job.data.clipName,
        error: err.message,
      });
    }
  });

  renderWorker.on("failed", (job, err) => {
    if (job) {
      emitProgress(job.data.userId, job.data.jobId, {
        status: "failed",
        clipName: job.data.clipName,
        error: err.message,
      });
    }
  });

  return { transcribeWorker, renderWorker };
}
