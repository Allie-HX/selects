import { writeFile, mkdir, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, getVideoMetadata } from "@remotion/renderer";
import { downloadToBuffer, uploadBuffer, getDownloadUrl } from "../storage/r2.js";
import type { RenderJobData, JobResult } from "../queue/setup.js";

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

export async function handleRenderJob(data: RenderJobData): Promise<JobResult> {
  const renderDir = join(RENDER_TEMP_BASE, data.jobId);
  await mkdir(renderDir, { recursive: true });

  const inputPath = join(renderDir, "source.mp4");
  const outputPath = join(renderDir, "output.mp4");

  try {
    const buffer = await downloadToBuffer(data.sourceKey);
    await writeFile(inputPath, buffer);

    const metadata = await getVideoMetadata(inputPath);
    const durationInSeconds = metadata.durationInSeconds ?? 30;
    const durationInFrames = Math.ceil(durationInSeconds * 30);

    const videoUrl = await getDownloadUrl(data.sourceKey);
    const serveUrl = await getBundled();

    const composition = await selectComposition({
      serveUrl,
      id: "SocialClip",
      inputProps: {
        videoUrl,
        srtContent: data.srtContent,
        durationInFrames,
      },
    });

    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: outputPath,
      inputProps: {
        videoUrl,
        srtContent: data.srtContent,
        durationInFrames,
      },
    });

    const outputBuffer = await readFile(outputPath);
    const outputKey = data.sourceKey.replace(/\.[^.]+$/, "-social.mp4");
    await uploadBuffer(outputKey, outputBuffer, "video/mp4");

    return { outputKey };
  } finally {
    await rm(renderDir, { recursive: true, force: true }).catch(() => {});
  }
}
