import { Router } from "express";
import { generateCompositionPlan, type ClipInfo } from "../services/compose.js";
import { renderMultiClip } from "../services/render-multiclip.js";
import { getDownloadUrl } from "../storage/r2.js";
import type { Server as SocketServer } from "socket.io";

export function createComposeRoutes(io: SocketServer) {
  const router = Router();

  router.post("/plan", async (req, res) => {
    const { clips, audience, targetDuration } = req.body;

    if (!Array.isArray(clips) || !audience) {
      res.status(400).json({ error: "clips array and audience required" });
      return;
    }

    try {
      const plan = await generateCompositionPlan(
        clips as ClipInfo[],
        audience,
        targetDuration ?? 30
      );
      res.json({ plan });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Plan generation failed";
      res.status(500).json({ error: message });
    }
  });

  router.post("/render", async (req, res) => {
    const { plan, srtContents, userId } = req.body;

    if (!plan || !userId) {
      res.status(400).json({ error: "plan and userId required" });
      return;
    }

    try {
      io.to(userId).emit("compose:status", { status: "rendering", title: plan.title });

      const outputKey = await renderMultiClip(plan, srtContents ?? []);
      const downloadUrl = await getDownloadUrl(outputKey);

      io.to(userId).emit("compose:status", { status: "done", title: plan.title, downloadUrl });

      res.json({ outputKey, downloadUrl });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Render failed";
      io.to(userId).emit("compose:status", { status: "failed", title: plan.title, error: message });
      res.status(500).json({ error: message });
    }
  });

  router.post("/generate", async (req, res) => {
    const { clips, audiences, targetDuration, userId } = req.body;

    if (!Array.isArray(clips) || !Array.isArray(audiences) || !userId) {
      res.status(400).json({ error: "clips array, audiences array, and userId required" });
      return;
    }

    const results: { audience: string; plan?: unknown; downloadUrl?: string; error?: string }[] = [];

    for (const audience of audiences) {
      try {
        io.to(userId).emit("compose:status", {
          status: "planning",
          audience,
        });

        const plan = await generateCompositionPlan(
          clips as ClipInfo[],
          audience,
          targetDuration ?? 30
        );

        io.to(userId).emit("compose:status", {
          status: "rendering",
          audience,
          title: plan.title,
        });

        const outputKey = await renderMultiClip(plan, []);
        const downloadUrl = await getDownloadUrl(outputKey);

        io.to(userId).emit("compose:status", {
          status: "done",
          audience,
          title: plan.title,
          downloadUrl,
        });

        results.push({ audience, plan, downloadUrl });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Generation failed";
        io.to(userId).emit("compose:status", {
          status: "failed",
          audience,
          error: message,
        });
        results.push({ audience, error: message });
      }
    }

    res.json({ results });
  });

  return router;
}
