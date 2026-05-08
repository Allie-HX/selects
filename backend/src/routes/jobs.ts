import { Router } from "express";
import { randomUUID } from "crypto";
import type { Queue } from "bullmq";
import type { TranscribeJobData, RenderJobData } from "../queue/setup.js";

export function createJobRoutes(
  transcribeQueue: Queue<TranscribeJobData>,
  renderQueue: Queue<RenderJobData>
) {
  const router = Router();

  router.post("/transcribe", async (req, res) => {
    const { sourceKey, clipName, userId } = req.body;

    if (!sourceKey || !clipName || !userId) {
      res.status(400).json({ error: "sourceKey, clipName, and userId required" });
      return;
    }

    const jobId = randomUUID();
    await transcribeQueue.add("transcribe", {
      jobId,
      userId,
      sourceKey,
      clipName,
    });

    res.json({ jobId });
  });

  router.post("/render", async (req, res) => {
    const { sourceKey, srtContent, clipName, userId } = req.body;

    if (!sourceKey || !clipName || !userId) {
      res.status(400).json({ error: "sourceKey, clipName, and userId required" });
      return;
    }

    const jobId = randomUUID();
    await renderQueue.add("render", {
      jobId,
      userId,
      sourceKey,
      srtContent: srtContent ?? "",
      clipName,
    });

    res.json({ jobId });
  });

  router.post("/transcribe-batch", async (req, res) => {
    const { clips, userId } = req.body;

    if (!Array.isArray(clips) || !userId) {
      res.status(400).json({ error: "clips array and userId required" });
      return;
    }

    const jobs = await Promise.all(
      clips.map(async (clip: { sourceKey: string; clipName: string }) => {
        const jobId = randomUUID();
        await transcribeQueue.add("transcribe", {
          jobId,
          userId,
          sourceKey: clip.sourceKey,
          clipName: clip.clipName,
        });
        return { jobId, clipName: clip.clipName };
      })
    );

    res.json({ jobs });
  });

  router.post("/render-batch", async (req, res) => {
    const { clips, userId } = req.body;

    if (!Array.isArray(clips) || !userId) {
      res.status(400).json({ error: "clips array and userId required" });
      return;
    }

    const jobs = await Promise.all(
      clips.map(
        async (clip: {
          sourceKey: string;
          srtContent: string;
          clipName: string;
        }) => {
          const jobId = randomUUID();
          await renderQueue.add("render", {
            jobId,
            userId,
            sourceKey: clip.sourceKey,
            srtContent: clip.srtContent ?? "",
            clipName: clip.clipName,
          });
          return { jobId, clipName: clip.clipName };
        }
      )
    );

    res.json({ jobs });
  });

  return router;
}
