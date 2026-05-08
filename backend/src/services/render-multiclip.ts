import { writeFile, mkdir, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { downloadToBuffer, uploadBuffer, getDownloadUrl } from "../storage/r2.js";
import type { CompositionPlan } from "./compose.js";

const RENDER_TEMP_BASE = join(tmpdir(), "selects-render");

let bundlePromise: Promise<string> | null = null;

function getBundled(): Promise<string> {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: join(process.cwd(), "src/remotion/index.ts"),
      onProgress: (p) => {
        if (p === 100) console.log("[remotion] Bundle complete");
      },
    });
  }
  return bundlePromise;
}

export async function renderMultiClip(
  plan: CompositionPlan,
  srtContents: string[]
): Promise<string> {
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const renderDir = join(RENDER_TEMP_BASE, jobId);
  await mkdir(renderDir, { recursive: true });

  const outputPath = join(renderDir, "output.mp4");
  const FPS = 30;

  try {
    const clipUrls = await Promise.all(
      plan.segments.map((seg) => getDownloadUrl(seg.clipKey))
    );

    const segments = plan.segments.map((seg, i) => ({
      clipUrl: clipUrls[i],
      startSeconds: seg.startSeconds,
      endSeconds: seg.endSeconds,
    }));

    const totalFrames = segments.reduce(
      (sum, s) => sum + Math.round((s.endSeconds - s.startSeconds) * FPS),
      0
    );

    const serveUrl = await getBundled();

    const inputProps = {
      segments,
      srtContents,
      hookText: plan.hookText,
      ctaText: plan.ctaText,
      durationInFrames: totalFrames,
    };

    const composition = await selectComposition({
      serveUrl,
      id: "MultiClip",
      inputProps,
    });

    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: outputPath,
      inputProps,
    });

    const outputBuffer = await readFile(outputPath);
    const outputKey = `renders/${jobId}/${plan.title.replace(/\s+/g, "-").toLowerCase()}.mp4`;
    await uploadBuffer(outputKey, outputBuffer, "video/mp4");

    return outputKey;
  } finally {
    await rm(renderDir, { recursive: true, force: true }).catch(() => {});
  }
}
