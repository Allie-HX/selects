import { writeFile, unlink, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { createReadStream } from "fs";
import OpenAI from "openai";
import ffmpegPath from "ffmpeg-static";
import { downloadToBuffer, uploadBuffer } from "../storage/r2.js";
import type { TranscribeJobData, JobResult } from "../queue/setup.js";

const execFileAsync = promisify(execFile);

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function buildSrt(segments: WhisperSegment[]): string {
  return segments
    .map(
      (seg, i) =>
        `${i + 1}\n${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}\n${seg.text.trim()}\n`
    )
    .join("\n");
}

export async function handleTranscribeJob(
  data: TranscribeJobData
): Promise<JobResult> {
  const tempDir = await mkdtemp(join(tmpdir(), "transcribe-"));
  const inputPath = join(tempDir, "source");
  const mp3Path = join(tempDir, "audio.mp3");

  try {
    const buffer = await downloadToBuffer(data.sourceKey);
    await writeFile(inputPath, buffer);

    if (!ffmpegPath) throw new Error("ffmpeg binary not found");

    await execFileAsync(ffmpegPath, [
      "-i", inputPath,
      "-vn", "-acodec", "libmp3lame", "-q:a", "4", "-y",
      mp3Path,
    ]);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(mp3Path),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    const text = transcription.text;
    const segments = (transcription.segments ?? []) as WhisperSegment[];
    const srt = buildSrt(segments);

    const basePath = data.sourceKey.replace(/\.[^.]+$/, "");
    await uploadBuffer(`${basePath}.txt`, Buffer.from(text), "text/plain");
    await uploadBuffer(`${basePath}.srt`, Buffer.from(srt), "text/srt");

    return { text, srt };
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(mp3Path).catch(() => {});
    const { rmdir } = await import("fs/promises");
    await rmdir(tempDir).catch(() => {});
  }
}
