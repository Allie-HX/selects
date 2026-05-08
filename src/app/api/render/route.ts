import { writeFile, mkdir, readFile, unlink, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  selectComposition,
  getVideoMetadata,
} from "@remotion/renderer";

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

export async function POST(request: Request) {
  const formData = await request.formData();
  const videoFile = formData.get("video") as File | null;
  const srtContent = formData.get("srt") as string | null;

  if (!videoFile) {
    return Response.json({ error: "No video file provided" }, { status: 400 });
  }

  const renderId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const renderDir = join(RENDER_TEMP_BASE, renderId);
  await mkdir(renderDir, { recursive: true });

  const videoExt = videoFile.name.split(".").pop()?.toLowerCase() ?? "mp4";
  const inputPath = join(renderDir, `source.${videoExt}`);
  const outputPath = join(renderDir, "output.mp4");

  try {
    const buffer = Buffer.from(await videoFile.arrayBuffer());
    await writeFile(inputPath, buffer);

    const metadata = await getVideoMetadata(inputPath);
    const durationInSeconds = metadata.durationInSeconds ?? 30;
    const durationInFrames = Math.ceil(durationInSeconds * 30);

    const origin = new URL(request.url).origin;
    const videoUrl = `${origin}/api/render-assets/${renderId}/source.${videoExt}`;

    const serveUrl = await getBundled();

    const composition = await selectComposition({
      serveUrl,
      id: "SocialClip",
      inputProps: {
        videoUrl,
        srtContent: srtContent ?? "",
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
        srtContent: srtContent ?? "",
        durationInFrames,
      },
    });

    const outputBuffer = await readFile(outputPath);

    return new Response(outputBuffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${videoFile.name.replace(/\.[^.]+$/, "")}-social.mp4"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Render failed";
    console.error("[render] Error:", message);
    return Response.json({ error: message }, { status: 500 });
  } finally {
    await rm(renderDir, { recursive: true, force: true }).catch(() => {});
  }
}
